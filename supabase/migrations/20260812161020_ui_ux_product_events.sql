BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE TABLE public.product_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  event_name text NOT NULL CHECK (event_name IN (
    'discovery_viewed', 'establishment_opened', 'booking_started',
    'availability_empty', 'availability_recovery_selected',
    'booking_confirmed', 'booking_failed', 'attention_viewed',
    'attention_action_started', 'attention_action_succeeded',
    'attention_action_failed', 'brand_draft_saved', 'brand_published',
    'notification_opened'
  )),
  surface text NOT NULL CHECK (surface IN (
    'web_client', 'client_mobile', 'web_business', 'business_mobile', 'professional'
  )),
  actor_hash text CHECK (actor_hash IS NULL OR actor_hash ~ '^[0-9a-f]{64}$'),
  actor_role text NOT NULL CHECK (actor_role ~ '^[a-z_]{2,32}$'),
  route_template text NOT NULL CHECK (
    char_length(route_template) BETWEEN 1 AND 160
    AND route_template ~ '^/[A-Za-z0-9_()/\[\].:-]+$'
  ),
  experience_version text NOT NULL CHECK (experience_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  identifiers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(identifiers) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_events_name_occurred_idx ON public.product_events(event_name, occurred_at DESC);
CREATE INDEX product_events_surface_occurred_idx ON public.product_events(surface, occurred_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_product_event(
  target_request_id uuid,
  target_event_name text,
  target_surface text,
  target_actor_role text,
  target_route_template text,
  target_experience_version text,
  target_identifiers jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  existing_event public.product_events%ROWTYPE;
  event_id bigint;
  identifier_key text;
  identifier_value text;
  allowed_identifier_keys constant text[] := ARRAY[
    'sessionHash', 'establishmentHash', 'appointmentHash',
    'reassignmentHash', 'notificationHash', 'recoveryStrategy'
  ]::text[];
  monthly_actor_hash text;
BEGIN
  IF target_request_id IS NULL OR jsonb_typeof(target_identifiers) <> 'object' THEN
    RAISE EXCEPTION 'invalid_product_event' USING ERRCODE = '22023';
  END IF;
  FOR identifier_key, identifier_value IN SELECT key, value FROM jsonb_each_text(target_identifiers)
  LOOP
    IF NOT identifier_key = ANY(allowed_identifier_keys)
      OR identifier_value !~ '^[A-Za-z0-9:_-]{1,128}$' THEN
      RAISE EXCEPTION 'unsafe_product_event_identifier' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  SELECT * INTO existing_event FROM public.product_events WHERE request_id = target_request_id;
  IF FOUND THEN
    IF existing_event.event_name IS DISTINCT FROM target_event_name
      OR existing_event.surface IS DISTINCT FROM target_surface
      OR existing_event.actor_role IS DISTINCT FROM target_actor_role
      OR existing_event.route_template IS DISTINCT FROM target_route_template
      OR existing_event.experience_version IS DISTINCT FROM target_experience_version
      OR existing_event.identifiers IS DISTINCT FROM target_identifiers
    THEN
      RAISE EXCEPTION 'product_event_idempotency_conflict' USING ERRCODE = '22023';
    END IF;
    RETURN existing_event.id;
  END IF;

  monthly_actor_hash := CASE WHEN (SELECT auth.uid()) IS NULL THEN NULL ELSE encode(
    extensions.digest(
      (SELECT auth.uid())::text || ':' || to_char(now(), 'YYYY-MM') || ':cutsync-product-event-v1',
      'sha256'
    ),
    'hex'
  ) END;

  INSERT INTO public.product_events(
    request_id, event_name, surface, actor_hash, actor_role,
    route_template, experience_version, identifiers
  ) VALUES (
    target_request_id, target_event_name, target_surface, monthly_actor_hash,
    target_actor_role, target_route_template, target_experience_version,
    target_identifiers
  ) RETURNING id INTO event_id;
  RETURN event_id;
EXCEPTION WHEN check_violation THEN
  RAISE EXCEPTION 'invalid_product_event' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.record_product_event(uuid, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_product_event(uuid, text, text, text, text, text, jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
