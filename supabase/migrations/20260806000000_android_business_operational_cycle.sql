BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Android-first operational cycle. This migration deliberately leaves the
-- platform-billing switches untouched: the existing free-beta/courtesy access
-- policy remains authoritative and enforcement_enabled is not enabled here.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Schema foundations
-- ---------------------------------------------------------------------------

CREATE TABLE public.command_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  command_type text NOT NULL CHECK (
    command_type ~ '^[a-z][a-z0-9_.]{2,79}$'
  ),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_payload jsonb CHECK (
    response_payload IS NULL OR jsonb_typeof(response_payload) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT command_receipts_completion_check CHECK (
    (response_payload IS NULL AND completed_at IS NULL)
    OR (response_payload IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX command_receipts_establishment_created_idx
  ON public.command_receipts (establishment_id, created_at DESC);
CREATE INDEX command_receipts_actor_created_idx
  ON public.command_receipts (actor_id, created_at DESC);

CREATE TABLE public.mobile_app_release_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_kind text NOT NULL CHECK (app_kind IN ('client', 'business')),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  minimum_supported_version text NOT NULL CHECK (
    minimum_supported_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  latest_version text NOT NULL CHECK (
    latest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  enforcement_enabled boolean NOT NULL DEFAULT false,
  store_url text CHECK (store_url IS NULL OR store_url ~ '^https://'),
  message text CHECK (message IS NULL OR char_length(message) <= 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (app_kind, platform)
);

INSERT INTO public.mobile_app_release_policies (
  app_kind,
  platform,
  minimum_supported_version,
  latest_version,
  enforcement_enabled
)
VALUES
  ('business', 'android', '0.1.0', '0.1.0', false),
  ('client', 'android', '0.2.0', '0.2.0', false)
ON CONFLICT (app_kind, platform) DO NOTHING;

CREATE TABLE public.establishment_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  phone text CHECK (phone IS NULL OR char_length(phone) BETWEEN 8 AND 32),
  email text CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 254),
  tags text[] NOT NULL DEFAULT ARRAY[]::text[] CHECK (
    cardinality(tags) <= 20 AND array_position(tags, NULL) IS NULL
  ),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged')),
  merged_into_id uuid REFERENCES public.establishment_clients(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT establishment_clients_merge_state_check CHECK (
    (status = 'active' AND merged_into_id IS NULL)
    OR (status = 'merged' AND merged_into_id IS NOT NULL AND merged_into_id <> id)
  )
);

CREATE INDEX establishment_clients_directory_idx
  ON public.establishment_clients (establishment_id, lower(display_name), id)
  WHERE status = 'active';
CREATE INDEX establishment_clients_phone_idx
  ON public.establishment_clients (establishment_id, phone)
  WHERE status = 'active' AND phone IS NOT NULL;
CREATE INDEX establishment_clients_email_idx
  ON public.establishment_clients (establishment_id, lower(email))
  WHERE status = 'active' AND email IS NOT NULL;

CREATE TABLE public.establishment_client_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_client_id uuid NOT NULL
    REFERENCES public.establishment_clients(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_kind text NOT NULL CHECK (match_kind IN ('confirmed_email', 'confirmed_phone', 'manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (establishment_client_id, profile_id),
  CONSTRAINT establishment_client_links_response_check CHECK (
    (status = 'pending' AND responded_at IS NULL AND confirmed_at IS NULL)
    OR (status = 'confirmed' AND responded_at IS NOT NULL AND confirmed_at IS NOT NULL)
    OR (status = 'rejected' AND responded_at IS NOT NULL AND confirmed_at IS NULL)
  )
);

CREATE UNIQUE INDEX establishment_client_links_one_confirmed_client_idx
  ON public.establishment_client_links (establishment_client_id)
  WHERE status = 'confirmed';
-- Consent (including rejection) is establishment-scoped. A second local CRM
-- row must not re-present the same identity candidate in the same unit.
CREATE UNIQUE INDEX establishment_client_links_one_profile_per_unit_idx
  ON public.establishment_client_links (establishment_id, profile_id);
CREATE INDEX establishment_client_links_profile_pending_idx
  ON public.establishment_client_links (profile_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX establishment_client_links_requested_by_idx
  ON public.establishment_client_links (requested_by);

CREATE TABLE public.establishment_client_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  survivor_client_id uuid NOT NULL REFERENCES public.establishment_clients(id) ON DELETE RESTRICT,
  duplicate_client_id uuid NOT NULL REFERENCES public.establishment_clients(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason_provided boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (survivor_client_id <> duplicate_client_id)
);

CREATE TABLE public.appointment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'created', 'confirmed', 'completed', 'cancelled', 'rescheduled',
    'no_show', 'client_linked'
  )),
  previous_status text,
  resulting_status text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX appointment_events_appointment_created_idx
  ON public.appointment_events (appointment_id, created_at DESC, id DESC);
CREATE INDEX appointment_events_establishment_created_idx
  ON public.appointment_events (establishment_id, created_at DESC);
CREATE INDEX appointment_events_actor_created_idx
  ON public.appointment_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;
CREATE INDEX establishment_client_merge_events_survivor_idx
  ON public.establishment_client_merge_events (survivor_client_id);
CREATE INDEX establishment_client_merge_events_duplicate_idx
  ON public.establishment_client_merge_events (duplicate_client_id);
CREATE INDEX establishment_client_merge_events_actor_idx
  ON public.establishment_client_merge_events (actor_id);

CREATE OR REPLACE FUNCTION public.is_safe_business_push_payload(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND jsonb_typeof(value->'eventType') = 'string'
    AND jsonb_typeof(value->'establishmentId') = 'string'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(value) AS item
      WHERE item.key <> ALL (ARRAY[
        'eventType', 'establishmentId', 'appointmentId',
        'invitationId', 'professionalId'
      ]::text[])
        OR jsonb_typeof(item.value) <> 'string'
    );
$$;

CREATE TABLE public.business_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'appointment_created', 'appointment_cancelled',
    'appointment_rescheduled', 'invitation_created', 'operational_conflict'
  )),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_device_id uuid NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  appointment_id text REFERENCES public.appointments(id) ON DELETE CASCADE,
  invitation_id uuid REFERENCES public.establishment_invites(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  payload jsonb NOT NULL CHECK (public.is_safe_business_push_payload(payload)),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'ticketed', 'sent', 'failed', 'skipped'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  expo_ticket_id text,
  ticketed_at timestamptz,
  receipt_checked_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_key, push_device_id),
  CONSTRAINT business_push_delivery_target_check CHECK (
    payload->>'eventType' = event_type
    AND payload->>'establishmentId' = establishment_id::text
    AND (appointment_id IS NULL OR payload->>'appointmentId' = appointment_id)
    AND (invitation_id IS NULL OR payload->>'invitationId' = invitation_id::text)
    AND CASE
      WHEN event_type = 'invitation_created' THEN
        invitation_id IS NOT NULL AND appointment_id IS NULL
          AND payload ? 'invitationId' AND NOT (payload ? 'professionalId')
      WHEN event_type = 'operational_conflict' THEN
        invitation_id IS NULL AND payload ? 'professionalId'
      ELSE
        appointment_id IS NOT NULL AND invitation_id IS NULL
          AND NOT (payload ? 'professionalId')
    END
  )
);

CREATE INDEX business_push_deliveries_pending_idx
  ON public.business_push_deliveries (available_at, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX business_push_deliveries_receipts_idx
  ON public.business_push_deliveries (ticketed_at, receipt_checked_at)
  WHERE status = 'ticketed';
CREATE INDEX business_push_deliveries_profile_created_idx
  ON public.business_push_deliveries (profile_id, created_at DESC);
CREATE INDEX business_push_deliveries_device_created_idx
  ON public.business_push_deliveries (push_device_id, created_at DESC);
CREATE INDEX business_push_deliveries_establishment_created_idx
  ON public.business_push_deliveries (establishment_id, created_at DESC);
CREATE INDEX business_push_deliveries_appointment_idx
  ON public.business_push_deliveries (appointment_id)
  WHERE appointment_id IS NOT NULL;
CREATE INDEX business_push_deliveries_invitation_idx
  ON public.business_push_deliveries (invitation_id)
  WHERE invitation_id IS NOT NULL;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS establishment_client_id uuid
    REFERENCES public.establishment_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS business_notes text;
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_business_notes_length_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_business_notes_length_check CHECK (
    business_notes IS NULL OR char_length(business_notes) <= 2000
  );
COMMENT ON COLUMN public.appointments.business_notes IS
  'Operational note scoped to this appointment. Never copied into CRM notes, receipts, events, or push payloads.';
CREATE INDEX IF NOT EXISTS appointments_establishment_client_idx
  ON public.appointments (establishment_client_id, date_time DESC)
  WHERE establishment_client_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_establishment_client_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.establishment_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.establishment_clients AS client
    WHERE client.id = NEW.establishment_client_id
      AND client.establishment_id = NEW.establishment_id
  ) THEN RAISE EXCEPTION 'establishment_client_tenant_mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_appointment_establishment_client_tenant
BEFORE INSERT OR UPDATE OF establishment_client_id, establishment_id
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_establishment_client_tenant();

CREATE OR REPLACE FUNCTION public.enforce_establishment_client_link_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.establishment_clients AS client
    WHERE client.id = NEW.establishment_client_id
      AND client.establishment_id = NEW.establishment_id
  ) THEN RAISE EXCEPTION 'establishment_client_link_tenant_mismatch'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_establishment_client_link_tenant
BEFORE INSERT OR UPDATE OF establishment_client_id, establishment_id
ON public.establishment_client_links
FOR EACH ROW EXECUTE FUNCTION public.enforce_establishment_client_link_tenant();

ALTER TABLE public.schedule_blocks
  ADD COLUMN IF NOT EXISTS is_all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_date date;
ALTER TABLE public.schedule_blocks
  DROP CONSTRAINT IF EXISTS schedule_blocks_all_day_check;
ALTER TABLE public.schedule_blocks
  ADD CONSTRAINT schedule_blocks_all_day_check CHECK (
    (NOT is_all_day AND local_date IS NULL)
    OR (is_all_day AND local_date IS NOT NULL)
  );

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS sort_order integer;
UPDATE public.services SET sort_order = 0 WHERE sort_order IS NULL;
ALTER TABLE public.services ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.services ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check CHECK (
    status IN ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')
  );

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_status_check;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_status_check CHECK (
    status IN ('active', 'suspended', 'revoked')
  );

ALTER TABLE public.client_push_deliveries
  ADD COLUMN IF NOT EXISTS establishment_client_link_id uuid
    REFERENCES public.establishment_client_links(id) ON DELETE CASCADE;
ALTER TABLE public.client_push_deliveries
  ALTER COLUMN appointment_id DROP NOT NULL;
ALTER TABLE public.client_push_deliveries
  DROP CONSTRAINT IF EXISTS client_push_deliveries_event_type_check;
ALTER TABLE public.client_push_deliveries
  ADD CONSTRAINT client_push_deliveries_event_type_check CHECK (event_type IN (
    'appointment_received', 'appointment_confirmed', 'appointment_rescheduled',
    'appointment_cancelled', 'appointment_reminder', 'appointment_no_show',
    'establishment_client_link_requested'
  ));
ALTER TABLE public.client_push_deliveries
  DROP CONSTRAINT IF EXISTS client_push_deliveries_target_check;
ALTER TABLE public.client_push_deliveries
  ADD CONSTRAINT client_push_deliveries_target_check CHECK (
    appointment_id IS NOT NULL OR establishment_client_link_id IS NOT NULL
  );

-- Sensitive operational state is RPC-only. service_role is used by queue
-- workers and deployment/reconciliation jobs.
ALTER TABLE public.command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_app_release_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_client_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_client_merge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.command_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mobile_app_release_policies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.establishment_clients FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.establishment_client_links FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.establishment_client_merge_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.appointment_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.business_push_deliveries FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.command_receipts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobile_app_release_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishment_clients TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.establishment_client_links TO service_role;
GRANT SELECT, INSERT ON public.establishment_client_merge_events TO service_role;
GRANT SELECT, INSERT ON public.appointment_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_push_deliveries TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.appointment_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.reject_immutable_mobile_record()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '%_is_immutable', TG_TABLE_NAME;
END;
$$;

-- ---------------------------------------------------------------------------
-- Appointment history and protected operational commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.capture_appointment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_event_type text;
  event_metadata jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    next_event_type := 'created';
    event_metadata := jsonb_build_object(
      'startsAt', NEW.date_time,
      'endsAt', NEW.ends_at,
      'professionalId', NEW.professional_id,
      'serviceId', NEW.service_id
    );
  ELSIF NEW.establishment_client_id IS DISTINCT FROM OLD.establishment_client_id
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
  THEN
    next_event_type := 'client_linked';
    event_metadata := jsonb_strip_nulls(jsonb_build_object(
      'establishmentClientId', NEW.establishment_client_id,
      'profileId', NEW.client_id
    ));
  ELSIF NEW.date_time IS DISTINCT FROM OLD.date_time
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
  THEN
    next_event_type := 'rescheduled';
    event_metadata := jsonb_build_object(
      'previousStartsAt', OLD.date_time,
      'startsAt', NEW.date_time,
      'endsAt', NEW.ends_at,
      'professionalId', NEW.professional_id,
      'serviceId', NEW.service_id
    );
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    next_event_type := CASE NEW.status
      WHEN 'confirmed' THEN 'confirmed'
      WHEN 'completed' THEN 'completed'
      WHEN 'cancelled' THEN 'cancelled'
      WHEN 'no_show' THEN 'no_show'
      ELSE NULL
    END;
    IF next_event_type = 'cancelled' THEN
      event_metadata := jsonb_build_object(
        'reasonCode', NEW.cancellation_reason_code,
        'reasonProvided', NEW.cancellation_note_internal IS NOT NULL
      );
    END IF;
  END IF;

  IF next_event_type IS NOT NULL THEN
    INSERT INTO public.appointment_events (
      appointment_id,
      establishment_id,
      actor_id,
      event_type,
      previous_status,
      resulting_status,
      metadata
    ) VALUES (
      NEW.id,
      NEW.establishment_id,
      COALESCE(
        (SELECT auth.uid()),
        NULLIF(current_setting('app.mobile_link_actor_id', true), '')::uuid
      ),
      next_event_type,
      CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
      NEW.status,
      jsonb_strip_nulls(event_metadata)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_appointment_event_trigger
AFTER INSERT OR UPDATE OF
  status, date_time, ends_at, professional_id, service_id,
  establishment_client_id, client_id
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.capture_appointment_event();

CREATE OR REPLACE FUNCTION public.can_view_business_appointment(
  target_establishment_id uuid,
  target_professional_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.is_superadmin()
    OR public.has_business_capability(target_establishment_id, 'view_team_agenda')
    OR (
      target_professional_id = (SELECT auth.uid())
      AND public.has_business_capability(target_establishment_id, 'view_own_agenda')
    );
$$;

CREATE OR REPLACE FUNCTION public.get_business_appointment_detail(
  target_establishment_id uuid,
  target_appointment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  appointment_record public.appointments%ROWTYPE;
  actor_can_manage_clients boolean;
  actor_can_write boolean;
  actor_is_business_admin boolean;
  actor_can_view_sensitive_detail boolean;
  allowed_actions jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO appointment_record
  FROM public.appointments
  WHERE id = target_appointment_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL;
  IF appointment_record.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF NOT public.can_view_business_appointment(
    target_establishment_id, appointment_record.professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  actor_can_manage_clients := public.has_business_capability(
    target_establishment_id, 'manage_clients'
  ) OR public.is_superadmin();
  actor_can_write := public.can_operate_business_appointment(
    target_establishment_id, appointment_record.professional_id
  );
  actor_is_business_admin := public.is_superadmin()
    OR public.is_business_administrator(target_establishment_id, false);
  actor_can_view_sensitive_detail := actor_can_write OR actor_is_business_admin;

  IF actor_can_write AND appointment_record.status = 'pending' THEN
    allowed_actions := '["confirm","cancel"]'::jsonb;
    IF appointment_record.date_time > now() THEN
      allowed_actions := allowed_actions || '"reschedule"'::jsonb;
    END IF;
  ELSIF actor_can_write AND appointment_record.status = 'confirmed' THEN
    allowed_actions := '["complete","cancel"]'::jsonb;
    IF appointment_record.date_time > now() THEN
      allowed_actions := allowed_actions || '"reschedule"'::jsonb;
    END IF;
    IF appointment_record.date_time <= now() THEN
      allowed_actions := allowed_actions || '"no_show"'::jsonb;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'appointmentId', appointment.id,
    'establishmentId', appointment.establishment_id,
    'status', appointment.status,
    'startsAt', appointment.date_time,
    'endsAt', appointment.ends_at,
    'durationMinutes', appointment.duration_minutes,
    'notes', CASE WHEN actor_can_view_sensitive_detail
      THEN appointment.business_notes END,
    'service', jsonb_build_object(
      'id', service.id,
      'name', service.name,
      'listPrice', service.price
    ),
    'professional', jsonb_build_object(
      'id', professional.id,
      'name', professional.name
    ),
    'client', jsonb_strip_nulls(jsonb_build_object(
      'establishmentClientId', CASE WHEN actor_can_view_sensitive_detail
        THEN establishment_client.id END,
      'profileId', CASE WHEN actor_can_view_sensitive_detail
        THEN appointment.client_id END,
      'displayName', CASE WHEN actor_can_view_sensitive_detail THEN COALESCE(
          establishment_client.display_name,
          NULLIF(btrim(appointment.client_name), ''),
          client_profile.name,
          'Cliente'
        ) ELSE 'Cliente' END,
      'phone', CASE WHEN actor_can_manage_clients THEN establishment_client.phone END,
      'email', CASE WHEN actor_can_manage_clients THEN establishment_client.email END,
      'tags', CASE WHEN actor_can_manage_clients THEN establishment_client.tags END,
      'notes', CASE WHEN actor_can_manage_clients THEN establishment_client.notes END
    )),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'eventType', event.event_type,
        'actorId', CASE WHEN actor_can_view_sensitive_detail THEN event.actor_id END,
        'previousStatus', event.previous_status,
        'resultingStatus', event.resulting_status,
        'createdAt', event.created_at,
        'metadata', CASE WHEN actor_can_view_sensitive_detail
          THEN event.metadata ELSE '{}'::jsonb END
      ) ORDER BY event.created_at, event.id)
      FROM public.appointment_events AS event
      WHERE event.appointment_id = appointment.id
    ), '[]'::jsonb),
    'allowedActions', allowed_actions
  ) INTO result
  FROM public.appointments AS appointment
  JOIN public.services AS service ON service.id = appointment.service_id
  JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  LEFT JOIN public.profiles AS client_profile ON client_profile.id = appointment.client_id
  LEFT JOIN public.establishment_clients AS establishment_client
    ON establishment_client.id = appointment.establishment_client_id
  WHERE appointment.id = appointment_record.id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_business_appointment_status(
  target_establishment_id uuid,
  target_appointment_id text,
  target_request_id uuid,
  target_status text,
  target_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  appointment_record public.appointments%ROWTYPE;
  result jsonb;
BEGIN
  IF target_status NOT IN ('confirmed', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'invalid_status_value';
  END IF;
  IF char_length(COALESCE(target_reason, '')) > 500 THEN
    RAISE EXCEPTION 'cancellation_reason_too_long';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.' || target_status,
    jsonb_strip_nulls(jsonb_build_object(
      'appointmentId', target_appointment_id,
      'status', target_status,
      'reason', NULLIF(btrim(target_reason), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  SELECT * INTO appointment_record
  FROM public.appointments
  WHERE id = target_appointment_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF appointment_record.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF NOT public.can_operate_business_appointment(
    target_establishment_id, appointment_record.professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF target_status = 'confirmed' AND appointment_record.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_status_transition';
  ELSIF target_status IN ('completed', 'no_show')
    AND appointment_record.status <> 'confirmed'
  THEN
    RAISE EXCEPTION 'invalid_status_transition';
  ELSIF target_status = 'cancelled'
    AND appointment_record.status NOT IN ('pending', 'confirmed')
  THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;
  IF target_status = 'no_show'
    AND appointment_record.date_time > now()
  THEN RAISE EXCEPTION 'appointment_not_started'; END IF;

  UPDATE public.appointments
  SET status = target_status,
      cancellation_reason_code = CASE
        WHEN target_status = 'cancelled' THEN 'establishment_cancelled'
        ELSE cancellation_reason_code
      END,
      cancellation_reason = CASE
        WHEN target_status = 'cancelled' THEN 'establishment_cancelled'
        ELSE cancellation_reason
      END,
      cancellation_note_internal = CASE
        WHEN target_status = 'cancelled' THEN NULLIF(btrim(target_reason), '')
        ELSE cancellation_note_internal
      END,
      cancelled_by_role = CASE
        WHEN target_status = 'cancelled' THEN (
          SELECT CASE WHEN identity.operational_role = 'professional'
            THEN 'professional' ELSE 'admin' END
          FROM public.resolve_business_operational_identity(
            target_establishment_id, (SELECT auth.uid())
          ) AS identity
          LIMIT 1
        )
        ELSE cancelled_by_role
      END
  WHERE id = appointment_record.id;

  result := jsonb_build_object(
    'appointmentId', appointment_record.id,
    'status', target_status
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_business_appointment(
  target_establishment_id uuid,
  target_appointment_id text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.apply_business_appointment_status(
    target_establishment_id, target_appointment_id, target_request_id, 'confirmed', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.complete_business_appointment(
  target_establishment_id uuid,
  target_appointment_id text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.apply_business_appointment_status(
    target_establishment_id, target_appointment_id, target_request_id, 'completed', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.cancel_business_appointment(
  target_establishment_id uuid,
  target_appointment_id text,
  target_request_id uuid,
  target_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.apply_business_appointment_status(
    target_establishment_id, target_appointment_id, target_request_id,
    'cancelled', target_reason
  );
$$;

CREATE OR REPLACE FUNCTION public.mark_business_appointment_no_show(
  target_establishment_id uuid,
  target_appointment_id text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.apply_business_appointment_status(
    target_establishment_id, target_appointment_id, target_request_id, 'no_show', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.reschedule_business_appointment(
  target_establishment_id uuid,
  target_appointment_id text,
  target_date_time timestamptz,
  target_professional_id uuid,
  target_service_id text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  appointment_record public.appointments%ROWTYPE;
  target_timezone text;
  selected_slot record;
  updated_record public.appointments%ROWTYPE;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.rescheduled',
    jsonb_build_object(
      'appointmentId', target_appointment_id,
      'startsAt', target_date_time,
      'professionalId', target_professional_id,
      'serviceId', target_service_id
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF target_date_time IS NULL OR target_date_time <= now() THEN
    RAISE EXCEPTION 'appointment_must_be_in_future';
  END IF;

  SELECT * INTO appointment_record
  FROM public.appointments
  WHERE id = target_appointment_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF appointment_record.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF appointment_record.status NOT IN ('pending', 'confirmed') THEN
    RAISE EXCEPTION 'appointment_status_immutable';
  END IF;
  IF appointment_record.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;
  IF NOT public.can_operate_business_appointment(
    target_establishment_id, appointment_record.professional_id
  ) OR NOT public.can_operate_business_appointment(
    target_establishment_id, target_professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT timezone INTO target_timezone
  FROM public.establishments
  WHERE id = target_establishment_id;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    (target_date_time AT TIME ZONE target_timezone)::date,
    target_appointment_id
  ) AS slot
  WHERE slot.starts_at = target_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN
      result := jsonb_build_object(
        'errorCode', 'appointment_conflict',
        'appointmentId', target_appointment_id,
        'professionalId', target_professional_id
      );
      PERFORM public.enqueue_business_operational_conflict(
        'appointment-conflict:' || target_request_id::text,
        target_establishment_id,
        target_professional_id,
        target_appointment_id
      );
      RETURN public.complete_mobile_command(target_request_id, result);
    END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  UPDATE public.appointments
  SET original_date_time = COALESCE(original_date_time, date_time),
      date_time = target_date_time,
      ends_at = target_date_time
        + make_interval(mins => selected_slot.duration_minutes),
      duration_minutes = selected_slot.duration_minutes,
      professional_id = target_professional_id,
      service_id = target_service_id,
      reschedule_count = reschedule_count + 1
  WHERE id = appointment_record.id
  RETURNING * INTO updated_record;

  result := jsonb_build_object(
    'appointmentId', updated_record.id,
    'status', updated_record.status,
    'startsAt', updated_record.date_time,
    'endsAt', updated_record.ends_at
  );
  RETURN public.complete_mobile_command(target_request_id, result);
EXCEPTION WHEN exclusion_violation THEN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.rescheduled',
    jsonb_build_object(
      'appointmentId', target_appointment_id,
      'startsAt', target_date_time,
      'professionalId', target_professional_id,
      'serviceId', target_service_id
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  result := jsonb_build_object(
    'errorCode', 'appointment_conflict',
    'appointmentId', target_appointment_id,
    'professionalId', target_professional_id
  );
  PERFORM public.enqueue_business_operational_conflict(
    'appointment-conflict:' || target_request_id::text,
    target_establishment_id,
    target_professional_id,
    target_appointment_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_confirmed_establishment_client_match(
  target_establishment_client_id uuid,
  target_profile_id uuid,
  target_match_kind text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.establishment_clients AS client
    JOIN auth.users AS auth_user ON auth_user.id = target_profile_id
    JOIN public.profiles AS profile
      ON profile.id = auth_user.id AND profile.deleted_at IS NULL
    WHERE client.id = target_establishment_client_id
      AND client.status = 'active'
      AND (
        (
          target_match_kind IS DISTINCT FROM 'confirmed_phone'
          AND client.email IS NOT NULL
          AND auth_user.email_confirmed_at IS NOT NULL
          AND lower(auth_user.email) = lower(client.email)
        ) OR (
          target_match_kind IS DISTINCT FROM 'confirmed_email'
          AND client.phone IS NOT NULL
          AND auth_user.phone_confirmed_at IS NOT NULL
          AND regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g')
            = regexp_replace(client.phone, '[^0-9]', '', 'g')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.queue_establishment_client_match(
  target_establishment_client_id uuid,
  target_requested_by uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  client_record public.establishment_clients%ROWTYPE;
  matched_profile_id uuid;
  matched_kind text;
  match_count integer;
  created_link_id uuid;
BEGIN
  SELECT * INTO client_record
  FROM public.establishment_clients
  WHERE id = target_establishment_client_id
    AND status = 'active';
  IF client_record.id IS NULL THEN RETURN NULL; END IF;

  WITH verified_match AS (
    SELECT profile.id,
      CASE
        WHEN client_record.email IS NOT NULL
          AND auth_user.email_confirmed_at IS NOT NULL
          AND lower(auth_user.email) = lower(client_record.email)
        THEN 'confirmed_email'
        ELSE 'confirmed_phone'
      END AS match_kind
    FROM auth.users AS auth_user
    JOIN public.profiles AS profile
      ON profile.id = auth_user.id AND profile.deleted_at IS NULL
    WHERE (
      client_record.email IS NOT NULL
      AND auth_user.email_confirmed_at IS NOT NULL
      AND lower(auth_user.email) = lower(client_record.email)
    ) OR (
      client_record.phone IS NOT NULL
      AND auth_user.phone_confirmed_at IS NOT NULL
      AND regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g')
        = regexp_replace(client_record.phone, '[^0-9]', '', 'g')
    )
  ), distinct_match AS (
    SELECT DISTINCT ON (id) id, match_kind
    FROM verified_match
    ORDER BY id, match_kind
  )
  SELECT count(*) OVER (), id, match_kind
  INTO match_count, matched_profile_id, matched_kind
  FROM distinct_match
  ORDER BY id
  LIMIT 1;

  match_count := COALESCE(match_count, 0);

  -- Ambiguous verified contacts never auto-link. The local record remains
  -- usable and can later be resolved explicitly by an administrator.
  IF match_count <> 1 THEN RETURN NULL; END IF;

  INSERT INTO public.establishment_client_links (
    establishment_client_id,
    establishment_id,
    profile_id,
    match_kind,
    status,
    requested_by
  ) VALUES (
    client_record.id,
    client_record.establishment_id,
    matched_profile_id,
    matched_kind,
    'pending',
    target_requested_by
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO created_link_id;

  RETURN created_link_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_request_id uuid,
  target_establishment_client_id uuid DEFAULT NULL,
  target_client_name text DEFAULT NULL,
  target_client_phone text DEFAULT NULL,
  target_client_email text DEFAULT NULL,
  target_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  selected_slot record;
  client_record public.establishment_clients%ROWTYPE;
  linked_profile_id uuid;
  created_appointment public.appointments%ROWTYPE;
  result jsonb;
BEGIN
  IF char_length(COALESCE(target_client_name, '')) > 120
    OR char_length(COALESCE(target_client_phone, '')) > 32
    OR char_length(COALESCE(target_client_email, '')) > 254
    OR char_length(COALESCE(target_notes, '')) > 2000
  THEN RAISE EXCEPTION 'invalid_client_details'; END IF;
  IF target_establishment_client_id IS NULL THEN
    PERFORM public.assert_valid_establishment_client_values(
      target_client_name,
      NULLIF(btrim(target_client_phone), ''),
      NULLIF(lower(btrim(target_client_email)), ''),
      ARRAY[]::text[],
      NULL
    );
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.created',
    jsonb_strip_nulls(jsonb_build_object(
      'professionalId', target_professional_id,
      'serviceId', target_service_id,
      'startsAt', target_date_time,
      'establishmentClientId', target_establishment_client_id,
      'clientName', NULLIF(btrim(target_client_name), ''),
      'clientPhone', NULLIF(btrim(target_client_phone), ''),
      'clientEmail', NULLIF(lower(btrim(target_client_email)), ''),
      'notes', NULLIF(btrim(target_notes), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF target_date_time IS NULL OR target_date_time < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'appointment_must_not_be_in_past';
  END IF;
  IF NOT public.can_operate_business_appointment(
    target_establishment_id, target_professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT timezone INTO target_timezone
  FROM public.establishments
  WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    (target_date_time AT TIME ZONE target_timezone)::date,
    NULL
  ) AS slot
  WHERE slot.starts_at = target_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN
      result := jsonb_build_object(
        'errorCode', 'appointment_conflict',
        'professionalId', target_professional_id
      );
      PERFORM public.enqueue_business_operational_conflict(
        'appointment-conflict:' || target_request_id::text,
        target_establishment_id,
        target_professional_id,
        NULL
      );
      RETURN public.complete_mobile_command(target_request_id, result);
    END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  IF target_establishment_client_id IS NOT NULL THEN
    SELECT * INTO client_record
    FROM public.establishment_clients
    WHERE id = target_establishment_client_id
      AND establishment_id = target_establishment_id
      AND status = 'active'
    FOR UPDATE;
    IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  ELSE
    IF NULLIF(btrim(target_client_name), '') IS NULL THEN
      RAISE EXCEPTION 'client_name_required';
    END IF;
    INSERT INTO public.establishment_clients (
      establishment_id, display_name, phone, email, created_by, updated_by
    ) VALUES (
      target_establishment_id,
      btrim(target_client_name),
      NULLIF(btrim(target_client_phone), ''),
      NULLIF(lower(btrim(target_client_email)), ''),
      actor_id,
      actor_id
    ) RETURNING * INTO client_record;
    PERFORM public.queue_establishment_client_match(client_record.id, actor_id);
  END IF;

  SELECT link.profile_id INTO linked_profile_id
  FROM public.establishment_client_links AS link
  WHERE link.establishment_client_id = client_record.id
    AND link.status = 'confirmed'
  LIMIT 1;

  INSERT INTO public.appointments (
    establishment_id,
    client_id,
    client_name,
    establishment_client_id,
    business_notes,
    professional_id,
    service_id,
    date_time,
    ends_at,
    duration_minutes,
    status
  ) VALUES (
    target_establishment_id,
    linked_profile_id,
    client_record.display_name,
    client_record.id,
    NULLIF(btrim(target_notes), ''),
    target_professional_id,
    target_service_id,
    target_date_time,
    target_date_time + make_interval(mins => selected_slot.duration_minutes),
    selected_slot.duration_minutes,
    'confirmed'
  ) RETURNING * INTO created_appointment;

  result := jsonb_build_object(
    'appointmentId', created_appointment.id,
    'status', created_appointment.status,
    'establishmentClientId', client_record.id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
EXCEPTION WHEN exclusion_violation THEN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.created',
    jsonb_strip_nulls(jsonb_build_object(
      'professionalId', target_professional_id,
      'serviceId', target_service_id,
      'startsAt', target_date_time,
      'establishmentClientId', target_establishment_client_id,
      'clientName', NULLIF(btrim(target_client_name), ''),
      'clientPhone', NULLIF(btrim(target_client_phone), ''),
      'clientEmail', NULLIF(lower(btrim(target_client_email)), ''),
      'notes', NULLIF(btrim(target_notes), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  result := jsonb_build_object(
    'errorCode', 'appointment_conflict',
    'professionalId', target_professional_id
  );
  PERFORM public.enqueue_business_operational_conflict(
    'appointment-conflict:' || target_request_id::text,
    target_establishment_id,
    target_professional_id,
    NULL
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;


CREATE TRIGGER appointment_events_immutable
  BEFORE UPDATE OR DELETE ON public.appointment_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mobile_record();
CREATE TRIGGER establishment_client_merge_events_immutable
  BEFORE UPDATE OR DELETE ON public.establishment_client_merge_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_mobile_record();

CREATE TRIGGER mobile_app_release_policies_updated_at
  BEFORE UPDATE ON public.mobile_app_release_policies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER establishment_clients_updated_at
  BEFORE UPDATE ON public.establishment_clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER establishment_client_links_updated_at
  BEFORE UPDATE ON public.establishment_client_links
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Idempotency and release-policy helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_safe_mobile_command_response(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(value) AS key_name
      WHERE key_name <> ALL (ARRAY[
        'appointmentId', 'status', 'startsAt', 'endsAt',
        'establishmentClientId', 'establishmentId', 'linkId',
        'scheduleBlockId', 'serviceId', 'membershipId',
        'invitationId', 'expiresAt', 'survivorClientId',
        'duplicateClientId', 'professionalId', 'errorCode'
      ]::text[])
    )
    AND (
      NOT (value ? 'errorCode')
      OR (
        jsonb_typeof(value->'errorCode') = 'string'
        AND value->>'errorCode' IN (
          'appointment_conflict', 'schedule_block_conflict'
        )
      )
    );
$$;

ALTER TABLE public.command_receipts
  ADD CONSTRAINT command_receipts_safe_response_check CHECK (
    response_payload IS NULL
    OR public.is_safe_mobile_command_response(response_payload)
  );

CREATE OR REPLACE FUNCTION public.claim_mobile_command(
  target_request_id uuid,
  target_establishment_id uuid,
  target_command_type text,
  target_request_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_hash text;
  receipt public.command_receipts%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_request_id IS NULL THEN RAISE EXCEPTION 'request_id_required'; END IF;
  IF target_establishment_id IS NULL THEN RAISE EXCEPTION 'establishment_required'; END IF;
  IF target_command_type IS NULL
    OR target_command_type !~ '^[a-z][a-z0-9_.]{2,79}$'
  THEN RAISE EXCEPTION 'invalid_command_type'; END IF;
  IF target_request_payload IS NULL
    OR jsonb_typeof(target_request_payload) <> 'object'
  THEN RAISE EXCEPTION 'invalid_request_payload'; END IF;

  normalized_hash := encode(
    extensions.digest(convert_to(target_request_payload::text, 'UTF8'), 'sha256'),
    'hex'
  );

  INSERT INTO public.command_receipts (
    request_id, actor_id, establishment_id, command_type, request_hash
  ) VALUES (
    target_request_id, actor_id, target_establishment_id,
    target_command_type, normalized_hash
  )
  ON CONFLICT (request_id) DO NOTHING;

  SELECT * INTO receipt
  FROM public.command_receipts
  WHERE request_id = target_request_id
  FOR UPDATE;

  IF receipt.actor_id IS DISTINCT FROM actor_id
    OR receipt.establishment_id IS DISTINCT FROM target_establishment_id
    OR receipt.command_type IS DISTINCT FROM target_command_type
    OR receipt.request_hash IS DISTINCT FROM normalized_hash
  THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;

  RETURN receipt.response_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_mobile_command(
  target_request_id uuid,
  target_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_safe_mobile_command_response(target_response) THEN
    RAISE EXCEPTION 'unsafe_command_response';
  END IF;

  UPDATE public.command_receipts
  SET response_payload = target_response,
      completed_at = now()
  WHERE request_id = target_request_id
    AND actor_id = (SELECT auth.uid())
    AND response_payload IS NULL;

  IF NOT FOUND THEN
    SELECT response_payload INTO target_response
    FROM public.command_receipts
    WHERE request_id = target_request_id
      AND actor_id = (SELECT auth.uid());
  END IF;
  IF target_response IS NULL THEN RAISE EXCEPTION 'command_receipt_not_found'; END IF;
  RETURN target_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.compare_mobile_semver(left_version text, right_version text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  left_parts integer[];
  right_parts integer[];
BEGIN
  IF left_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    OR right_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  THEN RAISE EXCEPTION 'invalid_app_version'; END IF;
  left_parts := string_to_array(left_version, '.')::integer[];
  right_parts := string_to_array(right_version, '.')::integer[];
  RETURN CASE WHEN left_parts < right_parts THEN -1
    WHEN left_parts > right_parts THEN 1 ELSE 0 END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mobile_release_policy(
  target_app_kind text,
  target_platform text,
  target_app_version text
)
RETURNS TABLE (
  app_kind text,
  platform text,
  minimum_supported_version text,
  latest_version text,
  update_required boolean,
  enforcement_enabled boolean,
  store_url text,
  message text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF target_app_kind NOT IN ('client', 'business') THEN RAISE EXCEPTION 'invalid_app_kind'; END IF;
  IF target_platform NOT IN ('android', 'ios') THEN RAISE EXCEPTION 'invalid_platform'; END IF;
  IF target_app_version IS NULL THEN RAISE EXCEPTION 'app_version_required'; END IF;
  IF target_app_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_app_version';
  END IF;

  RETURN QUERY
  SELECT policy.app_kind,
    policy.platform,
    policy.minimum_supported_version,
    policy.latest_version,
    policy.enforcement_enabled
      AND policy.minimum_supported_version IS NOT NULL
      AND public.compare_mobile_semver(
        target_app_version,
        policy.minimum_supported_version
      ) < 0,
    policy.enforcement_enabled,
    policy.store_url,
    policy.message
  FROM public.mobile_app_release_policies AS policy
  WHERE policy.app_kind = target_app_kind
    AND policy.platform = target_platform;
END;
$$;

-- Preserve every Fatia 1 capability and add only the full-access CRM
-- capabilities agreed for owner/admin. read_only gains no new client data.
CREATE OR REPLACE FUNCTION public.resolve_business_operational_capabilities(
  target_establishment_id uuid,
  target_profile_id uuid,
  target_access_mode text
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  identity_record record;
  team_agendas_shared boolean := false;
  capabilities text[] := ARRAY[]::text[];
BEGIN
  IF target_access_mode NOT IN ('full', 'read_only') THEN RETURN capabilities; END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, target_profile_id
  ) LIMIT 1;
  IF NOT FOUND THEN RETURN capabilities; END IF;

  SELECT COALESCE(establishment.share_agendas, false)
  INTO team_agendas_shared
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  capabilities := ARRAY[
    'view_own_agenda', 'view_services', 'view_own_commission'
  ];
  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY['view_team_agenda', 'view_unit_reports'];
  ELSIF team_agendas_shared THEN
    capabilities := capabilities || ARRAY['view_team_agenda'];
  END IF;
  IF target_access_mode = 'read_only' THEN RETURN capabilities; END IF;

  capabilities := capabilities || ARRAY['create_self_walk_in', 'manage_own_blocks'];
  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'create_team_walk_in', 'manage_team_blocks', 'manage_services',
      'manage_team', 'manage_operational_settings', 'view_clients',
      'manage_clients'
    ];
  END IF;
  IF identity_record.operational_role = 'owner' THEN
    capabilities := capabilities || ARRAY['manage_admins'];
  END IF;
  RETURN capabilities;
END;
$$;

-- ---------------------------------------------------------------------------
-- Capability-backed schedule blocks, including establishment-local all-day
-- periods. The existing get_schedule_blocks contract remains unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_business_schedule_block_period(
  target_establishment_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_all_day boolean,
  target_local_date date
)
RETURNS TABLE (
  starts_at timestamptz,
  ends_at timestamptz,
  local_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_timezone text;
BEGIN
  SELECT timezone INTO target_timezone
  FROM public.establishments
  WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF COALESCE(target_all_day, false) THEN
    IF target_local_date IS NULL THEN RAISE EXCEPTION 'local_date_required'; END IF;
    starts_at := target_local_date::timestamp AT TIME ZONE target_timezone;
    ends_at := (target_local_date + 1)::timestamp AT TIME ZONE target_timezone;
    local_date := target_local_date;
  ELSE
    IF target_starts_at IS NULL OR target_ends_at IS NULL THEN
      RAISE EXCEPTION 'schedule_block_period_required';
    END IF;
    starts_at := target_starts_at;
    ends_at := target_ends_at;
    local_date := NULL;
  END IF;

  IF ends_at <= starts_at OR ends_at > starts_at + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_business_schedule_block_access(
  target_establishment_id uuid,
  target_professional_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_superadmin() AND NOT (
    target_professional_id = (SELECT auth.uid())
    AND public.has_business_capability(target_establishment_id, 'manage_own_blocks')
  ) AND NOT public.has_business_capability(
    target_establishment_id, 'manage_team_blocks'
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.profile_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.profile_id = target_professional_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
      AND membership.role IN ('professional', 'admin')
      AND profile.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'professional_unavailable'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_schedule_blocks(
  target_establishment_id uuid,
  target_range_start timestamptz,
  target_range_end timestamptz,
  target_professional_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_range_start IS NULL OR target_range_end IS NULL
    OR target_range_end <= target_range_start
    OR target_range_end > target_range_start + interval '31 days'
  THEN RAISE EXCEPTION 'invalid_schedule_block_range'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'view_own_agenda')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF (target_professional_id IS NULL OR target_professional_id <> actor_id)
    AND NOT public.has_business_capability(target_establishment_id, 'view_team_agenda')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', block.id,
      'establishmentId', block.establishment_id,
      'professionalId', block.professional_id,
      'startsAt', block.starts_at,
      'endsAt', block.ends_at,
      'kind', block.kind,
      'reason', block.reason,
      'allDay', block.is_all_day,
      'localDate', block.local_date,
      'updatedAt', block.updated_at
    ) ORDER BY block.starts_at, block.professional_id, block.id)
    FROM public.schedule_blocks AS block
    WHERE block.establishment_id = target_establishment_id
      AND block.deleted_at IS NULL
      AND (target_professional_id IS NULL OR block.professional_id = target_professional_id)
      AND block.starts_at < target_range_end
      AND block.ends_at > target_range_start
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_schedule_block(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_kind text,
  target_request_id uuid,
  target_reason text DEFAULT NULL,
  target_all_day boolean DEFAULT false,
  target_local_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  resolved record;
  created_block_id uuid;
  conflict_appointment_id text;
  result jsonb;
BEGIN
  IF target_kind NOT IN ('break', 'time_off', 'blocked') THEN
    RAISE EXCEPTION 'invalid_schedule_block_kind';
  END IF;
  IF char_length(COALESCE(target_reason, '')) > 160 THEN
    RAISE EXCEPTION 'schedule_block_reason_too_long';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'schedule_block.created',
    jsonb_strip_nulls(jsonb_build_object(
      'professionalId', target_professional_id,
      'startsAt', target_starts_at,
      'endsAt', target_ends_at,
      'kind', target_kind,
      'reason', NULLIF(btrim(target_reason), ''),
      'allDay', target_all_day,
      'localDate', target_local_date
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  PERFORM public.assert_business_schedule_block_access(
    target_establishment_id, target_professional_id
  );
  SELECT * INTO resolved
  FROM public.resolve_business_schedule_block_period(
    target_establishment_id, target_starts_at, target_ends_at,
    target_all_day, target_local_date
  );
  IF resolved.starts_at <= now() THEN RAISE EXCEPTION 'schedule_block_must_be_in_future'; END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;

  SELECT appointment.id INTO conflict_appointment_id
  FROM public.appointments AS appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.professional_id = target_professional_id
      AND appointment.status IN ('pending', 'confirmed')
      AND appointment.deleted_at IS NULL
      AND appointment.date_time < resolved.ends_at
      AND appointment.ends_at > resolved.starts_at
  ORDER BY appointment.date_time, appointment.id
  LIMIT 1
  FOR UPDATE;
  IF conflict_appointment_id IS NOT NULL THEN
    result := jsonb_build_object(
      'errorCode', 'schedule_block_conflict',
      'appointmentId', conflict_appointment_id,
      'professionalId', target_professional_id
    );
    PERFORM public.enqueue_business_operational_conflict(
      'schedule-block-conflict:' || target_request_id::text,
      target_establishment_id,
      target_professional_id,
      conflict_appointment_id
    );
    RETURN public.complete_mobile_command(target_request_id, result);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks AS block
    WHERE block.establishment_id = target_establishment_id
      AND block.professional_id = target_professional_id
      AND block.deleted_at IS NULL
      AND block.starts_at < resolved.ends_at
      AND block.ends_at > resolved.starts_at
  ) THEN RAISE EXCEPTION 'schedule_block_overlap'; END IF;

  INSERT INTO public.schedule_blocks (
    establishment_id, professional_id, starts_at, ends_at, kind, reason,
    created_by, is_all_day, local_date
  ) VALUES (
    target_establishment_id, target_professional_id,
    resolved.starts_at, resolved.ends_at, target_kind,
    NULLIF(btrim(target_reason), ''), (SELECT auth.uid()),
    COALESCE(target_all_day, false), resolved.local_date
  ) RETURNING id INTO created_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.schedule_block.created',
    target_establishment_id, target_professional_id,
    jsonb_build_object(
      'schedule_block_id', created_block_id,
      'kind', target_kind,
      'all_day', COALESCE(target_all_day, false)
    )
  );

  result := jsonb_build_object(
    'scheduleBlockId', created_block_id,
    'status', 'active',
    'startsAt', resolved.starts_at,
    'endsAt', resolved.ends_at,
    'professionalId', target_professional_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_business_schedule_block(
  target_establishment_id uuid,
  target_schedule_block_id uuid,
  target_starts_at timestamptz,
  target_ends_at timestamptz,
  target_kind text,
  target_request_id uuid,
  target_reason text DEFAULT NULL,
  target_all_day boolean DEFAULT false,
  target_local_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  block_record public.schedule_blocks%ROWTYPE;
  resolved record;
  conflict_appointment_id text;
  result jsonb;
BEGIN
  IF target_kind NOT IN ('break', 'time_off', 'blocked') THEN
    RAISE EXCEPTION 'invalid_schedule_block_kind';
  END IF;
  IF char_length(COALESCE(target_reason, '')) > 160 THEN
    RAISE EXCEPTION 'schedule_block_reason_too_long';
  END IF;
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'schedule_block.updated',
    jsonb_strip_nulls(jsonb_build_object(
      'scheduleBlockId', target_schedule_block_id,
      'startsAt', target_starts_at,
      'endsAt', target_ends_at,
      'kind', target_kind,
      'reason', NULLIF(btrim(target_reason), ''),
      'allDay', target_all_day,
      'localDate', target_local_date
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  SELECT * INTO block_record
  FROM public.schedule_blocks
  WHERE id = target_schedule_block_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF block_record.id IS NULL THEN RAISE EXCEPTION 'schedule_block_not_found'; END IF;
  PERFORM public.assert_business_schedule_block_access(
    target_establishment_id, block_record.professional_id
  );
  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = block_record.professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  SELECT * INTO resolved
  FROM public.resolve_business_schedule_block_period(
    target_establishment_id, target_starts_at, target_ends_at,
    target_all_day, target_local_date
  );
  IF resolved.starts_at <= now() THEN RAISE EXCEPTION 'schedule_block_must_be_in_future'; END IF;

  SELECT appointment.id INTO conflict_appointment_id
  FROM public.appointments AS appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.professional_id = block_record.professional_id
      AND appointment.status IN ('pending', 'confirmed')
      AND appointment.deleted_at IS NULL
      AND appointment.date_time < resolved.ends_at
      AND appointment.ends_at > resolved.starts_at
  ORDER BY appointment.date_time, appointment.id
  LIMIT 1
  FOR UPDATE;
  IF conflict_appointment_id IS NOT NULL THEN
    result := jsonb_build_object(
      'errorCode', 'schedule_block_conflict',
      'appointmentId', conflict_appointment_id,
      'scheduleBlockId', block_record.id,
      'professionalId', block_record.professional_id
    );
    PERFORM public.enqueue_business_operational_conflict(
      'schedule-block-conflict:' || target_request_id::text,
      target_establishment_id,
      block_record.professional_id,
      conflict_appointment_id
    );
    RETURN public.complete_mobile_command(target_request_id, result);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks AS block
    WHERE block.establishment_id = target_establishment_id
      AND block.professional_id = block_record.professional_id
      AND block.id <> block_record.id
      AND block.deleted_at IS NULL
      AND block.starts_at < resolved.ends_at
      AND block.ends_at > resolved.starts_at
  ) THEN RAISE EXCEPTION 'schedule_block_overlap'; END IF;

  UPDATE public.schedule_blocks
  SET starts_at = resolved.starts_at,
      ends_at = resolved.ends_at,
      kind = target_kind,
      reason = NULLIF(btrim(target_reason), ''),
      is_all_day = COALESCE(target_all_day, false),
      local_date = resolved.local_date,
      updated_at = now()
  WHERE id = block_record.id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.schedule_block.updated',
    target_establishment_id, block_record.professional_id,
    jsonb_build_object(
      'schedule_block_id', block_record.id,
      'kind', target_kind,
      'all_day', COALESCE(target_all_day, false)
    )
  );

  result := jsonb_build_object(
    'scheduleBlockId', block_record.id,
    'status', 'active',
    'startsAt', resolved.starts_at,
    'endsAt', resolved.ends_at,
    'professionalId', block_record.professional_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_business_schedule_block(
  target_establishment_id uuid,
  target_schedule_block_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  block_record public.schedule_blocks%ROWTYPE;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'schedule_block.deleted',
    jsonb_build_object('scheduleBlockId', target_schedule_block_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  SELECT * INTO block_record
  FROM public.schedule_blocks
  WHERE id = target_schedule_block_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF block_record.id IS NULL THEN RAISE EXCEPTION 'schedule_block_not_found'; END IF;
  PERFORM public.assert_business_schedule_block_access(
    target_establishment_id, block_record.professional_id
  );

  UPDATE public.schedule_blocks
  SET deleted_at = now(), updated_at = now()
  WHERE id = block_record.id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.schedule_block.deleted',
    target_establishment_id, block_record.professional_id,
    jsonb_build_object('schedule_block_id', block_record.id)
  );

  result := jsonb_build_object(
    'scheduleBlockId', block_record.id,
    'status', 'deleted',
    'professionalId', block_record.professional_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Establishment-scoped CRM. profiles remains the CutSync identity; local CRM
-- rows never auto-merge by name and verified contacts create consent requests.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_valid_establishment_client_values(
  target_name text,
  target_phone text,
  target_email text,
  target_tags text[],
  target_notes text
)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
BEGIN
  IF NULLIF(btrim(target_name), '') IS NULL
    OR char_length(btrim(target_name)) NOT BETWEEN 2 AND 120
  THEN RAISE EXCEPTION 'invalid_client_name'; END IF;
  IF target_phone IS NOT NULL
    AND char_length(btrim(target_phone)) NOT BETWEEN 8 AND 32
  THEN RAISE EXCEPTION 'invalid_client_phone'; END IF;
  IF target_email IS NOT NULL AND (
    char_length(btrim(target_email)) NOT BETWEEN 3 AND 254
    OR btrim(target_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) THEN RAISE EXCEPTION 'invalid_client_email'; END IF;
  IF cardinality(COALESCE(target_tags, ARRAY[]::text[])) > 20
    OR EXISTS (
      SELECT 1 FROM unnest(COALESCE(target_tags, ARRAY[]::text[])) AS tag
      WHERE NULLIF(btrim(tag), '') IS NULL OR char_length(btrim(tag)) > 40
    )
  THEN RAISE EXCEPTION 'invalid_client_tags'; END IF;
  IF char_length(COALESCE(target_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'client_notes_too_long';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_establishment_clients(
  target_establishment_id uuid,
  target_query text DEFAULT NULL,
  target_limit integer DEFAULT 50,
  target_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_query text := NULLIF(btrim(target_query), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'view_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_limit NOT BETWEEN 1 AND 100 OR target_offset < 0 OR target_offset > 10000 THEN
    RAISE EXCEPTION 'invalid_pagination';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(result.payload ORDER BY result.display_name, result.client_id)
    FROM (
      SELECT client.id AS client_id,
        client.display_name,
        jsonb_strip_nulls(jsonb_build_object(
          'id', client.id,
          'establishmentId', client.establishment_id,
          'displayName', client.display_name,
          'phone', client.phone,
          'email', client.email,
          'tags', client.tags,
          'linkStatus', link.status,
          'linkedProfileId', CASE WHEN link.status = 'confirmed' THEN link.profile_id END,
          'createdAt', client.created_at,
          'updatedAt', client.updated_at
        )) || jsonb_build_object(
          'lastAppointmentAt', (
            SELECT max(appointment.date_time)
            FROM public.appointments AS appointment
            WHERE appointment.establishment_client_id = client.id
              AND appointment.deleted_at IS NULL
          )
        ) AS payload
      FROM public.establishment_clients AS client
      LEFT JOIN LATERAL (
        SELECT candidate.status, candidate.profile_id
        FROM public.establishment_client_links AS candidate
        WHERE candidate.establishment_client_id = client.id
        ORDER BY CASE candidate.status
          WHEN 'confirmed' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
          candidate.created_at DESC
        LIMIT 1
      ) AS link ON true
      WHERE client.establishment_id = target_establishment_id
        AND client.status = 'active'
        AND (
          normalized_query IS NULL
          OR client.display_name ILIKE '%' || normalized_query || '%'
          OR client.phone ILIKE '%' || normalized_query || '%'
          OR client.email ILIKE '%' || normalized_query || '%'
          OR EXISTS (
            SELECT 1 FROM unnest(client.tags) AS tag
            WHERE tag ILIKE '%' || normalized_query || '%'
          )
        )
      ORDER BY client.display_name, client.id
      LIMIT target_limit OFFSET target_offset
    ) AS result
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_establishment_client(
  target_establishment_id uuid,
  target_establishment_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'view_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', client.id,
    'establishmentId', client.establishment_id,
    'displayName', client.display_name,
    'phone', client.phone,
    'email', client.email,
    'tags', client.tags,
    'notes', client.notes,
    'status', client.status,
    'createdAt', client.created_at,
    'updatedAt', client.updated_at,
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', link.id,
        'profileId', link.profile_id,
        'matchKind', link.match_kind,
        'status', link.status,
        'createdAt', link.created_at,
        'respondedAt', link.responded_at
      ) ORDER BY link.created_at DESC)
      FROM public.establishment_client_links AS link
      WHERE link.establishment_client_id = client.id
    ), '[]'::jsonb),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'appointmentId', appointment.id,
        'status', appointment.status,
        'startsAt', appointment.date_time,
        'endsAt', appointment.ends_at,
        'service', jsonb_build_object('id', service.id, 'name', service.name),
        'professional', jsonb_build_object('id', professional.id, 'name', professional.name)
      ) ORDER BY appointment.date_time DESC)
      FROM public.appointments AS appointment
      JOIN public.services AS service ON service.id = appointment.service_id
      JOIN public.profiles AS professional ON professional.id = appointment.professional_id
      WHERE appointment.establishment_client_id = client.id
        AND appointment.deleted_at IS NULL
    ), '[]'::jsonb)
  )) INTO result
  FROM public.establishment_clients AS client
  WHERE client.id = target_establishment_client_id
    AND client.establishment_id = target_establishment_id;

  IF result IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_establishment_client(
  target_establishment_id uuid,
  target_name text,
  target_request_id uuid,
  target_phone text DEFAULT NULL,
  target_email text DEFAULT NULL,
  target_tags text[] DEFAULT ARRAY[]::text[],
  target_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  client_id uuid;
  result jsonb;
BEGIN
  PERFORM public.assert_valid_establishment_client_values(
    target_name, target_phone, target_email, target_tags, target_notes
  );
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.created',
    jsonb_strip_nulls(jsonb_build_object(
      'name', btrim(target_name),
      'phone', NULLIF(btrim(target_phone), ''),
      'email', NULLIF(lower(btrim(target_email)), ''),
      'tags', ARRAY(
        SELECT DISTINCT btrim(tag)
        FROM unnest(COALESCE(target_tags, ARRAY[]::text[])) AS tag
        ORDER BY 1
      ),
      'notes', NULLIF(btrim(target_notes), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.establishment_clients (
    establishment_id, display_name, phone, email, tags, notes,
    created_by, updated_by
  ) VALUES (
    target_establishment_id,
    btrim(target_name),
    NULLIF(btrim(target_phone), ''),
    NULLIF(lower(btrim(target_email)), ''),
    ARRAY(SELECT DISTINCT btrim(tag) FROM unnest(COALESCE(target_tags, ARRAY[]::text[])) AS tag ORDER BY 1),
    NULLIF(btrim(target_notes), ''),
    (SELECT auth.uid()),
    (SELECT auth.uid())
  ) RETURNING id INTO client_id;

  PERFORM public.queue_establishment_client_match(client_id, (SELECT auth.uid()));
  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.created', target_establishment_id,
    jsonb_build_object('establishment_client_id', client_id)
  );
  result := jsonb_build_object(
    'establishmentClientId', client_id,
    'establishmentId', target_establishment_id,
    'status', 'active'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_establishment_client(
  target_establishment_id uuid,
  target_establishment_client_id uuid,
  target_request_id uuid,
  target_name text DEFAULT NULL,
  target_phone text DEFAULT NULL,
  target_email text DEFAULT NULL,
  target_tags text[] DEFAULT NULL,
  target_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  client_record public.establishment_clients%ROWTYPE;
  next_name text;
  next_phone text;
  next_email text;
  next_tags text[];
  next_notes text;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.updated',
    jsonb_strip_nulls(jsonb_build_object(
      'establishmentClientId', target_establishment_client_id,
      'name', target_name,
      'phone', target_phone,
      'email', target_email,
      'tags', CASE WHEN target_tags IS NULL THEN NULL ELSE ARRAY(
        SELECT DISTINCT btrim(tag)
        FROM unnest(target_tags) AS tag
        ORDER BY 1
      ) END,
      'notes', target_notes
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO client_record
  FROM public.establishment_clients
  WHERE id = target_establishment_client_id
    AND establishment_id = target_establishment_id
    AND status = 'active'
  FOR UPDATE;
  IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;

  next_name := COALESCE(NULLIF(btrim(target_name), ''), client_record.display_name);
  next_phone := CASE WHEN target_phone IS NULL THEN client_record.phone
    ELSE NULLIF(btrim(target_phone), '') END;
  next_email := CASE WHEN target_email IS NULL THEN client_record.email
    ELSE NULLIF(lower(btrim(target_email)), '') END;
  next_tags := CASE WHEN target_tags IS NULL THEN client_record.tags
    ELSE ARRAY(SELECT DISTINCT btrim(tag) FROM unnest(target_tags) AS tag ORDER BY 1) END;
  next_notes := CASE WHEN target_notes IS NULL THEN client_record.notes
    ELSE NULLIF(btrim(target_notes), '') END;

  PERFORM public.assert_valid_establishment_client_values(
    next_name, next_phone, next_email, next_tags, next_notes
  );
  UPDATE public.establishment_clients
  SET display_name = next_name,
      phone = next_phone,
      email = next_email,
      tags = next_tags,
      notes = next_notes,
      updated_by = (SELECT auth.uid())
  WHERE id = client_record.id;

  DELETE FROM public.establishment_client_links AS link
  WHERE link.establishment_client_id = client_record.id
    AND link.status = 'pending'
    AND NOT public.is_confirmed_establishment_client_match(
      client_record.id,
      link.profile_id,
      link.match_kind
    );
  PERFORM public.queue_establishment_client_match(client_record.id, (SELECT auth.uid()));
  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.updated', target_establishment_id,
    jsonb_build_object('establishment_client_id', client_record.id)
  );
  result := jsonb_build_object(
    'establishmentClientId', client_record.id,
    'establishmentId', target_establishment_id,
    'status', 'active'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.merge_establishment_clients(
  target_establishment_id uuid,
  target_survivor_client_id uuid,
  target_duplicate_client_id uuid,
  target_request_id uuid,
  target_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  survivor public.establishment_clients%ROWTYPE;
  duplicate public.establishment_clients%ROWTYPE;
  duplicate_link public.establishment_client_links%ROWTYPE;
  existing_link public.establishment_client_links%ROWTYPE;
  result jsonb;
BEGIN
  IF target_survivor_client_id = target_duplicate_client_id THEN
    RAISE EXCEPTION 'merge_requires_distinct_clients';
  END IF;
  IF char_length(COALESCE(target_reason, '')) > 500 THEN
    RAISE EXCEPTION 'merge_reason_too_long';
  END IF;
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.merged',
    jsonb_strip_nulls(jsonb_build_object(
      'survivorClientId', target_survivor_client_id,
      'duplicateClientId', target_duplicate_client_id,
      'reason', NULLIF(btrim(target_reason), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM 1
  FROM public.establishment_clients
  WHERE establishment_id = target_establishment_id
    AND id IN (target_survivor_client_id, target_duplicate_client_id)
  ORDER BY id
  FOR UPDATE;
  SELECT * INTO survivor FROM public.establishment_clients
  WHERE id = target_survivor_client_id
    AND establishment_id = target_establishment_id
    AND status = 'active';
  SELECT * INTO duplicate FROM public.establishment_clients
  WHERE id = target_duplicate_client_id
    AND establishment_id = target_establishment_id
    AND status = 'active';
  IF survivor.id IS NULL OR duplicate.id IS NULL THEN
    RAISE EXCEPTION 'establishment_client_not_found';
  END IF;

  IF (
    SELECT count(DISTINCT profile_id)
    FROM public.establishment_client_links
    WHERE establishment_client_id IN (survivor.id, duplicate.id)
      AND status = 'confirmed'
  ) > 1 THEN RAISE EXCEPTION 'merge_link_conflict'; END IF;

  FOR duplicate_link IN
    SELECT * FROM public.establishment_client_links
    WHERE establishment_client_id = duplicate.id
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    SELECT * INTO existing_link
    FROM public.establishment_client_links
    WHERE establishment_client_id = survivor.id
      AND profile_id = duplicate_link.profile_id
    FOR UPDATE;
    IF existing_link.id IS NULL THEN
      UPDATE public.establishment_client_links
      SET establishment_client_id = survivor.id, updated_at = now()
      WHERE id = duplicate_link.id;
    ELSE
      DELETE FROM public.establishment_client_links WHERE id = duplicate_link.id;
      IF duplicate_link.status = 'confirmed' AND existing_link.status <> 'confirmed' THEN
        UPDATE public.establishment_client_links
        SET status = 'confirmed', responded_at = COALESCE(duplicate_link.responded_at, now()),
            confirmed_at = COALESCE(duplicate_link.confirmed_at, now()), updated_at = now()
        WHERE id = existing_link.id;
      ELSIF duplicate_link.status = 'pending' AND existing_link.status = 'rejected' THEN
        UPDATE public.establishment_client_links
        SET status = 'pending', responded_at = NULL, confirmed_at = NULL, updated_at = now()
        WHERE id = existing_link.id;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.appointments
  SET establishment_client_id = survivor.id
  WHERE establishment_client_id = duplicate.id;

  UPDATE public.establishment_clients
  SET status = 'merged', merged_into_id = survivor.id,
      updated_by = (SELECT auth.uid())
  WHERE id = duplicate.id;

  INSERT INTO public.establishment_client_merge_events (
    establishment_id, survivor_client_id, duplicate_client_id,
    actor_id, reason_provided
  ) VALUES (
    target_establishment_id, survivor.id, duplicate.id,
    (SELECT auth.uid()), NULLIF(btrim(target_reason), '') IS NOT NULL
  );

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.merged', target_establishment_id,
    jsonb_build_object(
      'survivor_client_id', survivor.id,
      'duplicate_client_id', duplicate.id,
      'reason_provided', NULLIF(btrim(target_reason), '') IS NOT NULL
    )
  );

  result := jsonb_build_object(
    'survivorClientId', survivor.id,
    'duplicateClientId', duplicate.id,
    'establishmentId', target_establishment_id,
    'status', 'merged'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_establishment_client_link_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'linkId', link.id,
      'establishmentClientId', link.establishment_client_id,
      'establishmentId', link.establishment_id,
      'establishmentName', establishment.name,
      'clientDisplayName', client.display_name,
      'matchKind', link.match_kind,
      'status', link.status,
      'createdAt', link.created_at
    ) ORDER BY CASE link.status WHEN 'pending' THEN 1 ELSE 2 END,
      link.created_at DESC)
    FROM public.establishment_client_links AS link
    JOIN public.establishment_clients AS client
      ON client.id = link.establishment_client_id
    JOIN public.establishments AS establishment
      ON establishment.id = link.establishment_id
    WHERE link.profile_id = actor_id
      AND link.status IN ('pending', 'confirmed')
      AND client.status = 'active'
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_establishment_client_link(
  target_link_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  link_record public.establishment_client_links%ROWTYPE;
  replay jsonb;
  result jsonb;
  original_actor_claim text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO link_record
  FROM public.establishment_client_links
  WHERE id = target_link_id AND profile_id = actor_id
  FOR UPDATE;
  IF link_record.id IS NULL THEN RAISE EXCEPTION 'link_request_not_found'; END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    link_record.establishment_id,
    'client_link.confirmed',
    jsonb_build_object('linkId', target_link_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF link_record.status <> 'pending' THEN RAISE EXCEPTION 'invalid_link_status'; END IF;
  IF NOT public.is_confirmed_establishment_client_match(
    link_record.establishment_client_id,
    actor_id,
    link_record.match_kind
  ) THEN RAISE EXCEPTION 'stale_link_candidate'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.establishment_client_links AS other_link
    WHERE other_link.establishment_id = link_record.establishment_id
      AND other_link.profile_id = actor_id
      AND other_link.status = 'confirmed'
      AND other_link.id <> link_record.id
  ) THEN RAISE EXCEPTION 'profile_already_linked_in_establishment'; END IF;

  UPDATE public.establishment_client_links
  SET status = 'confirmed', responded_at = now(), confirmed_at = now(), updated_at = now()
  WHERE id = link_record.id;

  -- The existing appointment-scope trigger intentionally rejects clients
  -- attaching themselves to an appointment. This SECURITY DEFINER command has
  -- already locked and revalidated the confirmed per-unit link. The temporary
  -- actor setting preserves attribution in the immutable operational event
  -- while auth.uid() is cleared only for this narrow FK attachment.
  original_actor_claim := current_setting('request.jwt.claim.sub', true);
  PERFORM set_config('app.mobile_link_actor_id', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.appointments
  SET client_id = actor_id
  WHERE establishment_client_id = link_record.establishment_client_id
    AND establishment_id = link_record.establishment_id
    AND deleted_at IS NULL
    AND status IN ('pending', 'confirmed')
    AND date_time > now()
    AND (client_id IS NULL OR client_id = actor_id);
  PERFORM set_config('request.jwt.claim.sub', original_actor_claim, true);
  PERFORM set_config('app.mobile_link_actor_id', '', true);

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id,
    'client.establishment_client_link.confirmed',
    link_record.establishment_id,
    actor_id,
    jsonb_build_object(
      'link_id', link_record.id,
      'establishment_client_id', link_record.establishment_client_id
    )
  );

  result := jsonb_build_object(
    'linkId', link_record.id,
    'status', 'confirmed',
    'establishmentClientId', link_record.establishment_client_id,
    'establishmentId', link_record.establishment_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_establishment_client_link(
  target_link_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  link_record public.establishment_client_links%ROWTYPE;
  replay jsonb;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO link_record
  FROM public.establishment_client_links
  WHERE id = target_link_id AND profile_id = actor_id
  FOR UPDATE;
  IF link_record.id IS NULL THEN RAISE EXCEPTION 'link_request_not_found'; END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    link_record.establishment_id,
    'client_link.rejected',
    jsonb_build_object('linkId', target_link_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF link_record.status <> 'pending' THEN RAISE EXCEPTION 'invalid_link_status'; END IF;

  UPDATE public.establishment_client_links
  SET status = 'rejected', responded_at = now(), confirmed_at = NULL, updated_at = now()
  WHERE id = link_record.id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id,
    'client.establishment_client_link.rejected',
    link_record.establishment_id,
    actor_id,
    jsonb_build_object(
      'link_id', link_record.id,
      'establishment_client_id', link_record.establishment_client_id
    )
  );

  result := jsonb_build_object(
    'linkId', link_record.id,
    'status', 'rejected',
    'establishmentClientId', link_record.establishment_client_id,
    'establishmentId', link_record.establishment_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Typed service catalog and team-management commands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_business_services(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'view_services')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', service.id,
      'establishmentId', service.establishment_id,
      'name', service.name,
      'price', service.price,
      'durationMinutes', service.duration_minutes,
      'isActive', service.is_active,
      'sortOrder', service.sort_order,
      'professionalServices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'professionalId', configuration.professional_id,
          'price', configuration.price,
          'durationMinutes', configuration.duration_minutes,
          'isActive', configuration.is_active
        ) ORDER BY configuration.professional_id)
        FROM public.professional_services AS configuration
        WHERE configuration.establishment_id = service.establishment_id
          AND configuration.service_id = service.id
      ), '[]'::jsonb)
    ) ORDER BY service.sort_order, service.name, service.id)
    FROM public.services AS service
    WHERE service.establishment_id = target_establishment_id
      AND service.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_service(
  target_establishment_id uuid,
  target_name text,
  target_price numeric,
  target_duration_minutes integer,
  target_request_id uuid,
  target_sort_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  created_service_id text;
  effective_sort_order integer;
  result jsonb;
BEGIN
  IF NULLIF(btrim(target_name), '') IS NULL OR char_length(btrim(target_name)) > 120 THEN
    RAISE EXCEPTION 'invalid_service_name';
  END IF;
  IF target_price IS NULL OR target_price < 0 OR target_price > 1000000 THEN
    RAISE EXCEPTION 'invalid_service_price';
  END IF;
  IF target_duration_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'invalid_service_duration';
  END IF;
  IF target_sort_order IS NOT NULL AND target_sort_order < 0 THEN
    RAISE EXCEPTION 'invalid_service_sort_order';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service.created',
    jsonb_strip_nulls(jsonb_build_object(
      'name', btrim(target_name),
      'price', target_price,
      'durationMinutes', target_duration_minutes,
      'sortOrder', target_sort_order
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_services')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM 1 FROM public.establishments
  WHERE id = target_establishment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  SELECT COALESCE(target_sort_order, COALESCE(max(sort_order), 0) + 10)
  INTO effective_sort_order
  FROM public.services
  WHERE establishment_id = target_establishment_id AND deleted_at IS NULL;

  INSERT INTO public.services (
    establishment_id, name, price, duration_minutes, is_active, sort_order
  ) VALUES (
    target_establishment_id, btrim(target_name), target_price,
    target_duration_minutes, true, effective_sort_order
  ) RETURNING id INTO created_service_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.service.created', target_establishment_id,
    jsonb_build_object('service_id', created_service_id)
  );
  result := jsonb_build_object(
    'serviceId', created_service_id,
    'establishmentId', target_establishment_id,
    'status', 'active'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_business_service(
  target_establishment_id uuid,
  target_service_id text,
  target_request_id uuid,
  target_name text DEFAULT NULL,
  target_price numeric DEFAULT NULL,
  target_duration_minutes integer DEFAULT NULL,
  target_sort_order integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  service_record public.services%ROWTYPE;
  result jsonb;
BEGIN
  IF target_name IS NOT NULL AND (
    NULLIF(btrim(target_name), '') IS NULL OR char_length(btrim(target_name)) > 120
  ) THEN RAISE EXCEPTION 'invalid_service_name'; END IF;
  IF target_price IS NOT NULL AND (target_price < 0 OR target_price > 1000000) THEN
    RAISE EXCEPTION 'invalid_service_price';
  END IF;
  IF target_duration_minutes IS NOT NULL AND target_duration_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'invalid_service_duration';
  END IF;
  IF target_sort_order IS NOT NULL AND target_sort_order < 0 THEN
    RAISE EXCEPTION 'invalid_service_sort_order';
  END IF;
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service.updated',
    jsonb_strip_nulls(jsonb_build_object(
      'serviceId', target_service_id,
      'name', target_name,
      'price', target_price,
      'durationMinutes', target_duration_minutes,
      'sortOrder', target_sort_order
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_services')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO service_record FROM public.services
  WHERE id = target_service_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL
  FOR UPDATE;
  IF service_record.id IS NULL THEN RAISE EXCEPTION 'service_not_found'; END IF;

  UPDATE public.services
  SET name = COALESCE(NULLIF(btrim(target_name), ''), name),
      price = COALESCE(target_price, price),
      duration_minutes = COALESCE(target_duration_minutes, duration_minutes),
      sort_order = COALESCE(target_sort_order, sort_order)
  WHERE id = service_record.id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.service.updated', target_establishment_id,
    jsonb_build_object('service_id', service_record.id)
  );
  result := jsonb_build_object(
    'serviceId', service_record.id,
    'establishmentId', target_establishment_id,
    'status', CASE WHEN service_record.is_active THEN 'active' ELSE 'paused' END
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_business_service_status(
  target_establishment_id uuid,
  target_service_id text,
  target_is_active boolean,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  result jsonb;
BEGIN
  IF target_is_active IS NULL THEN RAISE EXCEPTION 'service_status_required'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'service.status_changed',
    jsonb_build_object('serviceId', target_service_id, 'isActive', target_is_active)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_services')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.services
  SET is_active = target_is_active
  WHERE id = target_service_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'service_not_found'; END IF;
  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.service.status_changed', target_establishment_id,
    jsonb_build_object('service_id', target_service_id, 'is_active', target_is_active)
  );
  result := jsonb_build_object(
    'serviceId', target_service_id,
    'establishmentId', target_establishment_id,
    'status', CASE WHEN target_is_active THEN 'active' ELSE 'paused' END
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_business_services(
  target_establishment_id uuid,
  target_service_ids text[],
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  expected_count integer;
  result jsonb;
BEGIN
  IF target_service_ids IS NULL OR cardinality(target_service_ids) = 0
    OR array_position(target_service_ids, NULL) IS NOT NULL
    OR cardinality(target_service_ids) <> (
      SELECT count(DISTINCT value) FROM unnest(target_service_ids) AS value
    )
  THEN RAISE EXCEPTION 'invalid_service_order'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'service.reordered',
    jsonb_build_object('serviceIds', target_service_ids)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_services')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO expected_count
  FROM public.services
  WHERE establishment_id = target_establishment_id AND deleted_at IS NULL;
  IF expected_count <> cardinality(target_service_ids) OR EXISTS (
    SELECT 1 FROM unnest(target_service_ids) AS ordered(service_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services AS service
      WHERE service.id = ordered.service_id
        AND service.establishment_id = target_establishment_id
        AND service.deleted_at IS NULL
    )
  ) THEN RAISE EXCEPTION 'service_order_mismatch'; END IF;

  PERFORM 1 FROM public.services
  WHERE establishment_id = target_establishment_id AND deleted_at IS NULL
  ORDER BY id FOR UPDATE;
  UPDATE public.services AS service
  SET sort_order = ordered.ordinality::integer * 10
  FROM unnest(target_service_ids) WITH ORDINALITY AS ordered(service_id, ordinality)
  WHERE service.id = ordered.service_id
    AND service.establishment_id = target_establishment_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.service.reordered', target_establishment_id,
    jsonb_build_object('service_count', expected_count)
  );
  result := jsonb_build_object(
    'establishmentId', target_establishment_id,
    'status', 'reordered'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_business_professional_service(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_price numeric,
  target_duration_minutes integer,
  target_is_active boolean,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  result jsonb;
BEGIN
  IF target_price IS NULL OR target_price < 0 OR target_price > 1000000 THEN
    RAISE EXCEPTION 'invalid_service_price';
  END IF;
  IF target_duration_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'invalid_service_duration';
  END IF;
  IF target_is_active IS NULL THEN RAISE EXCEPTION 'service_status_required'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'professional_service.upserted',
    jsonb_build_object(
      'professionalId', target_professional_id,
      'serviceId', target_service_id,
      'price', target_price,
      'durationMinutes', target_duration_minutes,
      'isActive', target_is_active
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_services')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE id = target_service_id AND establishment_id = target_establishment_id
      AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'service_not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE profile_id = target_professional_id
      AND establishment_id = target_establishment_id
      AND status = 'active' AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  INSERT INTO public.professional_services (
    establishment_id, professional_id, service_id,
    price, duration_minutes, is_active
  ) VALUES (
    target_establishment_id, target_professional_id, target_service_id,
    target_price, target_duration_minutes, target_is_active
  )
  ON CONFLICT (professional_id, service_id) DO UPDATE
  SET establishment_id = EXCLUDED.establishment_id,
      price = EXCLUDED.price,
      duration_minutes = EXCLUDED.duration_minutes,
      is_active = EXCLUDED.is_active,
      updated_at = now();

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.professional_service.upserted',
    target_establishment_id, target_professional_id,
    jsonb_build_object('service_id', target_service_id, 'is_active', target_is_active)
  );
  result := jsonb_build_object(
    'serviceId', target_service_id,
    'professionalId', target_professional_id,
    'establishmentId', target_establishment_id,
    'status', CASE WHEN target_is_active THEN 'active' ELSE 'paused' END
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_team(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(target_establishment_id, false)
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN jsonb_build_object(
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'membershipId', membership.id,
        'profileId', profile.id,
        'name', profile.name,
        'email', profile.email,
        'phone', profile.phone,
        'role', membership.role,
        'status', membership.status,
        'commissionRate', membership.commission_rate,
        'avatarUrl', profile.avatar_url,
        'updatedAt', membership.updated_at
      ) ORDER BY CASE membership.role WHEN 'admin' THEN 1 ELSE 2 END,
        profile.name, membership.id)
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      WHERE membership.establishment_id = target_establishment_id
        AND membership.status IN ('active', 'suspended')
        AND membership.revoked_at IS NULL
        AND profile.deleted_at IS NULL
    ), '[]'::jsonb),
    'invitations', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'invitationId', invitation.id,
        'targetContact', invitation.target_contact,
        'role', invitation.role,
        'status', CASE WHEN invitation.status = 'pending' AND invitation.expires_at <= now()
          THEN 'expired' ELSE invitation.status::text END,
        'createdAt', invitation.created_at,
        'expiresAt', invitation.expires_at
      ) ORDER BY invitation.created_at DESC)
      FROM public.establishment_invites AS invitation
      WHERE invitation.establishment_id = target_establishment_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_business_team_invite(
  target_establishment_id uuid,
  target_contact text,
  target_role text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_contact text := lower(btrim(target_contact));
  replay jsonb;
  invitation_id uuid;
  invitation_token text := encode(extensions.digest(
    convert_to(concat_ws(
      ':', target_request_id::text, (SELECT auth.uid())::text,
      target_establishment_id::text, lower(btrim(target_contact)), target_role,
      'business-team-invite'
    ), 'UTF8'),
    'sha256'
  ), 'hex');
  expiry timestamptz := now() + interval '24 hours';
  existing_membership public.memberships%ROWTYPE;
  result jsonb;
BEGIN
  IF normalized_contact = '' OR char_length(normalized_contact) > 254 OR NOT (
    normalized_contact ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR regexp_replace(normalized_contact, '[^0-9]', '', 'g') ~ '^[0-9]{10,15}$'
  ) THEN
    RAISE EXCEPTION 'invalid_contact';
  END IF;
  IF target_role NOT IN ('admin', 'professional') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'team_invite.created',
    jsonb_build_object('contact', normalized_contact, 'role', target_role)
  );
  IF replay IS NOT NULL THEN
    RETURN replay || jsonb_build_object('invitationToken', invitation_token);
  END IF;
  IF NOT public.can_manage_business_invitation(target_establishment_id, target_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT membership.* INTO existing_membership
  FROM auth.users AS auth_user
  JOIN public.memberships AS membership
    ON membership.profile_id = auth_user.id
   AND membership.establishment_id = target_establishment_id
  WHERE (
    auth_user.email_confirmed_at IS NOT NULL
    AND lower(auth_user.email) = normalized_contact
  ) OR (
    auth_user.phone_confirmed_at IS NOT NULL
    AND regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g')
      = regexp_replace(normalized_contact, '[^0-9]', '', 'g')
  )
  ORDER BY membership.created_at
  LIMIT 1;
  IF existing_membership.id IS NOT NULL
    AND existing_membership.role = 'admin'
    AND NOT public.has_business_capability(target_establishment_id, 'manage_admins')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF existing_membership.id IS NOT NULL
    AND existing_membership.status IN ('active', 'suspended')
  THEN RAISE EXCEPTION 'membership_already_exists'; END IF;

  UPDATE public.establishment_invites AS invitation
  SET status = 'revoked', revoked_at = now()
  WHERE invitation.establishment_id = target_establishment_id
    AND lower(invitation.target_contact) = normalized_contact
    AND invitation.role = target_role
    AND invitation.status = 'pending';

  INSERT INTO public.establishment_invites (
    establishment_id, target_contact, role, token_hash,
    status, created_by, expires_at
  ) VALUES (
    target_establishment_id, normalized_contact, target_role,
    encode(extensions.digest(invitation_token, 'sha256'), 'hex'),
    'pending', (SELECT auth.uid()), expiry
  ) RETURNING id INTO invitation_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.invitation.created', target_establishment_id,
    jsonb_build_object('invitation_id', invitation_id, 'role', target_role)
  );
  result := jsonb_build_object(
    'invitationId', invitation_id,
    'status', 'pending',
    'expiresAt', expiry,
    'establishmentId', target_establishment_id
  );
  RETURN public.complete_mobile_command(target_request_id, result)
    || jsonb_build_object('invitationToken', invitation_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_business_team_invite(
  target_establishment_id uuid,
  target_invitation_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  replay jsonb;
  invitation_record public.establishment_invites%ROWTYPE;
  invitation_token text := encode(extensions.digest(
    convert_to(concat_ws(
      ':', target_request_id::text, (SELECT auth.uid())::text,
      target_establishment_id::text, target_invitation_id::text,
      'business-team-invite-resend'
    ), 'UTF8'),
    'sha256'
  ), 'hex');
  expiry timestamptz := now() + interval '24 hours';
  existing_membership public.memberships%ROWTYPE;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'team_invite.resent',
    jsonb_build_object('invitationId', target_invitation_id)
  );
  IF replay IS NOT NULL THEN
    RETURN replay || jsonb_build_object('invitationToken', invitation_token);
  END IF;
  SELECT * INTO invitation_record FROM public.establishment_invites
  WHERE id = target_invitation_id AND establishment_id = target_establishment_id
  FOR UPDATE;
  IF invitation_record.id IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF NOT public.can_manage_business_invitation(target_establishment_id, invitation_record.role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT membership.* INTO existing_membership
  FROM auth.users AS auth_user
  JOIN public.memberships AS membership
    ON membership.profile_id = auth_user.id
   AND membership.establishment_id = target_establishment_id
  WHERE (
    auth_user.email_confirmed_at IS NOT NULL
    AND lower(auth_user.email) = lower(invitation_record.target_contact)
  ) OR (
    auth_user.phone_confirmed_at IS NOT NULL
    AND regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g')
      = regexp_replace(invitation_record.target_contact, '[^0-9]', '', 'g')
  )
  ORDER BY membership.created_at
  LIMIT 1;
  IF existing_membership.id IS NOT NULL
    AND existing_membership.role = 'admin'
    AND NOT public.has_business_capability(target_establishment_id, 'manage_admins')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF existing_membership.id IS NOT NULL
    AND existing_membership.status IN ('active', 'suspended')
  THEN RAISE EXCEPTION 'membership_already_exists'; END IF;
  IF invitation_record.status = 'accepted' THEN RAISE EXCEPTION 'invitation_already_accepted'; END IF;

  UPDATE public.establishment_invites
  SET token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex'),
      status = 'pending', expires_at = expiry, revoked_at = NULL
  WHERE id = invitation_record.id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.invitation.resent', target_establishment_id,
    jsonb_build_object('invitation_id', invitation_record.id)
  );
  result := jsonb_build_object(
    'invitationId', invitation_record.id,
    'status', 'pending',
    'expiresAt', expiry,
    'establishmentId', target_establishment_id
  );
  RETURN public.complete_mobile_command(target_request_id, result)
    || jsonb_build_object('invitationToken', invitation_token);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_business_team_invite(
  target_establishment_id uuid,
  target_invitation_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  invitation_record public.establishment_invites%ROWTYPE;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'team_invite.revoked',
    jsonb_build_object('invitationId', target_invitation_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  SELECT * INTO invitation_record FROM public.establishment_invites
  WHERE id = target_invitation_id AND establishment_id = target_establishment_id
  FOR UPDATE;
  IF invitation_record.id IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  IF NOT public.can_manage_business_invitation(target_establishment_id, invitation_record.role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF invitation_record.status <> 'pending' THEN RAISE EXCEPTION 'invalid_invitation_status'; END IF;
  UPDATE public.establishment_invites
  SET status = 'revoked', revoked_at = now()
  WHERE id = invitation_record.id;
  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.invitation.revoked', target_establishment_id,
    jsonb_build_object('invitation_id', invitation_record.id)
  );
  result := jsonb_build_object(
    'invitationId', invitation_record.id,
    'status', 'revoked',
    'establishmentId', target_establishment_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_business_team_invite(
  target_invitation_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  invitation_record public.establishment_invites%ROWTYPE;
  actor_email text;
  actor_phone text;
  replay jsonb;
  membership_id uuid;
  existing_membership public.memberships%ROWTYPE;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO invitation_record
  FROM public.establishment_invites
  WHERE id = target_invitation_id
  FOR UPDATE;
  IF invitation_record.id IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, invitation_record.establishment_id, 'team_invite.accepted',
    jsonb_build_object('invitationId', target_invitation_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF invitation_record.status <> 'pending' OR invitation_record.expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  SELECT CASE WHEN email_confirmed_at IS NOT NULL THEN lower(email) END,
    CASE WHEN phone_confirmed_at IS NOT NULL
      THEN regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') END
  INTO actor_email, actor_phone
  FROM auth.users WHERE id = actor_id;
  IF lower(invitation_record.target_contact) IS DISTINCT FROM actor_email
    AND regexp_replace(invitation_record.target_contact, '[^0-9]', '', 'g')
      IS DISTINCT FROM actor_phone
  THEN RAISE EXCEPTION 'invitation_contact_mismatch'; END IF;

  SELECT * INTO existing_membership
  FROM public.memberships
  WHERE profile_id = actor_id
    AND establishment_id = invitation_record.establishment_id
  FOR UPDATE;
  IF existing_membership.id IS NOT NULL
    AND existing_membership.role = 'admin'
    AND invitation_record.role <> 'admin'
  THEN RAISE EXCEPTION 'invitation_role_conflict'; END IF;
  IF existing_membership.id IS NOT NULL
    AND existing_membership.status IN ('active', 'suspended')
  THEN RAISE EXCEPTION 'membership_already_exists'; END IF;

  INSERT INTO public.memberships (
    profile_id, establishment_id, role, status, commission_rate, created_by
  ) VALUES (
    actor_id, invitation_record.establishment_id, invitation_record.role,
    'active', 0.50, invitation_record.created_by
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = EXCLUDED.role,
      status = 'active', revoked_at = NULL, revocation_reason = NULL, updated_at = now()
  RETURNING id INTO membership_id;

  UPDATE public.establishment_invites
  SET status = 'accepted', accepted_by = actor_id, accepted_at = now()
  WHERE id = invitation_record.id;
  result := jsonb_build_object(
    'invitationId', invitation_record.id,
    'membershipId', membership_id,
    'establishmentId', invitation_record.establishment_id,
    'status', 'accepted'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_business_team_invitation(
  target_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_email text;
  actor_phone text;
  invitation_record public.establishment_invites%ROWTYPE;
  establishment_name text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT CASE WHEN email_confirmed_at IS NOT NULL THEN lower(email) END,
    CASE WHEN phone_confirmed_at IS NOT NULL
      THEN regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') END
  INTO actor_email, actor_phone
  FROM auth.users WHERE id = actor_id;

  SELECT invitation.* INTO invitation_record
  FROM public.establishment_invites AS invitation
  WHERE invitation.id = target_invitation_id;
  IF invitation_record.id IS NULL THEN RAISE EXCEPTION 'invitation_not_found'; END IF;
  SELECT establishment.name INTO establishment_name
  FROM public.establishments AS establishment
  WHERE establishment.id = invitation_record.establishment_id;
  IF lower(invitation_record.target_contact) IS DISTINCT FROM actor_email
    AND regexp_replace(invitation_record.target_contact, '[^0-9]', '', 'g')
      IS DISTINCT FROM actor_phone
  THEN RAISE EXCEPTION 'invitation_contact_mismatch'; END IF;

  RETURN jsonb_build_object(
    'invitationId', invitation_record.id,
    'establishmentId', invitation_record.establishment_id,
    'establishmentName', establishment_name,
    'role', invitation_record.role,
    'status', CASE
      WHEN invitation_record.status = 'pending' AND invitation_record.expires_at <= now()
        THEN 'expired'
      ELSE invitation_record.status::text
    END,
    'expiresAt', invitation_record.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.inspect_business_invitation_token(
  target_invitation_token text
)
RETURNS TABLE (
  establishment_name text,
  invited_contact text,
  invited_role text,
  invitation_status text,
  expiration timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_email text;
  actor_phone text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_invitation_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_invitation_token';
  END IF;
  SELECT CASE WHEN auth_user.email_confirmed_at IS NOT NULL
      THEN lower(auth_user.email) END,
    CASE WHEN auth_user.phone_confirmed_at IS NOT NULL
      THEN regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g') END
  INTO actor_email, actor_phone
  FROM auth.users AS auth_user
  WHERE auth_user.id = actor_id;

  RETURN QUERY
  SELECT establishment.name,
    invitation.target_contact,
    invitation.role,
    CASE WHEN invitation.status = 'pending' AND invitation.expires_at <= now()
      THEN 'expired' ELSE invitation.status::text END,
    invitation.expires_at
  FROM public.establishment_invites AS invitation
  JOIN public.establishments AS establishment
    ON establishment.id = invitation.establishment_id
  WHERE invitation.token_hash = encode(
      extensions.digest(target_invitation_token, 'sha256'), 'hex'
    )
    AND (
      lower(invitation.target_contact) = actor_email
      OR regexp_replace(invitation.target_contact, '[^0-9]', '', 'g') = actor_phone
    );
  IF FOUND THEN RETURN; END IF;

  -- Keep already-issued Fatia 1 email invitations usable while all new
  -- Business team invitations use establishment_invites.
  RETURN QUERY
  SELECT establishment.name,
    invitation.invited_email,
    invitation.role,
    CASE WHEN invitation.status = 'pending' AND invitation.expires_at <= now()
      THEN 'expired' ELSE invitation.status::text END,
    invitation.expires_at
  FROM public.invitations AS invitation
  JOIN public.establishments AS establishment
    ON establishment.id = invitation.establishment_id
  WHERE invitation.token_hash = encode(
      extensions.digest(target_invitation_token, 'sha256'), 'hex'
    )
    AND lower(invitation.invited_email) = actor_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_business_invitation_token(
  target_invitation_token text,
  target_request_id uuid
)
RETURNS TABLE (
  accepted_role text,
  accepted_establishment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_email text;
  actor_phone text;
  team_invitation public.establishment_invites%ROWTYPE;
  legacy_invitation public.invitations%ROWTYPE;
  legacy_acceptance record;
  replay jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_request_id IS NULL THEN RAISE EXCEPTION 'request_id_required'; END IF;
  IF target_invitation_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_invitation_token';
  END IF;
  SELECT CASE WHEN auth_user.email_confirmed_at IS NOT NULL
      THEN lower(auth_user.email) END,
    CASE WHEN auth_user.phone_confirmed_at IS NOT NULL
      THEN regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g') END
  INTO actor_email, actor_phone
  FROM auth.users AS auth_user
  WHERE auth_user.id = actor_id;

  SELECT invitation.* INTO team_invitation
  FROM public.establishment_invites AS invitation
  WHERE invitation.token_hash = encode(
      extensions.digest(target_invitation_token, 'sha256'), 'hex'
    )
    AND (
      lower(invitation.target_contact) = actor_email
      OR regexp_replace(invitation.target_contact, '[^0-9]', '', 'g') = actor_phone
    )
  FOR UPDATE;
  IF team_invitation.id IS NOT NULL THEN
    PERFORM public.accept_business_team_invite(
      team_invitation.id,
      target_request_id
    );
    RETURN QUERY SELECT team_invitation.role, team_invitation.establishment_id;
    RETURN;
  END IF;

  SELECT invitation.* INTO legacy_invitation
  FROM public.invitations AS invitation
  WHERE invitation.token_hash = encode(
      extensions.digest(target_invitation_token, 'sha256'), 'hex'
    )
    AND lower(invitation.invited_email) = actor_email
  FOR UPDATE;
  IF legacy_invitation.id IS NULL THEN
    RAISE EXCEPTION 'invitation_contact_mismatch';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    legacy_invitation.establishment_id,
    'team_invite.legacy_accepted',
    jsonb_build_object('invitationId', legacy_invitation.id)
  );
  IF replay IS NOT NULL THEN
    RETURN QUERY SELECT legacy_invitation.role, legacy_invitation.establishment_id;
    RETURN;
  END IF;

  SELECT * INTO legacy_acceptance
  FROM public.accept_invitation(target_invitation_token);
  PERFORM public.complete_mobile_command(
    target_request_id,
    jsonb_build_object(
      'invitationId', legacy_invitation.id,
      'establishmentId', legacy_acceptance.accepted_establishment_id,
      'status', 'accepted'
    )
  );
  RETURN QUERY
  SELECT legacy_acceptance.accepted_role::text,
    legacy_acceptance.accepted_establishment_id::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_can_manage_business_membership(
  target_establishment_id uuid,
  target_membership_id uuid
)
RETURNS public.memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  membership_record public.memberships%ROWTYPE;
  target_operational_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT * INTO membership_record
  FROM public.memberships
  WHERE id = target_membership_id AND establishment_id = target_establishment_id
  FOR UPDATE;
  IF membership_record.id IS NULL THEN RAISE EXCEPTION 'membership_not_found'; END IF;
  IF membership_record.profile_id = (SELECT auth.uid()) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'cannot_manage_own_membership';
  END IF;
  SELECT identity.operational_role INTO target_operational_role
  FROM public.resolve_business_operational_identity(
    target_establishment_id, membership_record.profile_id
  ) AS identity LIMIT 1;
  IF target_operational_role = 'owner' AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'cannot_manage_owner';
  END IF;
  IF membership_record.role = 'admin' THEN
    IF NOT public.has_business_capability(target_establishment_id, 'manage_admins')
      AND NOT public.is_superadmin()
    THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF NOT public.has_business_capability(target_establishment_id, 'manage_team')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN membership_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_business_team_member_status(
  target_establishment_id uuid,
  target_membership_id uuid,
  target_status text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  membership_record public.memberships%ROWTYPE;
  result jsonb;
BEGIN
  IF target_status NOT IN ('active', 'suspended', 'revoked') THEN
    RAISE EXCEPTION 'invalid_membership_status';
  END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'membership.' || target_status,
    jsonb_build_object('membershipId', target_membership_id, 'status', target_status)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  membership_record := public.assert_can_manage_business_membership(
    target_establishment_id, target_membership_id
  );
  IF target_status = 'active' AND membership_record.status <> 'suspended' THEN
    RAISE EXCEPTION 'invalid_membership_transition';
  ELSIF target_status = 'suspended' AND membership_record.status <> 'active' THEN
    RAISE EXCEPTION 'invalid_membership_transition';
  ELSIF target_status = 'revoked' AND membership_record.status NOT IN ('active', 'suspended') THEN
    RAISE EXCEPTION 'invalid_membership_transition';
  END IF;

  UPDATE public.memberships
  SET status = target_status,
      revoked_at = CASE WHEN target_status = 'revoked' THEN now() ELSE NULL END,
      revocation_reason = CASE WHEN target_status = 'revoked'
        THEN 'Removed through Business operational command' ELSE NULL END,
      updated_at = now()
  WHERE id = membership_record.id;

  IF target_status IN ('active', 'suspended') THEN
    INSERT INTO public.authorization_audit_log (
      actor_id, action, establishment_id, target_profile_id, metadata
    ) VALUES (
      (SELECT auth.uid()),
      CASE target_status
        WHEN 'active' THEN 'business.membership.reactivated'
        ELSE 'business.membership.suspended'
      END,
      target_establishment_id,
      membership_record.profile_id,
      jsonb_build_object('membership_id', membership_record.id)
    );
  END IF;

  result := jsonb_build_object(
    'membershipId', membership_record.id,
    'professionalId', membership_record.profile_id,
    'establishmentId', target_establishment_id,
    'status', target_status
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_business_team_member(
  target_establishment_id uuid, target_membership_id uuid, target_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.change_business_team_member_status(
    target_establishment_id, target_membership_id, 'suspended', target_request_id
  );
$$;

CREATE OR REPLACE FUNCTION public.reactivate_business_team_member(
  target_establishment_id uuid, target_membership_id uuid, target_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.change_business_team_member_status(
    target_establishment_id, target_membership_id, 'active', target_request_id
  );
$$;

CREATE OR REPLACE FUNCTION public.remove_business_team_member(
  target_establishment_id uuid, target_membership_id uuid, target_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT public.change_business_team_member_status(
    target_establishment_id, target_membership_id, 'revoked', target_request_id
  );
$$;

CREATE OR REPLACE FUNCTION public.update_business_team_commission(
  target_establishment_id uuid,
  target_membership_id uuid,
  target_commission_rate numeric,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  membership_record public.memberships%ROWTYPE;
  result jsonb;
BEGIN
  IF target_commission_rate IS NULL
    OR target_commission_rate < 0 OR target_commission_rate > 1
  THEN RAISE EXCEPTION 'invalid_commission_rate'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'membership.commission_updated',
    jsonb_build_object(
      'membershipId', target_membership_id,
      'commissionRate', target_commission_rate
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  membership_record := public.assert_can_manage_business_membership(
    target_establishment_id, target_membership_id
  );
  IF membership_record.status = 'revoked' THEN RAISE EXCEPTION 'membership_revoked'; END IF;

  UPDATE public.memberships
  SET commission_rate = target_commission_rate, updated_at = now()
  WHERE id = membership_record.id;
  result := jsonb_build_object(
    'membershipId', membership_record.id,
    'professionalId', membership_record.profile_id,
    'establishmentId', target_establishment_id,
    'status', membership_record.status
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Identifier-only push queues. Delivery claims are service-role-only; no
-- contact, observation, token or financial value is included in payload JSON.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enqueue_client_no_show_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status <> 'no_show' OR OLD.status = 'no_show'
    OR NEW.client_id IS NULL OR NEW.deleted_at IS NOT NULL
  THEN RETURN NEW; END IF;

  INSERT INTO public.client_push_deliveries (
    event_key, event_type, profile_id, push_device_id, appointment_id,
    title, body, payload
  )
  SELECT
    NEW.id || ':appointment_no_show',
    'appointment_no_show',
    NEW.client_id,
    device.id,
    NEW.id,
    'Atendimento marcado como não comparecimento',
    'O estabelecimento atualizou o status do seu atendimento.',
    jsonb_build_object(
      'appointmentId', NEW.id,
      'eventType', 'appointment_no_show'
    )
  FROM public.push_devices AS device
  JOIN public.profiles AS profile ON profile.id = device.profile_id
  WHERE device.profile_id = NEW.client_id
    AND device.app_kind = 'client'
    AND device.enabled
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  ON CONFLICT (event_key, push_device_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_client_no_show_push_trigger
AFTER UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enqueue_client_no_show_push();

CREATE OR REPLACE FUNCTION public.enqueue_client_link_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  INSERT INTO public.client_push_deliveries (
    event_key, event_type, profile_id, push_device_id,
    establishment_client_link_id, title, body, payload
  )
  SELECT
    NEW.id::text || ':establishment_client_link_requested',
    'establishment_client_link_requested',
    NEW.profile_id,
    device.id,
    NEW.id,
    'Confirme seu vínculo com um estabelecimento',
    'Há uma solicitação de associação aguardando sua confirmação.',
    jsonb_build_object(
      'linkId', NEW.id,
      'establishmentId', NEW.establishment_id,
      'eventType', 'establishment_client_link_requested'
    )
  FROM public.push_devices AS device
  JOIN public.profiles AS profile ON profile.id = device.profile_id
  WHERE device.profile_id = NEW.profile_id
    AND device.app_kind = 'client'
    AND device.enabled
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  ON CONFLICT (event_key, push_device_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_client_link_request_push_trigger
AFTER INSERT ON public.establishment_client_links
FOR EACH ROW EXECUTE FUNCTION public.enqueue_client_link_request_push();

CREATE OR REPLACE FUNCTION public.enqueue_business_appointment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_event_type text;
  target_event_key text;
  target_title text;
  target_body text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    target_event_type := 'appointment_created';
    target_event_key := NEW.id || ':appointment_created';
    target_title := 'Novo atendimento';
    target_body := 'Um atendimento foi adicionado à agenda.';
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    target_event_type := 'appointment_cancelled';
    target_event_key := NEW.id || ':appointment_cancelled';
    target_title := 'Atendimento cancelado';
    target_body := 'Um atendimento da agenda foi cancelado.';
  ELSIF NEW.date_time IS DISTINCT FROM OLD.date_time
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
  THEN
    target_event_type := 'appointment_rescheduled';
    target_event_key := concat_ws(
      ':', NEW.id, 'appointment_rescheduled', NEW.reschedule_count,
      extract(epoch FROM NEW.date_time)::bigint
    );
    target_title := 'Horário de atendimento alterado';
    target_body := 'Um atendimento da agenda teve data, profissional ou serviço alterado.';
  ELSE RETURN NEW;
  END IF;

  INSERT INTO public.business_push_deliveries (
    event_key, event_type, profile_id, push_device_id, establishment_id,
    appointment_id, title, body, payload
  )
  SELECT target_event_key,
    target_event_type,
    membership.profile_id,
    device.id,
    NEW.establishment_id,
    NEW.id,
    target_title,
    target_body,
    jsonb_build_object(
      'appointmentId', NEW.id,
      'establishmentId', NEW.establishment_id,
      'eventType', target_event_type
    )
  FROM public.memberships AS membership
  JOIN public.push_devices AS device
    ON device.profile_id = membership.profile_id
   AND device.app_kind = 'business'
   AND device.enabled
  JOIN public.profiles AS profile ON profile.id = membership.profile_id
  WHERE membership.establishment_id = NEW.establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
    AND (membership.role = 'admin' OR membership.profile_id = NEW.professional_id)
    AND profile.deleted_at IS NULL
  ON CONFLICT (event_key, push_device_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_business_appointment_push_trigger
AFTER INSERT OR UPDATE OF
  status, date_time, professional_id, service_id, reschedule_count, deleted_at
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enqueue_business_appointment_push();

CREATE OR REPLACE FUNCTION public.enqueue_business_invitation_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  recipient_id uuid;
BEGIN
  IF NEW.status <> 'pending' OR NEW.expires_at <= now() THEN RETURN NEW; END IF;

  SELECT auth_user.id INTO recipient_id
  FROM auth.users AS auth_user
  JOIN public.profiles AS profile
    ON profile.id = auth_user.id
   AND profile.deleted_at IS NULL
  WHERE (
    auth_user.email_confirmed_at IS NOT NULL
    AND lower(auth_user.email) = lower(NEW.target_contact)
  ) OR (
    auth_user.phone_confirmed_at IS NOT NULL
    AND regexp_replace(COALESCE(auth_user.phone, ''), '[^0-9]', '', 'g')
      = regexp_replace(NEW.target_contact, '[^0-9]', '', 'g')
  )
  ORDER BY auth_user.id
  LIMIT 1;
  IF recipient_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.business_push_deliveries (
    event_key, event_type, profile_id, push_device_id, establishment_id,
    invitation_id, title, body, payload
  )
  SELECT concat_ws(':', NEW.id, 'invitation_created', extract(epoch FROM NEW.expires_at)::bigint),
    'invitation_created', recipient_id, device.id, NEW.establishment_id,
    NEW.id, 'Convite para uma equipe CutSync',
    'Você recebeu um convite para acessar um estabelecimento.',
    jsonb_build_object(
      'invitationId', NEW.id,
      'establishmentId', NEW.establishment_id,
      'eventType', 'invitation_created'
    )
  FROM public.push_devices AS device
  WHERE device.profile_id = recipient_id
    AND device.app_kind = 'business'
    AND device.enabled
  ON CONFLICT (event_key, push_device_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enqueue_business_invitation_push_trigger
AFTER INSERT OR UPDATE OF status, expires_at, token_hash
ON public.establishment_invites
FOR EACH ROW EXECUTE FUNCTION public.enqueue_business_invitation_push();

CREATE OR REPLACE FUNCTION public.enqueue_business_operational_conflict(
  target_event_key text,
  target_establishment_id uuid,
  target_professional_id uuid,
  target_appointment_id text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count integer;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NULLIF(btrim(target_event_key), '') IS NULL
    OR char_length(target_event_key) > 160
  THEN RAISE EXCEPTION 'invalid_event_key'; END IF;

  INSERT INTO public.business_push_deliveries (
    event_key, event_type, profile_id, push_device_id, establishment_id,
    appointment_id, title, body, payload
  )
  SELECT target_event_key, 'operational_conflict', membership.profile_id,
    device.id, target_establishment_id, target_appointment_id,
    'Conflito operacional na agenda',
    'Uma operação de agenda precisa ser revisada.',
    jsonb_strip_nulls(jsonb_build_object(
      'appointmentId', target_appointment_id,
      'establishmentId', target_establishment_id,
      'professionalId', target_professional_id,
      'eventType', 'operational_conflict'
    ))
  FROM public.memberships AS membership
  JOIN public.push_devices AS device
    ON device.profile_id = membership.profile_id
   AND device.app_kind = 'business' AND device.enabled
  JOIN public.profiles AS profile
    ON profile.id = membership.profile_id
   AND profile.deleted_at IS NULL
  WHERE membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
    AND (membership.role = 'admin' OR membership.profile_id = target_professional_id)
  ON CONFLICT (event_key, push_device_id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_business_push_deliveries(
  target_limit integer DEFAULT 100
)
RETURNS TABLE (
  delivery_id uuid,
  expo_push_token text,
  notification_title text,
  notification_body text,
  notification_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.business_push_deliveries AS delivery
  SET status = 'skipped', last_error_code = 'push_disabled',
      locked_at = NULL, updated_at = now()
  WHERE delivery.status IN ('pending', 'processing')
    AND NOT EXISTS (
      SELECT 1 FROM public.push_devices AS device
      WHERE device.id = delivery.push_device_id
        AND device.enabled AND device.app_kind = 'business'
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.business_push_deliveries AS delivery
    WHERE (
      delivery.status = 'pending'
      OR (delivery.status = 'processing' AND delivery.locked_at < now() - interval '5 minutes')
    )
      AND delivery.available_at <= now()
      AND delivery.attempts < 5
    ORDER BY delivery.available_at, delivery.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(target_limit, 100), 1), 100)
  ), claimed AS (
    UPDATE public.business_push_deliveries AS delivery
    SET status = 'processing', attempts = delivery.attempts + 1,
        locked_at = now(), updated_at = now()
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.*
  )
  SELECT claimed.id, device.expo_push_token,
    claimed.title, claimed.body, claimed.payload
  FROM claimed
  JOIN public.push_devices AS device ON device.id = claimed.push_device_id
  ORDER BY claimed.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_business_push_delivery(
  target_delivery_id uuid,
  target_success boolean,
  target_ticket_id text DEFAULT NULL,
  target_error_code text DEFAULT NULL,
  target_retryable boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_device_id uuid;
BEGIN
  UPDATE public.business_push_deliveries AS delivery
  SET status = CASE
        WHEN target_success THEN 'ticketed'
        WHEN target_retryable AND delivery.attempts < 5 THEN 'pending'
        ELSE 'failed' END,
      expo_ticket_id = CASE WHEN target_success
        THEN NULLIF(btrim(target_ticket_id), '') ELSE NULL END,
      ticketed_at = CASE WHEN target_success THEN now() ELSE NULL END,
      available_at = CASE
        WHEN NOT target_success AND target_retryable AND delivery.attempts < 5
          THEN now() + make_interval(mins => (2 ^ LEAST(delivery.attempts, 5))::integer)
        ELSE delivery.available_at END,
      locked_at = NULL,
      last_error_code = CASE WHEN target_success THEN NULL
        ELSE NULLIF(btrim(target_error_code), '') END,
      updated_at = now()
  WHERE delivery.id = target_delivery_id AND delivery.status = 'processing'
  RETURNING delivery.push_device_id INTO target_device_id;
  IF target_device_id IS NULL THEN RETURN false; END IF;
  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices SET enabled = false, updated_at = now()
    WHERE id = target_device_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_business_push_receipts(
  target_limit integer DEFAULT 100
)
RETURNS TABLE (delivery_id uuid, expo_ticket_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.business_push_deliveries
  SET status = 'failed', last_error_code = 'receipt_expired', updated_at = now()
  WHERE status = 'ticketed' AND ticketed_at < now() - interval '24 hours';

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.business_push_deliveries AS delivery
    WHERE delivery.status = 'ticketed'
      AND delivery.ticketed_at <= now() - interval '15 minutes'
      AND (delivery.receipt_checked_at IS NULL
        OR delivery.receipt_checked_at <= now() - interval '15 minutes')
    ORDER BY delivery.ticketed_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(target_limit, 100), 1), 100)
  ), claimed AS (
    UPDATE public.business_push_deliveries AS delivery
    SET receipt_checked_at = now(), updated_at = now()
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.expo_ticket_id
  )
  SELECT claimed.id, claimed.expo_ticket_id
  FROM claimed WHERE claimed.expo_ticket_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_business_push_receipt(
  target_delivery_id uuid,
  target_success boolean,
  target_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_device_id uuid;
BEGIN
  UPDATE public.business_push_deliveries AS delivery
  SET status = CASE WHEN target_success THEN 'sent' ELSE 'failed' END,
      sent_at = CASE WHEN target_success THEN now() ELSE NULL END,
      last_error_code = CASE WHEN target_success THEN NULL
        ELSE NULLIF(btrim(target_error_code), '') END,
      updated_at = now()
  WHERE delivery.id = target_delivery_id AND delivery.status = 'ticketed'
  RETURNING delivery.push_device_id INTO target_device_id;
  IF target_device_id IS NULL THEN RETURN false; END IF;
  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices SET enabled = false, updated_at = now()
    WHERE id = target_device_id;
  END IF;
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- no_show report compatibility. A no-show is observable as an operational
-- outcome but never contributes to production_realized, scheduled_value,
-- average_ticket, commission_amount, cash, revenue, or profit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_report_v2_before_business_access(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_professional_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  range_starts_at timestamptz;
  range_ends_at timestamptz;
  previous_range_start date;
  previous_range_end date;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
  day_count integer;
  available_minutes bigint;
  previous_available_minutes bigint;
  summary jsonb;
  previous_summary jsonb;
  daily_series jsonb;
  hourly_demand jsonb;
  services jsonb;
  professionals jsonb;
  cancellations jsonb;
  clients jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'invalid_report_status';
  END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  day_count := target_range_end - target_range_start + 1;
  previous_range_end := target_range_start - 1;
  previous_range_start := previous_range_end - day_count + 1;
  range_starts_at := target_range_start::timestamp AT TIME ZONE target_timezone;
  range_ends_at := (target_range_end + 1)::timestamp AT TIME ZONE target_timezone;
  previous_starts_at := previous_range_start::timestamp AT TIME ZONE target_timezone;
  previous_ends_at := (previous_range_end + 1)::timestamp AT TIME ZONE target_timezone;

  available_minutes := public.admin_report_available_minutes(
    target_establishment_id, target_range_start, target_range_end, target_professional_id
  );
  previous_available_minutes := public.admin_report_available_minutes(
    target_establishment_id, previous_range_start, previous_range_end, target_professional_id
  );

  WITH filtered AS (
    SELECT appointment.*, service.price
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  )
  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(price) FILTER (WHERE status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(sum(price) FILTER (WHERE status = 'completed') / NULLIF(count(*) FILTER (WHERE status = 'completed'), 0), 0),
    'occupancy_rate', CASE WHEN available_minutes > 0 THEN LEAST(round(COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0) * 100.0 / available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0),
    'available_minutes', available_minutes,
    'idle_minutes', GREATEST(available_minutes - COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0), 0),
    'completed_count', count(*) FILTER (WHERE status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE status = 'confirmed'),
    'no_show_count', count(*) FILTER (WHERE status = 'no_show'),
    'active_count', count(*) FILTER (WHERE status IN ('pending', 'confirmed'))
  ) INTO summary FROM filtered;

  WITH filtered AS (
    SELECT appointment.*, service.price
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= previous_starts_at
      AND appointment.date_time < previous_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  )
  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(price) FILTER (WHERE status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(sum(price) FILTER (WHERE status = 'completed') / NULLIF(count(*) FILTER (WHERE status = 'completed'), 0), 0),
    'occupancy_rate', CASE WHEN previous_available_minutes > 0 THEN LEAST(round(COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0) * 100.0 / previous_available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0),
    'available_minutes', previous_available_minutes,
    'idle_minutes', GREATEST(previous_available_minutes - COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0), 0),
    'completed_count', count(*) FILTER (WHERE status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE status = 'confirmed'),
    'no_show_count', count(*) FILTER (WHERE status = 'no_show'),
    'active_count', count(*) FILTER (WHERE status IN ('pending', 'confirmed'))
  ) INTO previous_summary FROM filtered;

  WITH days AS (
    SELECT generate_series(target_range_start, target_range_end, interval '1 day')::date AS day
  ), filtered AS (
    SELECT appointment.*, service.price, (appointment.date_time AT TIME ZONE target_timezone)::date AS local_day
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  ), day_rows AS (
    SELECT days.day,
      COALESCE(sum(filtered.price) FILTER (WHERE filtered.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(filtered.price) FILTER (WHERE filtered.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(filtered.duration_minutes) FILTER (WHERE filtered.status <> 'cancelled'), 0) AS occupied_minutes,
      public.admin_report_available_minutes(target_establishment_id, days.day, days.day, target_professional_id) AS day_available_minutes,
      count(filtered.id) FILTER (WHERE filtered.status = 'completed') AS completed_count,
      count(filtered.id) FILTER (WHERE filtered.status = 'cancelled') AS cancelled_count,
      count(filtered.id) FILTER (WHERE filtered.status = 'no_show') AS no_show_count,
      count(filtered.id) FILTER (WHERE filtered.status <> 'cancelled') AS appointment_count
    FROM days LEFT JOIN filtered ON filtered.local_day = days.day
    GROUP BY days.day
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_rows.day,
    'production_realized', day_rows.production_realized,
    'scheduled_value', day_rows.scheduled_value,
    'occupied_minutes', day_rows.occupied_minutes,
    'available_minutes', day_rows.day_available_minutes,
    'occupancy_rate', CASE
      WHEN day_rows.day_available_minutes > 0
      THEN LEAST(round(day_rows.occupied_minutes * 100.0 / day_rows.day_available_minutes, 1), 100)
      ELSE 0 END,
    'completed_count', day_rows.completed_count,
    'cancelled_count', day_rows.cancelled_count,
    'no_show_count', day_rows.no_show_count,
    'appointment_count', day_rows.appointment_count
  ) ORDER BY day_rows.day), '[]'::jsonb)
  INTO daily_series
  FROM day_rows;

  SELECT COALESCE(jsonb_agg(to_jsonb(hour_report) ORDER BY hour_report.day_of_week, hour_report.hour), '[]'::jsonb)
  INTO hourly_demand
  FROM (
    SELECT extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS day_of_week,
      extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS hour,
      count(*) AS appointment_count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL AND appointment.status <> 'cancelled'
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    GROUP BY 1, 2
  ) hour_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(service_report) ORDER BY service_report.production_realized DESC, service_report.appointment_count DESC), '[]'::jsonb)
  INTO services
  FROM (
    SELECT service.id, service.name,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'no_show') AS no_show_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed') / NULLIF(count(appointment.id) FILTER (WHERE appointment.status = 'completed'), 0), 0) AS average_ticket,
      COALESCE(round(avg(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled')), 0) AS average_duration_minutes,
      COALESCE(round(count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') * 100.0
        / NULLIF(sum(count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled')) OVER (), 0), 1), 0) AS demand_share
    FROM public.services service
    LEFT JOIN public.appointments appointment ON appointment.service_id = service.id
      AND appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    WHERE service.establishment_id = target_establishment_id
      AND (target_service_id IS NULL OR service.id = target_service_id)
    GROUP BY service.id, service.name
  ) service_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(professional_report) ORDER BY professional_report.production_realized DESC, professional_report.name), '[]'::jsonb)
  INTO professionals
  FROM (
    SELECT profile.id, profile.name, membership.commission_rate,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'no_show') AS no_show_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * membership.commission_rate AS commission_amount,
      COALESCE(round(COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * 100.0
        / NULLIF(sum(COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0)) OVER (), 0), 1), 0) AS production_share,
      public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id) AS available_minutes,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) AS occupied_minutes,
      CASE WHEN public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id) > 0
        THEN LEAST(round(COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) * 100.0
          / public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id), 1), 100)
        ELSE 0 END AS occupancy_rate
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id AND profile.deleted_at IS NULL
    LEFT JOIN public.appointments appointment ON appointment.professional_id = profile.id
      AND appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active' AND membership.role IN ('professional', 'admin')
      AND (target_professional_id IS NULL OR profile.id = target_professional_id)
    GROUP BY profile.id, profile.name, membership.commission_rate
  ) professional_report;

  SELECT jsonb_build_object(
    'total', COALESCE(sum(count), 0),
    'by_reason', COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason), '[]'::jsonb),
    'by_role', '[]'::jsonb
  ) INTO cancellations
  FROM (
    SELECT COALESCE(NULLIF(trim(appointment.cancellation_reason), ''), 'Não informado') AS reason, count(*) AS count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.status = 'cancelled'
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    GROUP BY 1
  ) cancellation_report;

  WITH completed_clients AS (
    SELECT DISTINCT appointment.client_id
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.status = 'completed' AND appointment.client_id IS NOT NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  ), classified AS (
    SELECT client_id, EXISTS (
      SELECT 1 FROM public.appointments previous
      WHERE previous.establishment_id = target_establishment_id AND previous.deleted_at IS NULL
        AND previous.status = 'completed' AND previous.client_id = completed_clients.client_id
        AND previous.date_time < range_starts_at
    ) AS is_returning
    FROM completed_clients
  )
  SELECT jsonb_build_object(
    'identified_clients', count(*),
    'new_clients', count(*) FILTER (WHERE NOT is_returning),
    'returning_clients', count(*) FILTER (WHERE is_returning),
    'return_rate', COALESCE(round(count(*) FILTER (WHERE is_returning) * 100.0 / NULLIF(count(*), 0), 1), 0),
    'walk_in_appointments', (
      SELECT count(*) FROM public.appointments walk_in
      WHERE walk_in.establishment_id = target_establishment_id AND walk_in.deleted_at IS NULL
        AND walk_in.status = 'completed' AND walk_in.client_id IS NULL
        AND walk_in.date_time >= range_starts_at AND walk_in.date_time < range_ends_at
        AND (target_professional_id IS NULL OR walk_in.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR walk_in.service_id = target_service_id)
        AND (target_status IS NULL OR walk_in.status = target_status)
    )
  ) INTO clients FROM classified;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', target_range_start, 'end', target_range_end, 'days', day_count,
      'previous_start', previous_range_start, 'previous_end', previous_range_end, 'timezone', target_timezone),
    'summary', summary, 'previous_summary', previous_summary, 'daily_series', daily_series,
    'hourly_demand', hourly_demand, 'services', services, 'professionals', professionals,
    'cancellations', cancellations, 'clients', clients, 'generated_at', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_report_details_before_business_access(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_dimension text,
  target_professional_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_status text DEFAULT NULL,
  target_day date DEFAULT NULL,
  target_day_of_week integer DEFAULT NULL,
  target_hour integer DEFAULT NULL,
  target_cursor text DEFAULT NULL,
  target_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  safe_limit integer := LEAST(GREATEST(COALESCE(target_limit, 25), 1), 25);
  cursor_offset integer := CASE WHEN COALESCE(target_cursor, '') ~ '^[0-9]+$' THEN target_cursor::integer ELSE 0 END;
  result_items jsonb := '[]'::jsonb;
  fetched_count integer := 0;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_dimension NOT IN ('appointments', 'clients') THEN RAISE EXCEPTION 'invalid_report_dimension'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN RAISE EXCEPTION 'invalid_report_range'; END IF;
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show') THEN RAISE EXCEPTION 'invalid_report_status'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT timezone INTO target_timezone FROM public.establishments WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF target_dimension = 'appointments' THEN
    WITH rows AS (
      SELECT jsonb_build_object(
        'kind', 'appointment', 'id', appointment.id, 'date_time', appointment.date_time,
        'status', appointment.status, 'service_name', COALESCE(service.name, 'Serviço removido'),
        'professional_id', appointment.professional_id, 'professional_name', COALESCE(professional.name, 'Profissional'),
        'client_name', COALESCE(NULLIF(appointment.client_name, ''), 'Cliente não identificado'),
        'production_value', CASE WHEN appointment.status = 'completed' THEN COALESCE(service.price, 0) ELSE 0 END
      ) AS payload
      FROM public.appointments appointment
      LEFT JOIN public.services service ON service.id = appointment.service_id
      LEFT JOIN public.profiles professional ON professional.id = appointment.professional_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_day IS NULL OR (appointment.date_time AT TIME ZONE target_timezone)::date = target_day)
        AND (target_day_of_week IS NULL OR extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_day_of_week)
        AND (target_hour IS NULL OR extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_hour)
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      ORDER BY appointment.date_time DESC, appointment.id
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*) INTO result_items, fetched_count FROM rows;
  ELSE
    INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata)
    VALUES (actor_id, 'report.clients_identified.viewed', target_establishment_id,
      jsonb_build_object('range_start', target_range_start, 'range_end', target_range_end,
        'professional_filter', target_professional_id IS NOT NULL, 'service_filter', target_service_id IS NOT NULL,
        'status_filter', target_status, 'cursor', cursor_offset));

    WITH client_activity AS (
      SELECT appointment.client_id, max(profile.name) AS full_name,
        max(appointment.date_time) FILTER (WHERE appointment.status = 'completed') AS last_visit,
        count(*) FILTER (WHERE appointment.status = 'completed') AS visit_count,
        min(appointment.date_time) FILTER (WHERE appointment.status IN ('pending', 'confirmed') AND appointment.date_time >= now()) AS next_appointment
      FROM public.appointments appointment
      JOIN public.profiles profile ON profile.id = appointment.client_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.client_id IS NOT NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      GROUP BY appointment.client_id
      HAVING count(*) FILTER (WHERE appointment.status = 'completed') > 0
    ), rows AS (
      SELECT jsonb_build_object(
        'kind', 'client', 'id', client_id,
        'display_name', split_part(full_name, ' ', 1) ||
          CASE WHEN strpos(trim(full_name), ' ') > 0 THEN ' ' || left(regexp_replace(trim(full_name), '^.*\s', ''), 1) || '.' ELSE '' END,
        'last_visit', last_visit, 'visit_count', visit_count, 'next_appointment', next_appointment,
        'operational_status', CASE WHEN next_appointment IS NOT NULL THEN 'scheduled'
          WHEN last_visit >= now() - interval '60 days' THEN 'active' ELSE 'inactive' END
      ) AS payload
      FROM client_activity
      ORDER BY last_visit DESC NULLS LAST, client_id
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*) INTO result_items, fetched_count FROM rows;
  END IF;

  RETURN jsonb_build_object(
    'dimension', target_dimension,
    'items', CASE WHEN fetched_count > safe_limit THEN result_items - safe_limit ELSE result_items END,
    'has_more', fetched_count > safe_limit,
    'next_cursor', CASE WHEN fetched_count > safe_limit THEN (cursor_offset + safe_limit)::text ELSE NULL END
  );
END;
$function$;


-- ---------------------------------------------------------------------------
-- Grants: helpers/triggers stay private, app RPCs are authenticated-only, and
-- queue workers are service-role-only.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.reject_immutable_mobile_record() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_establishment_client_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_establishment_client_link_tenant() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_safe_mobile_command_response(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_safe_business_push_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_mobile_command(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_mobile_command(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compare_mobile_semver(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_appointment_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_business_appointment(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_business_appointment_status(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_confirmed_establishment_client_match(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_establishment_client_match(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_business_schedule_block_period(uuid, timestamptz, timestamptz, boolean, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_business_schedule_block_access(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_valid_establishment_client_values(text, text, text, text[], text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_can_manage_business_membership(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.change_business_team_member_status(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_client_no_show_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_client_link_request_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_business_appointment_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_business_invitation_push() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_admin_report_v2_before_business_access(
  uuid,
  date,
  date,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_report_details_before_business_access(
  uuid,
  date,
  date,
  text,
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  text,
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_report_v2_before_business_access(
  uuid,
  date,
  date,
  uuid,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report_details_before_business_access(
  uuid,
  date,
  date,
  text,
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  text,
  integer
) TO service_role;

REVOKE ALL ON FUNCTION public.get_mobile_release_policy(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mobile_release_policy(text, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_business_appointment_detail(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_business_appointment(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_business_appointment(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_business_appointment(uuid, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_business_appointment(uuid, text, timestamptz, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_business_appointment_no_show(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_business_appointment(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_business_appointment_detail(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_business_appointment(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_business_appointment(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_business_appointment(uuid, text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_business_appointment(uuid, text, timestamptz, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_business_appointment_no_show(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_business_appointment(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_business_schedule_blocks(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_business_schedule_block(uuid, uuid, timestamptz, timestamptz, text, uuid, text, boolean, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_business_schedule_block(uuid, uuid, timestamptz, timestamptz, text, uuid, text, boolean, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_business_schedule_block(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_schedule_blocks(uuid, timestamptz, timestamptz, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_business_schedule_block(uuid, uuid, timestamptz, timestamptz, text, uuid, text, boolean, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_business_schedule_block(uuid, uuid, timestamptz, timestamptz, text, uuid, text, boolean, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_business_schedule_block(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_establishment_clients(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_establishment_client(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_establishment_client(uuid, text, uuid, text, text, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_establishment_client(uuid, uuid, uuid, text, text, text, text[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_establishment_clients(uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_establishment_client_link_requests() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_establishment_client_link(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_establishment_client_link(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.search_establishment_clients(uuid, text, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_establishment_client(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_establishment_client(uuid, text, uuid, text, text, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_establishment_client(uuid, uuid, uuid, text, text, text, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merge_establishment_clients(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_establishment_client_link_requests() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_establishment_client_link(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_establishment_client_link(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_business_services(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_business_service(uuid, text, numeric, integer, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_business_service(uuid, text, uuid, text, numeric, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_business_service_status(uuid, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_business_services(uuid, text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_business_professional_service(uuid, uuid, text, numeric, integer, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_services(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_business_service(uuid, text, numeric, integer, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_business_service(uuid, text, uuid, text, numeric, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_business_service_status(uuid, text, boolean, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_business_services(uuid, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_business_professional_service(uuid, uuid, text, numeric, integer, boolean, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_business_team(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_business_team_invite(uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resend_business_team_invite(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_business_team_invite(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_business_team_invite(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_business_team_invitation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inspect_business_invitation_token(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_business_invitation_token(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.suspend_business_team_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reactivate_business_team_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_business_team_member(uuid, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_business_team_commission(uuid, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_team(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_business_team_invite(uuid, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resend_business_team_invite(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_business_team_invite(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_business_team_invite(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_business_team_invitation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.inspect_business_invitation_token(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_business_invitation_token(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suspend_business_team_member(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reactivate_business_team_member(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_business_team_member(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_business_team_commission(uuid, uuid, numeric, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enqueue_business_operational_conflict(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_business_push_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_business_push_delivery(uuid, boolean, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_business_push_receipts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_business_push_receipt(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_business_operational_conflict(text, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_business_push_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_business_push_delivery(uuid, boolean, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_business_push_receipts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_business_push_receipt(uuid, boolean, text) TO service_role;

COMMENT ON TABLE public.command_receipts IS
  'Idempotency receipts for new mobile operational commands. Response payloads are identifier/status only.';
COMMENT ON TABLE public.establishment_clients IS
  'Establishment-local CRM records. They are not global CutSync identities.';
COMMENT ON COLUMN public.appointments.establishment_client_id IS
  'Optional establishment-local CRM record; client_id remains the confirmed authenticated identity.';
COMMENT ON COLUMN public.mobile_app_release_policies.enforcement_enabled IS
  'Must remain false until the corresponding binary is accessible to the intended tester cohort.';

NOTIFY pgrst, 'reload schema';

COMMIT;
