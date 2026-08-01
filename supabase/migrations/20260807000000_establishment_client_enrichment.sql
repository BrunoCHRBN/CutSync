BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Establishment client enrichment. Prepares the CRM directory to receive
-- imported rows without duplicating a carteira: adds provenance, an external
-- idempotency key, normalized contacts, marketing consent and activity
-- aggregates. No RPC contract changes here; capability and lifecycle RPCs land
-- in the next stage.

-- ---------------------------------------------------------------------------
-- Contact normalization
-- ---------------------------------------------------------------------------

-- Mirrors normalizeEstablishmentClientPhone in
-- packages/validation/src/establishment-client.ts.
-- Both implementations must change together: a divergence normalizes the same
-- contact differently depending on the writer and splits one client in two.
-- Returns NULL when the number cannot be resolved with confidence; a local
-- number without area code is never completed with a guessed DDD.
CREATE OR REPLACE FUNCTION public.normalize_establishment_client_phone(target_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  trimmed text := btrim(COALESCE(target_phone, ''));
  digits text;
BEGIN
  IF trimmed = '' THEN RETURN NULL; END IF;
  digits := regexp_replace(trimmed, '[^0-9]', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;

  IF left(trimmed, 1) = '+' THEN
    IF char_length(digits) BETWEEN 8 AND 15 THEN RETURN '+' || digits; END IF;
    RETURN NULL;
  END IF;

  IF char_length(digits) IN (10, 11) THEN RETURN '+55' || digits; END IF;
  IF char_length(digits) IN (12, 13) AND left(digits, 2) = '55' THEN RETURN '+' || digits; END IF;
  RETURN NULL;
END;
$$;

-- Mirrors normalizeEstablishmentClientEmail in
-- packages/validation/src/establishment-client.ts.
CREATE OR REPLACE FUNCTION public.normalize_establishment_client_email(target_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  normalized text := lower(btrim(COALESCE(target_email, '')));
BEGIN
  IF normalized = '' OR char_length(normalized) > 254 THEN RETURN NULL; END IF;
  IF normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RETURN NULL; END IF;
  RETURN normalized;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_establishment_client_phone(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_establishment_client_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_establishment_client_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_establishment_client_email(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Provenance, consent and activity columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.establishment_clients
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_provider text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS normalized_email text,
  ADD COLUMN IF NOT EXISTS marketing_consent_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Drop every check that still describes the two-state lifecycle by definition
-- rather than by name: a generated constraint name that did not match would
-- silently survive the rewrite below and keep rejecting 'archived'.
DO $$
DECLARE
  stale_constraint text;
BEGIN
  FOR stale_constraint IN
    SELECT conname
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.establishment_clients'::regclass
      AND contype = 'c'
      AND pg_catalog.pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_catalog.pg_get_constraintdef(oid) NOT LIKE '%archived%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.establishment_clients DROP CONSTRAINT %I',
      stale_constraint
    );
  END LOOP;
END;
$$;

ALTER TABLE public.establishment_clients
  ADD CONSTRAINT establishment_clients_status_check
    CHECK (status IN ('active', 'archived', 'merged')),
  ADD CONSTRAINT establishment_clients_merge_state_check CHECK (
    (status = 'merged' AND merged_into_id IS NOT NULL AND merged_into_id <> id)
    OR (status <> 'merged' AND merged_into_id IS NULL)
  ),
  ADD CONSTRAINT establishment_clients_archived_state_check CHECK (
    (status = 'archived' AND archived_at IS NOT NULL)
    OR (status <> 'archived' AND archived_at IS NULL)
  ),
  ADD CONSTRAINT establishment_clients_source_check
    CHECK (source IN ('manual', 'walk_in', 'client_booking', 'import')),
  ADD CONSTRAINT establishment_clients_source_provider_check CHECK (
    source_provider IS NULL OR source_provider ~ '^[a-z][a-z0-9_]{1,39}$'
  ),
  ADD CONSTRAINT establishment_clients_external_id_check CHECK (
    external_id IS NULL OR char_length(btrim(external_id)) BETWEEN 1 AND 128
  ),
  -- An external identifier is meaningless without the platform it came from,
  -- and an imported row must always name its origin.
  ADD CONSTRAINT establishment_clients_external_origin_check CHECK (
    (external_id IS NULL OR source_provider IS NOT NULL)
    AND (source <> 'import' OR source_provider IS NOT NULL)
  ),
  ADD CONSTRAINT establishment_clients_marketing_consent_check
    CHECK (marketing_consent_status IN ('unknown', 'granted', 'revoked')),
  -- An explicit consent decision is only trustworthy with a date attached.
  ADD CONSTRAINT establishment_clients_marketing_consent_state_check CHECK (
    (marketing_consent_status = 'unknown' AND marketing_consent_at IS NULL)
    OR (marketing_consent_status <> 'unknown' AND marketing_consent_at IS NOT NULL)
  ),
  ADD CONSTRAINT establishment_clients_activity_order_check CHECK (
    first_appointment_at IS NULL
    OR last_appointment_at IS NULL
    OR first_appointment_at <= last_appointment_at
  );

-- Reimporting the same source row updates instead of creating a second client.
CREATE UNIQUE INDEX IF NOT EXISTS establishment_clients_external_unique
  ON public.establishment_clients (establishment_id, source_provider, external_id)
  WHERE external_id IS NOT NULL;

-- Normalized contacts drive duplicate hints and tolerant search. They are
-- deliberately not unique: relatives and dependants share a phone, and a hard
-- constraint would block legitimate registrations.
CREATE INDEX IF NOT EXISTS establishment_clients_normalized_phone_idx
  ON public.establishment_clients (establishment_id, normalized_phone)
  WHERE status = 'active' AND normalized_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS establishment_clients_normalized_email_idx
  ON public.establishment_clients (establishment_id, normalized_email)
  WHERE status = 'active' AND normalized_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS establishment_clients_archived_idx
  ON public.establishment_clients (establishment_id, archived_at DESC)
  WHERE status = 'archived';

-- ---------------------------------------------------------------------------
-- Derived columns kept by triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_establishment_client_normalization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.normalized_phone := public.normalize_establishment_client_phone(NEW.phone);
  NEW.normalized_email := public.normalize_establishment_client_email(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_establishment_client_normalization
  ON public.establishment_clients;
CREATE TRIGGER set_establishment_client_normalization
BEFORE INSERT OR UPDATE OF phone, email
ON public.establishment_clients
FOR EACH ROW EXECUTE FUNCTION public.set_establishment_client_normalization();

UPDATE public.establishment_clients
SET normalized_phone = public.normalize_establishment_client_phone(phone),
    normalized_email = public.normalize_establishment_client_email(email)
WHERE phone IS NOT NULL OR email IS NOT NULL;

-- Activity aggregates ignore pending and cancelled rows: a booking that never
-- reached the chair is not attendance history. Refreshing them bumps
-- updated_at on the client row, which is accepted as "the row changed".
CREATE OR REPLACE FUNCTION public.refresh_establishment_client_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_ids uuid[] := ARRAY[]::uuid[];
  target_client_id uuid;
BEGIN
  -- OLD and NEW are read under separate branches on purpose: reading the
  -- unassigned record of the current operation raises at runtime.
  IF TG_OP <> 'INSERT' THEN
    IF OLD.establishment_client_id IS NOT NULL THEN
      affected_ids := array_append(affected_ids, OLD.establishment_client_id);
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.establishment_client_id IS NOT NULL
      AND NOT (NEW.establishment_client_id = ANY (affected_ids))
    THEN
      affected_ids := array_append(affected_ids, NEW.establishment_client_id);
    END IF;
  END IF;

  FOREACH target_client_id IN ARRAY affected_ids LOOP
    UPDATE public.establishment_clients AS client
    SET first_appointment_at = activity.first_at,
        last_appointment_at = activity.last_at
    FROM (
      SELECT min(appointment.date_time) AS first_at,
             max(appointment.date_time) AS last_at
      FROM public.appointments AS appointment
      WHERE appointment.establishment_client_id = target_client_id
        AND appointment.deleted_at IS NULL
        AND appointment.status IN ('confirmed', 'completed', 'no_show')
    ) AS activity
    WHERE client.id = target_client_id
      AND (
        client.first_appointment_at IS DISTINCT FROM activity.first_at
        OR client.last_appointment_at IS DISTINCT FROM activity.last_at
      );
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS refresh_establishment_client_activity_trigger
  ON public.appointments;
CREATE TRIGGER refresh_establishment_client_activity_trigger
AFTER INSERT OR DELETE OR UPDATE OF
  status, date_time, deleted_at, establishment_client_id
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.refresh_establishment_client_activity();

-- Trigger functions are still reachable as RPCs unless revoked, and this one
-- runs as definer. The trigger itself keeps working: it executes as the table
-- owner, not as the caller.
REVOKE ALL ON FUNCTION public.refresh_establishment_client_activity()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_establishment_client_normalization()
  FROM PUBLIC, anon, authenticated;

UPDATE public.establishment_clients AS client
SET first_appointment_at = activity.first_at,
    last_appointment_at = activity.last_at
FROM (
  SELECT appointment.establishment_client_id AS client_id,
         min(appointment.date_time) AS first_at,
         max(appointment.date_time) AS last_at
  FROM public.appointments AS appointment
  WHERE appointment.establishment_client_id IS NOT NULL
    AND appointment.deleted_at IS NULL
    AND appointment.status IN ('confirmed', 'completed', 'no_show')
  GROUP BY appointment.establishment_client_id
) AS activity
WHERE client.id = activity.client_id;

-- ---------------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.establishment_clients.source IS
  'How the row entered the directory: manual, walk_in, client_booking or import.';
COMMENT ON COLUMN public.establishment_clients.external_id IS
  'Identifier owned by the source platform. Unique per establishment and provider, which makes reimporting the same file idempotent.';
COMMENT ON COLUMN public.establishment_clients.normalized_phone IS
  'Derived by trigger from phone. Duplicate hint only; never unique.';
COMMENT ON COLUMN public.establishment_clients.normalized_email IS
  'Derived by trigger from email. Duplicate hint only; never unique.';
COMMENT ON COLUMN public.establishment_clients.marketing_consent_status IS
  'Imported rows stay unknown. Consent is never inferred from a source file column without evidence.';
COMMENT ON COLUMN public.establishment_clients.first_appointment_at IS
  'Derived from confirmed, completed and no_show appointments.';
COMMENT ON COLUMN public.establishment_clients.last_appointment_at IS
  'Derived from confirmed, completed and no_show appointments.';

COMMIT;
