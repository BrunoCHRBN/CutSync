BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE OR REPLACE FUNCTION public.list_business_decision_queue(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  can_request boolean;
  can_apply boolean;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  can_request := public.has_business_capability(
    target_establishment_id, actor_id, 'request_appointment_reassignment', 'full'
  );
  can_apply := public.has_business_capability(
    target_establishment_id, actor_id, 'apply_appointment_reassignment', 'full'
  );
  IF NOT can_request AND NOT can_apply THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.due_at, item.reassignment_request_id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      queue.due_at,
      queue.reassignment_request_id,
      jsonb_build_object(
        'reassignmentRequestId', queue.reassignment_request_id,
        'appointmentId', queue.appointment_id,
        'establishmentId', queue.establishment_id,
        'status', queue.status,
        'urgency', CASE
          WHEN queue.due_at <= now() THEN 'overdue'
          WHEN queue.due_at <= now() + interval '2 hours' THEN 'urgent'
          WHEN queue.due_at <= now() + interval '12 hours' THEN 'attention'
          ELSE 'normal'
        END,
        'responsibility', queue.responsibility,
        'dueAt', queue.due_at,
        'nextActorKind', queue.next_actor_kind,
        'customerDecisionRequired', queue.customer_decision_required,
        'monetaryImpact', queue.monetary_impact,
        'allowedActions', to_jsonb(CASE
          WHEN can_apply THEN ARRAY(
            SELECT action
            FROM unnest(queue.allowed_actions) AS action
            WHERE action = ANY(ARRAY['validate', 'propose', 'apply', 'review', 'withdraw'])
            ORDER BY action
          )
          WHEN workflow.initiated_by = actor_id THEN ARRAY(
            SELECT action
            FROM unnest(queue.allowed_actions) AS action
            WHERE action = ANY(ARRAY['validate', 'withdraw'])
            ORDER BY action
          )
          ELSE ARRAY[]::text[]
        END),
        'correlationId', queue.correlation_id,
        'version', queue.version,
        'dataCutoffAt', now(),
        'appointmentStartsAt', appointment.date_time,
        'clientDisplayName', COALESCE(
          establishment_client.display_name,
          NULLIF(btrim(appointment.client_name), ''),
          client_profile.name,
          'Cliente'
        ),
        'serviceName', service.name,
        'currentProfessionalName', current_professional.name,
        'proposedProfessionalName', proposed_professional.name
      ) AS payload
    FROM public.decision_queue_items AS queue
    JOIN public.appointment_reassignment_requests AS workflow
      ON workflow.id = queue.reassignment_request_id
    JOIN public.appointments AS appointment ON appointment.id = queue.appointment_id
    JOIN public.services AS service ON service.id = appointment.service_id
    JOIN public.profiles AS current_professional ON current_professional.id = appointment.professional_id
    LEFT JOIN public.profiles AS proposed_professional
      ON proposed_professional.id = workflow.proposed_professional_id
    LEFT JOIN public.profiles AS client_profile ON client_profile.id = appointment.client_id
    LEFT JOIN public.establishment_clients AS establishment_client
      ON establishment_client.id = appointment.establishment_client_id
    WHERE queue.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND (
        can_apply
        OR workflow.initiated_by = actor_id
        OR appointment.professional_id = actor_id
      )
  ) AS item;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_reassignment_detail(
  target_establishment_id uuid,
  target_reassignment_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  queue public.decision_queue_items%ROWTYPE;
  can_request boolean;
  can_apply boolean;
  caller_actions text[] := ARRAY[]::text[];
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id
    AND request.establishment_id = target_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reassignment_request_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS candidate
  WHERE candidate.id = workflow.appointment_id
    AND candidate.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  can_request := public.has_business_capability(
    target_establishment_id, actor_id, 'request_appointment_reassignment', 'full'
  );
  can_apply := public.has_business_capability(
    target_establishment_id, actor_id, 'apply_appointment_reassignment', 'full'
  );
  IF NOT can_apply AND NOT (
    can_request
    AND (workflow.initiated_by = actor_id OR appointment.professional_id = actor_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO queue
  FROM public.decision_queue_items AS item
  WHERE item.reassignment_request_id = workflow.id;

  IF FOUND THEN
    IF can_apply THEN
      caller_actions := ARRAY(
        SELECT action
        FROM unnest(queue.allowed_actions) AS action
        WHERE action = ANY(ARRAY['validate', 'propose', 'apply', 'review', 'withdraw'])
        ORDER BY action
      );
    ELSIF workflow.initiated_by = actor_id THEN
      caller_actions := ARRAY(
        SELECT action
        FROM unnest(queue.allowed_actions) AS action
        WHERE action = ANY(ARRAY['validate', 'withdraw'])
        ORDER BY action
      );
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'reassignmentRequestId', workflow.id,
    'appointmentId', workflow.appointment_id,
    'establishmentId', workflow.establishment_id,
    'status', workflow.status,
    'responsibility', workflow.responsibility,
    'reasonCode', workflow.reason_code,
    'dueAt', workflow.due_at,
    'customerDecisionRequired', workflow.customer_decision_required,
    'monetaryImpact', COALESCE((workflow.proposed_condition->>'monetaryImpact')::boolean, false),
    'previousCondition', workflow.previous_condition,
    'proposedCondition', workflow.proposed_condition,
    'allowedActions', to_jsonb(caller_actions),
    'correlationId', workflow.correlation_id,
    'version', workflow.version,
    'dataCutoffAt', now(),
    'appointmentStartsAt', appointment.date_time,
    'appointmentEndsAt', appointment.ends_at,
    'clientDisplayName', COALESCE(
      establishment_client.display_name,
      NULLIF(btrim(appointment.client_name), ''),
      client_profile.name,
      'Cliente'
    ),
    'serviceName', service.name,
    'currentProfessional', jsonb_build_object(
      'id', current_professional.id,
      'name', current_professional.name
    ),
    'proposedProfessional', CASE WHEN proposed_professional.id IS NULL THEN NULL ELSE
      jsonb_build_object('id', proposed_professional.id, 'name', proposed_professional.name)
    END,
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'appointmentId', event.appointment_id,
        'establishmentId', event.establishment_id,
        'reassignmentRequestId', event.reassignment_request_id,
        'assignmentId', event.assignment_id,
        'eventType', event.event_type,
        'actorId', event.actor_id,
        'actorKind', event.actor_kind,
        'requestId', event.request_id,
        'correlationId', event.correlation_id,
        'previousVersion', event.previous_version,
        'resultingVersion', event.resulting_version,
        'occurredAt', event.occurred_at
      ) ORDER BY event.occurred_at, event.id)
      FROM public.appointment_assignment_events AS event
      WHERE event.reassignment_request_id = workflow.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.services AS service
  JOIN public.profiles AS current_professional ON current_professional.id = appointment.professional_id
  LEFT JOIN public.profiles AS proposed_professional
    ON proposed_professional.id = workflow.proposed_professional_id
  LEFT JOIN public.profiles AS client_profile ON client_profile.id = appointment.client_id
  LEFT JOIN public.establishment_clients AS establishment_client
    ON establishment_client.id = appointment.establishment_client_id
  WHERE service.id = appointment.service_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_business_reassignment_candidates(
  target_establishment_id uuid,
  target_reassignment_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  target_timezone text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'apply_appointment_reassignment', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id
    AND request.establishment_id = target_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reassignment_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF workflow.status <> 'awaiting_manager' THEN
    RAISE EXCEPTION 'reassignment_not_proposable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id
    AND target.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  SELECT COALESCE(jsonb_agg(candidate.payload ORDER BY candidate.name, candidate.profile_id), '[]'::jsonb)
  INTO result
  FROM (
    SELECT
      profile.id AS profile_id,
      profile.name,
      jsonb_build_object(
        'profileId', profile.id,
        'name', profile.name,
        'priceCents', round(professional_service.price * 100)::bigint,
        'monetaryImpact', round(professional_service.price * 100)::bigint
          <> round(appointment.price_charged * 100)::bigint
      ) AS payload
    FROM public.memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.profile_id
    JOIN public.professional_services AS professional_service
      ON professional_service.establishment_id = membership.establishment_id
     AND professional_service.professional_id = membership.profile_id
     AND professional_service.service_id = appointment.service_id
     AND professional_service.is_active
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
      AND membership.profile_id <> appointment.professional_id
      AND EXISTS (
        SELECT 1
        FROM public.compute_available_slots(
          target_establishment_id,
          membership.profile_id,
          appointment.service_id,
          (appointment.date_time AT TIME ZONE target_timezone)::date,
          appointment.id
        ) AS slot
        WHERE slot.starts_at = appointment.date_time
          AND slot.available
      )
  ) AS candidate;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_client_reassignment_decisions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT COALESCE(
    jsonb_agg(item.payload ORDER BY item.due_at, item.reassignment_request_id),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT
      workflow.due_at,
      workflow.id AS reassignment_request_id,
      jsonb_build_object(
        'reassignmentRequestId', workflow.id,
        'appointmentId', appointment.id,
        'status', workflow.status,
        'dueAt', workflow.due_at,
        'responsibility', workflow.responsibility,
        'appointmentStartsAt', appointment.date_time,
        'establishmentName', establishment.name,
        'establishmentTimezone', establishment.timezone,
        'serviceName', service.name,
        'currentProfessionalName', previous_professional.name,
        'proposedProfessionalName', proposed_professional.name,
        'monetaryImpact', COALESCE(
          (workflow.proposed_condition->>'monetaryImpact')::boolean,
          false
        ),
        'allowedActions', to_jsonb(CASE
          WHEN workflow.status = 'awaiting_customer' AND workflow.due_at > now()
            THEN ARRAY[
              'accept_replacement', 'choose_professional',
              'reschedule_original', 'cancel_due_to_change'
            ]::text[]
          ELSE ARRAY[]::text[]
        END),
        'version', workflow.version,
        'correlationId', workflow.correlation_id,
        'dataCutoffAt', now()
      ) AS payload
    FROM public.appointment_reassignment_requests AS workflow
    JOIN public.appointments AS appointment
      ON appointment.id = workflow.appointment_id
     AND appointment.client_id = actor_id
     AND appointment.deleted_at IS NULL
    JOIN public.establishments AS establishment
      ON establishment.id = workflow.establishment_id
    JOIN public.services AS service ON service.id = appointment.service_id
    JOIN public.profiles AS previous_professional
      ON previous_professional.id = NULLIF(
        workflow.previous_condition->>'professionalId', ''
      )::uuid
    LEFT JOIN public.profiles AS proposed_professional
      ON proposed_professional.id = workflow.proposed_professional_id
    WHERE workflow.status = 'awaiting_customer'
  ) AS item;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_reassignment_detail(
  target_appointment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  result jsonb;
  caller_actions text[] := ARRAY[]::text[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS candidate
  WHERE candidate.id = target_appointment_id
    AND candidate.client_id = actor_id
    AND candidate.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.appointment_id = appointment.id
  ORDER BY request.created_at DESC, request.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF workflow.status = 'awaiting_customer' AND workflow.due_at > now() THEN
    caller_actions := ARRAY[
      'accept_replacement', 'choose_professional',
      'reschedule_original', 'cancel_due_to_change'
    ]::text[];
  END IF;

  SELECT jsonb_build_object(
    'reassignmentRequestId', workflow.id,
    'appointmentId', workflow.appointment_id,
    'establishmentId', workflow.establishment_id,
    'establishmentName', establishment.name,
    'establishmentTimezone', establishment.timezone,
    'currency', establishment.currency,
    'status', workflow.status,
    'responsibility', workflow.responsibility,
    'reasonCode', workflow.reason_code,
    'dueAt', workflow.due_at,
    'customerDecisionRequired', workflow.customer_decision_required,
    'monetaryImpact', COALESCE(
      (workflow.proposed_condition->>'monetaryImpact')::boolean,
      false
    ),
    'previousCondition', workflow.previous_condition,
    'proposedCondition', workflow.proposed_condition,
    'allowedActions', to_jsonb(caller_actions),
    'correlationId', workflow.correlation_id,
    'version', workflow.version,
    'dataCutoffAt', now(),
    'appointmentStartsAt', appointment.date_time,
    'appointmentEndsAt', appointment.ends_at,
    'serviceName', service.name,
    'currentProfessional', jsonb_build_object(
      'id', previous_professional.id,
      'name', previous_professional.name
    ),
    'proposedProfessional', CASE
      WHEN proposed_professional.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', proposed_professional.id,
        'name', proposed_professional.name
      )
    END,
    'initiatedByKind', COALESCE((
      SELECT requested_event.actor_kind
      FROM public.appointment_assignment_events AS requested_event
      WHERE requested_event.reassignment_request_id = workflow.id
        AND requested_event.event_type = 'reassignment.requested'
      ORDER BY requested_event.occurred_at, requested_event.id
      LIMIT 1
    ), 'staff'),
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'appointmentId', event.appointment_id,
        'establishmentId', event.establishment_id,
        'reassignmentRequestId', event.reassignment_request_id,
        'assignmentId', event.assignment_id,
        'eventType', event.event_type,
        'actorId', event.actor_id,
        'actorKind', event.actor_kind,
        'requestId', event.request_id,
        'correlationId', event.correlation_id,
        'previousVersion', event.previous_version,
        'resultingVersion', event.resulting_version,
        'occurredAt', event.occurred_at
      ) ORDER BY event.occurred_at, event.id)
      FROM public.appointment_assignment_events AS event
      WHERE event.reassignment_request_id = workflow.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.establishments AS establishment
  JOIN public.services AS service ON service.id = appointment.service_id
  JOIN public.profiles AS previous_professional
    ON previous_professional.id = NULLIF(
      workflow.previous_condition->>'professionalId', ''
    )::uuid
  LEFT JOIN public.profiles AS proposed_professional
    ON proposed_professional.id = workflow.proposed_professional_id
  WHERE establishment.id = workflow.establishment_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_client_reassignment_candidates(
  target_reassignment_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  target_timezone text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reassignment_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF workflow.status <> 'awaiting_customer' OR workflow.due_at <= now() THEN
    RAISE EXCEPTION 'reassignment_not_awaiting_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id
    AND target.client_id = actor_id
    AND target.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments AS establishment
  WHERE establishment.id = workflow.establishment_id;

  SELECT COALESCE(
    jsonb_agg(candidate.payload ORDER BY candidate.name, candidate.profile_id),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT
      profile.id AS profile_id,
      profile.name,
      jsonb_build_object(
        'profileId', profile.id,
        'name', profile.name,
        'priceCents', round(professional_service.price * 100)::bigint,
        'monetaryImpact', round(professional_service.price * 100)::bigint
          <> round(appointment.price_charged * 100)::bigint
      ) AS payload
    FROM public.memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.profile_id
    JOIN public.professional_services AS professional_service
      ON professional_service.establishment_id = membership.establishment_id
     AND professional_service.professional_id = membership.profile_id
     AND professional_service.service_id = appointment.service_id
     AND professional_service.is_active
    WHERE membership.establishment_id = workflow.establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
      AND membership.profile_id <> appointment.professional_id
      AND membership.profile_id IS DISTINCT FROM workflow.proposed_professional_id
      AND EXISTS (
        SELECT 1
        FROM public.compute_available_slots(
          workflow.establishment_id,
          membership.profile_id,
          appointment.service_id,
          (appointment.date_time AT TIME ZONE target_timezone)::date,
          appointment.id
        ) AS slot
        WHERE slot.starts_at = appointment.date_time
          AND slot.available
      )
  ) AS candidate;

  RETURN result;
END;
$$;

ALTER TABLE public.client_push_deliveries
  DROP CONSTRAINT IF EXISTS client_push_deliveries_event_type_check;
ALTER TABLE public.client_push_deliveries
  ADD CONSTRAINT client_push_deliveries_event_type_check CHECK (event_type IN (
    'appointment_received',
    'appointment_confirmed',
    'appointment_rescheduled',
    'appointment_cancelled',
    'appointment_reminder',
    'appointment_reassignment_decision_required',
    'appointment_reassignment_updated'
  ));

CREATE OR REPLACE FUNCTION public.enqueue_client_reassignment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
  workflow public.appointment_reassignment_requests%ROWTYPE;
  target_event_type text;
  target_title text;
  target_body text;
  establishment_name text;
BEGIN
  IF NEW.reassignment_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = NEW.reassignment_request_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id
    AND target.client_id IS NOT NULL
    AND target.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'reassignment.proposed'
    AND workflow.status = 'awaiting_customer'
  THEN
    target_event_type := 'appointment_reassignment_decision_required';
    target_title := 'Sua decisão é necessária';
    target_body := 'O estabelecimento propôs uma alteração de profissional. Revise antes de decidir.';
  ELSIF NEW.event_type IN (
      'reassignment.applied',
      'reassignment.withdrawn',
      'reassignment.expired'
    )
    OR (
      NEW.event_type = 'reassignment.customer_decided'
      AND NEW.actor_kind <> 'customer'
    )
  THEN
    target_event_type := 'appointment_reassignment_updated';
    target_title := 'Alteração do atendimento atualizada';
    target_body := 'Há uma nova atualização sobre a alteração de profissional do seu atendimento.';
  ELSE
    RETURN NEW;
  END IF;

  SELECT establishment.name INTO establishment_name
  FROM public.establishments AS establishment
  WHERE establishment.id = workflow.establishment_id;
  target_body := target_body || ' ' || COALESCE(establishment_name, '');

  INSERT INTO public.client_push_deliveries (
    event_key,
    event_type,
    profile_id,
    push_device_id,
    appointment_id,
    title,
    body,
    payload
  )
  SELECT
    'reassignment:' || NEW.id::text || ':' || target_event_type,
    target_event_type,
    appointment.client_id,
    device.id,
    appointment.id,
    target_title,
    left(btrim(target_body), 500),
    jsonb_build_object(
      'appointmentId', appointment.id,
      'reassignmentRequestId', workflow.id,
      'eventType', target_event_type,
      'correlationId', NEW.correlation_id,
      'url', '/appointments/' || appointment.id
    )
  FROM public.profiles AS profile
  JOIN public.push_devices AS device
    ON device.profile_id = profile.id
   AND device.app_kind = 'client'
   AND device.enabled
  WHERE profile.id = appointment.client_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_client_reassignment_push_trigger
  ON public.appointment_assignment_events;
CREATE TRIGGER enqueue_client_reassignment_push_trigger
AFTER INSERT ON public.appointment_assignment_events
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_client_reassignment_push();

REVOKE ALL ON FUNCTION public.list_business_decision_queue(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_business_reassignment_detail(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_business_reassignment_candidates(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_client_reassignment_decisions()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_reassignment_detail(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_client_reassignment_candidates(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_client_reassignment_push()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_business_decision_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_reassignment_detail(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_business_reassignment_candidates(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_client_reassignment_decisions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_reassignment_detail(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_client_reassignment_candidates(uuid) TO authenticated;

COMMENT ON FUNCTION public.list_business_decision_queue(uuid) IS
  'Phase 3 Business decision queue read model. Revalidates capability and scope and returns caller-specific allowedActions.';
COMMENT ON FUNCTION public.get_business_reassignment_detail(uuid, uuid) IS
  'Phase 3 Business reassignment detail and immutable timeline read model. No direct table access is granted to apps.';
COMMENT ON FUNCTION public.list_business_reassignment_candidates(uuid, uuid) IS
  'Phase 3 qualified and available replacement candidates. Capability and unit scope are revalidated server-side.';
COMMENT ON FUNCTION public.list_client_reassignment_decisions() IS
  'Phase 3 pending reassignment decisions owned by the authenticated Client user. allowedActions is authoritative.';
COMMENT ON FUNCTION public.get_client_reassignment_detail(text) IS
  'Phase 3 latest reassignment detail and immutable timeline for an appointment owned by the authenticated Client user.';
COMMENT ON FUNCTION public.list_client_reassignment_candidates(uuid) IS
  'Phase 3 qualified and available alternative professionals scoped to the authenticated Client appointment.';
COMMENT ON FUNCTION public.enqueue_client_reassignment_push() IS
  'Phase 3 immutable reassignment event bridge to the existing idempotent Client push delivery queue.';

COMMIT;
