BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS request_kind text;

UPDATE public.support_tickets
SET request_kind = CASE
  WHEN category = 'product_feedback' THEN 'request'
  WHEN impact = 'low' THEN 'question'
  ELSE 'incident'
END
WHERE request_kind IS NULL;

CREATE OR REPLACE FUNCTION public.assign_support_request_kind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.request_kind IS NULL THEN
    NEW.request_kind := CASE
      WHEN NEW.category = 'product_feedback' THEN 'request'
      WHEN NEW.impact = 'low' THEN 'question'
      ELSE 'incident'
    END;
  END IF;

  IF NEW.request_kind IN ('question', 'request') THEN
    NEW.impact := 'low';
    NEW.priority := 'low';
  ELSIF NEW.request_kind = 'incident' THEN
    NEW.priority := NEW.impact;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_assign_request_kind
  ON public.support_tickets;
CREATE TRIGGER support_tickets_assign_request_kind
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.assign_support_request_kind();

ALTER TABLE public.support_tickets
  ALTER COLUMN request_kind DROP DEFAULT,
  ALTER COLUMN request_kind SET NOT NULL;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_request_kind_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_request_kind_check
  CHECK (request_kind IN ('question', 'request', 'incident'));

CREATE OR REPLACE FUNCTION public.support_ticket_payload(target_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', ticket.id,
    'protocol', ticket.protocol,
    'requester_id', ticket.requester_id,
    'requester_role', ticket.requester_role,
    'requester_display_name', CASE
      WHEN ticket.requester_id IS NULL THEN NULL
      ELSE coalesce(requester.name, 'Usuário CutSync')
    END,
    'product', ticket.product,
    'request_kind', ticket.request_kind,
    'category', ticket.category,
    'subcategory', ticket.subcategory,
    'subject', ticket.subject,
    'impact', ticket.impact,
    'priority', ticket.priority,
    'status', ticket.status,
    'escalation_level', ticket.escalation_level,
    'team_id', ticket.team_id,
    'team_code', team.code,
    'team_name', team.name,
    'assignee_profile_id', ticket.assignee_profile_id,
    'assignee_name', coalesce(assignee.name, ticket.assignee_display_name),
    'assignee_display_name', coalesce(assignee.name, ticket.assignee_display_name),
    'establishment_id', ticket.establishment_id,
    'organization_id', ticket.organization_id,
    'appointment_id', ticket.appointment_id,
    'location_label', ticket.location_label,
    'location_address', ticket.location_address,
    'location_region', ticket.location_region,
    'location_state', ticket.location_state,
    'location_city', ticket.location_city,
    'routing_version', ticket.routing_version,
    'jsm_issue_key', ticket.jsm_issue_key,
    'jsm_issue_url', ticket.jsm_issue_url,
    'sync_status', ticket.sync_status,
    'last_sync_error_code', ticket.last_sync_error_code,
    'first_response_due_at', ticket.first_response_due_at,
    'first_responded_at', ticket.first_responded_at,
    'sla_breached', ticket.sla_breached,
    'last_message_at', ticket.last_message_at,
    'resolved_at', ticket.resolved_at,
    'closed_at', ticket.closed_at,
    'created_at', ticket.created_at,
    'updated_at', ticket.updated_at
  )
  FROM public.support_tickets AS ticket
  LEFT JOIN public.profiles AS requester ON requester.id = ticket.requester_id
  LEFT JOIN public.support_teams AS team ON team.id = ticket.team_id
  LEFT JOIN public.profiles AS assignee ON assignee.id = ticket.assignee_profile_id
  WHERE ticket.id = target_ticket_id;
$$;

CREATE OR REPLACE FUNCTION public.support_public_ticket_payload(
  target_ticket_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', ticket.id,
    'protocol', ticket.protocol,
    'subject', ticket.subject,
    'request_kind', ticket.request_kind,
    'category', ticket.category,
    'impact', ticket.impact,
    'priority', ticket.priority,
    'status', ticket.status,
    'sync_status', ticket.sync_status,
    'appointment_id', ticket.appointment_id,
    'created_at', ticket.created_at,
    'updated_at', ticket.updated_at,
    'last_message_at', ticket.last_message_at,
    'resolved_at', ticket.resolved_at
  )
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
    AND ticket.content_purged_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.create_support_ticket_internal_v2(
  actor_profile_id uuid,
  target_request_kind text,
  target_category text,
  target_impact text,
  target_subject text,
  initial_message text,
  target_appointment_id text,
  target_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_impact text;
  result_payload jsonb;
  target_ticket_id uuid;
  current_request_kind text;
BEGIN
  IF target_request_kind NOT IN ('question', 'request', 'incident') THEN
    RAISE EXCEPTION 'invalid_support_request_kind';
  END IF;
  IF target_category NOT IN (
    'access_identity',
    'booking',
    'marketplace',
    'security_privacy',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid_support_category';
  END IF;

  normalized_impact := CASE
    WHEN target_request_kind IN ('question', 'request') THEN 'low'
    ELSE target_impact
  END;

  IF target_request_kind = 'incident'
    AND normalized_impact NOT IN ('normal', 'high', 'critical') THEN
    RAISE EXCEPTION 'invalid_support_impact';
  END IF;
  IF target_request_kind IN ('question', 'request')
    AND target_impact <> 'low' THEN
    RAISE EXCEPTION 'invalid_support_impact';
  END IF;

  result_payload := public.create_support_ticket_internal(
    actor_profile_id,
    target_category,
    normalized_impact,
    target_subject,
    initial_message,
    target_appointment_id,
    target_idempotency_key
  );
  target_ticket_id := nullif(result_payload #>> '{ticket,id}', '')::uuid;
  IF target_ticket_id IS NULL THEN
    RAISE EXCEPTION 'support_operation_failed';
  END IF;

  SELECT ticket.request_kind
  INTO current_request_kind
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
  FOR UPDATE;

  IF coalesce((result_payload ->> 'idempotent')::boolean, false)
    AND current_request_kind <> target_request_kind THEN
    RAISE EXCEPTION 'invalid_support_idempotency_reuse';
  END IF;

  UPDATE public.support_tickets
  SET
    request_kind = target_request_kind,
    impact = normalized_impact,
    priority = normalized_impact,
    updated_at = now()
  WHERE id = target_ticket_id;

  RETURN jsonb_set(
    result_payload,
    '{ticket}',
    public.support_ticket_payload(target_ticket_id),
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_support_ticket_internal_v2(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_support_ticket_internal_v2(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO service_role;

COMMIT;
