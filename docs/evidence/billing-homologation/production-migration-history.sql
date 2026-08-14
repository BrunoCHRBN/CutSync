SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict ygps2TyP5dwNLydVlm2dhjyvvleJZ3WM9d8J4pJbDobU2bX0lE4OdwLUtfomDem

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: supabase_migrations; Owner: postgres
--

INSERT INTO "supabase_migrations"."schema_migrations" ("version", "statements", "name", "created_by", "idempotency_key", "rollback") VALUES
	('20260329000000', '{"-- Publicação necessária para os hooks postgres_changes do aplicativo.
-- Seguro para executar mais de uma vez no SQL Editor do Supabase.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    ''appointments'',
    ''establishments'',
    ''profiles'',
    ''services'',
    ''professional_services'',
    ''profile_establishments''
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = ''supabase_realtime''
        AND schemaname = ''public''
        AND tablename = table_name
    ) THEN
      EXECUTE format(''ALTER PUBLICATION supabase_realtime ADD TABLE public.%I'', table_name);
    END IF;
  END LOOP;
END $$","-- Garante payload completo em updates/deletes filtrados pelo cliente Realtime.
ALTER TABLE public.appointments REPLICA IDENTITY FULL","ALTER TABLE public.establishments REPLICA IDENTITY FULL","ALTER TABLE public.profiles REPLICA IDENTITY FULL","ALTER TABLE public.services REPLICA IDENTITY FULL","ALTER TABLE public.professional_services REPLICA IDENTITY FULL","ALTER TABLE public.profile_establishments REPLICA IDENTITY FULL"}', 'enable_realtime', NULL, NULL, NULL),
	('20260329001000', '{"-- Catálogo público seguro: expõe somente dados necessários para perfil e reserva.
CREATE OR REPLACE FUNCTION public.get_public_team(target_establishment_id uuid)
RETURNS TABLE (
  id uuid,
  establishment_id uuid,
  name text,
  role text,
  email text,
  phone text,
  avatar_url text,
  commission_rate numeric,
  work_hours text,
  specialties text,
  instagram text,
  titulo_profissional text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profiles.id,
    profiles.establishment_id,
    profiles.name,
    profiles.role,
    ''''::text AS email,
    NULL::text AS phone,
    profiles.avatar_url,
    NULL::numeric AS commission_rate,
    profiles.work_hours,
    profiles.specialties,
    profiles.instagram,
    NULL::text AS titulo_profissional
  FROM public.profiles
  WHERE profiles.establishment_id = target_establishment_id
    AND profiles.role IN (''professional'', ''admin'')
    AND profiles.deleted_at IS NULL
  ORDER BY profiles.name;
$$","REVOKE ALL ON FUNCTION public.get_public_team(uuid) FROM PUBLIC","GRANT EXECUTE ON FUNCTION public.get_public_team(uuid) TO anon, authenticated","DROP POLICY IF EXISTS \"Leitura pública de configurações de barbeiro\" ON public.professional_services","CREATE POLICY \"Leitura pública de configurações de barbeiro\" ON public.professional_services
  FOR SELECT TO anon, authenticated USING (true)"}', 'public_catalog', NULL, NULL, NULL),
	('20260716049000', '{}', '20260716049000_remote_schema_compatibility', NULL, NULL, NULL),
	('20260716050000', '{}', '20260716050000_secure_memberships_and_invites', NULL, NULL, NULL),
	('20260716051000', '{}', '20260716051000_finalize_p0_authorization', NULL, NULL, NULL),
	('20260716052000', '{}', '20260716052000_privacy_audit_and_professional_profiles', NULL, NULL, NULL),
	('20260716053000', '{}', '20260716053000_secure_professional_gallery_storage', NULL, NULL, NULL),
	('20260716054000', '{}', '20260716054000_secure_appointments_and_services', NULL, NULL, NULL),
	('20260716055000', '{}', '20260716055000_finalize_appointment_authorization', NULL, NULL, NULL),
	('20260716056000', '{}', '20260716056000_fix_professional_profile_upsert', NULL, NULL, NULL),
	('20260716057000', '{"BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

UPDATE public.appointments appointment
SET duration_minutes = COALESCE(
  (
    SELECT professional_service.duration_minutes
    FROM public.professional_services professional_service
    WHERE professional_service.professional_id = appointment.professional_id
      AND professional_service.service_id = appointment.service_id
      AND professional_service.is_active = true
    LIMIT 1
  ),
  (
    SELECT service.duration_minutes
    FROM public.services service
    WHERE service.id = appointment.service_id
    LIMIT 1
  ),
  30
)
WHERE appointment.duration_minutes IS NULL;

UPDATE public.appointments
SET ends_at = date_time + make_interval(mins => duration_minutes)
WHERE ends_at IS NULL;

ALTER TABLE public.appointments
  ALTER COLUMN duration_minutes SET DEFAULT 30,
  ALTER COLUMN duration_minutes SET NOT NULL,
  ALTER COLUMN ends_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = ''appointments_duration_minutes_check''
      AND conrelid = ''public.appointments''::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_duration_minutes_check
      CHECK (duration_minutes BETWEEN 1 AND 1440);
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = ''appointments_valid_time_range_check''
      AND conrelid = ''public.appointments''::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_valid_time_range_check
      CHECK (ends_at > date_time);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_appointment_duration_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_duration integer;
BEGIN
  IF TG_OP = ''INSERT''
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.duration_minutes IS NULL
  THEN
    SELECT COALESCE(professional_service.duration_minutes, service.duration_minutes)
    INTO resolved_duration
    FROM public.services service
    LEFT JOIN public.professional_services professional_service
      ON professional_service.professional_id = NEW.professional_id
      AND professional_service.service_id = service.id
      AND professional_service.establishment_id = NEW.establishment_id
      AND professional_service.is_active = true
    WHERE service.id = NEW.service_id
      AND service.establishment_id = NEW.establishment_id
      AND service.deleted_at IS NULL
      AND service.is_active = true;

    IF resolved_duration IS NULL THEN
      RAISE EXCEPTION ''service_unavailable'';
    END IF;

    NEW.duration_minutes := resolved_duration;
  END IF;

  NEW.ends_at := NEW.date_time + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_duration_snapshot ON public.appointments;
CREATE TRIGGER set_appointment_duration_snapshot
  BEFORE INSERT OR UPDATE OF service_id, professional_id, establishment_id, date_time
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_duration_snapshot();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.appointments first_appointment
    JOIN public.appointments second_appointment
      ON second_appointment.professional_id = first_appointment.professional_id
      AND second_appointment.id > first_appointment.id
      AND tstzrange(second_appointment.date_time, second_appointment.ends_at, ''[)'')
        && tstzrange(first_appointment.date_time, first_appointment.ends_at, ''[)'')
    WHERE first_appointment.status IN (''pending'', ''confirmed'')
      AND second_appointment.status IN (''pending'', ''confirmed'')
      AND first_appointment.deleted_at IS NULL
      AND second_appointment.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION ''existing_appointment_conflicts'';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = ''appointments_no_professional_overlap''
      AND conrelid = ''public.appointments''::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_no_professional_overlap
      EXCLUDE USING gist (
        professional_id WITH =,
        tstzrange(date_time, ends_at, ''[)'') WITH &&
      )
      WHERE (status IN (''pending'', ''confirmed'') AND deleted_at IS NULL)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_client_name text DEFAULT NULL,
  target_client_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional boolean;
  effective_client_id uuid;
  effective_client_name text;
  initial_status text;
  created_appointment_id text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION ''authentication_required''; END IF;
  IF target_date_time <= now() THEN RAISE EXCEPTION ''appointment_must_be_in_future''; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY[''admin'']);
  actor_is_professional := target_professional_id = actor_id
    AND public.has_active_membership(target_establishment_id, ARRAY[''professional'', ''admin'']);

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships membership
    WHERE membership.profile_id = target_professional_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = ''active''
      AND membership.role IN (''professional'', ''admin'')
  ) THEN RAISE EXCEPTION ''professional_unavailable''; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.services service
    WHERE service.id = target_service_id
      AND service.establishment_id = target_establishment_id
      AND service.is_active = true
      AND service.deleted_at IS NULL
  ) THEN RAISE EXCEPTION ''service_unavailable''; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.professional_services professional_service
    WHERE professional_service.professional_id = target_professional_id
      AND professional_service.service_id = target_service_id
      AND professional_service.establishment_id = target_establishment_id
      AND professional_service.is_active = false
  ) THEN RAISE EXCEPTION ''service_unavailable_for_professional''; END IF;

  IF actor_is_admin OR actor_is_professional THEN
    effective_client_id := target_client_id;
    IF effective_client_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles profile WHERE profile.id = effective_client_id
    ) THEN RAISE EXCEPTION ''client_not_found''; END IF;
    effective_client_name := NULLIF(trim(target_client_name), '''');
    IF effective_client_id IS NULL AND effective_client_name IS NULL THEN
      RAISE EXCEPTION ''client_name_required'';
    END IF;
    initial_status := ''confirmed'';
  ELSE
    IF target_client_id IS NOT NULL AND target_client_id <> actor_id THEN
      RAISE EXCEPTION ''forbidden'';
    END IF;
    effective_client_id := actor_id;
    SELECT profile.name INTO effective_client_name
    FROM public.profiles profile WHERE profile.id = actor_id;
    IF effective_client_name IS NULL THEN RAISE EXCEPTION ''profile_not_found''; END IF;
    initial_status := ''pending'';
  END IF;

  INSERT INTO public.appointments (
    establishment_id, client_id, client_name, professional_id, service_id,
    date_time, status, reschedule_count
  ) VALUES (
    target_establishment_id, effective_client_id, effective_client_name,
    target_professional_id, target_service_id, target_date_time,
    initial_status, 0
  )
  RETURNING id INTO created_appointment_id;

  RETURN created_appointment_id;
EXCEPTION
  WHEN exclusion_violation THEN
    RAISE EXCEPTION ''appointment_conflict'' USING ERRCODE = ''23P01'';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_busy_slots(
  target_professional_id uuid,
  range_start timestamptz,
  range_end timestamptz
)
RETURNS TABLE (date_time timestamptz, duration_minutes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF range_end <= range_start OR range_end > range_start + interval ''31 days'' THEN
    RAISE EXCEPTION ''invalid_availability_range'';
  END IF;

  RETURN QUERY
  SELECT appointment.date_time, appointment.duration_minutes
  FROM public.appointments appointment
  WHERE appointment.professional_id = target_professional_id
    AND appointment.status IN (''pending'', ''confirmed'')
    AND appointment.deleted_at IS NULL
    AND appointment.date_time < range_end
    AND appointment.ends_at > range_start
  ORDER BY appointment.date_time;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.appointments FROM authenticated;
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_busy_slots(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_appointment_duration_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_busy_slots(uuid, timestamptz, timestamptz) TO anon, authenticated;

NOTIFY pgrst, ''reload schema'';

COMMIT;"}', 'transactional_appointment_creation', NULL, NULL, NULL),
	('20260717010000', '{"BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  ''professional-gallery'',
  ''professional-gallery'',
  true,
  15728640,
  ARRAY[''image/jpeg'', ''image/png'', ''image/webp'', ''image/heic'', ''image/heif'']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS \"Public reads professional gallery\" ON storage.objects;
CREATE POLICY \"Public reads professional gallery\" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = ''professional-gallery'');

DROP POLICY IF EXISTS \"Professionals upload own gallery\" ON storage.objects;
CREATE POLICY \"Professionals upload own gallery\" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ''professional-gallery''
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.memberships membership
      WHERE membership.profile_id = (SELECT auth.uid())
        AND membership.role IN (''professional'', ''admin'')
        AND membership.status = ''active''
    )
  );

DROP POLICY IF EXISTS \"Professionals delete own gallery\" ON storage.objects;
CREATE POLICY \"Professionals delete own gallery\" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = ''professional-gallery''
    AND owner_id = (SELECT auth.uid())::text
  );

COMMIT;"}', 'professional_gallery_storage', NULL, NULL, NULL),
	('20260717011000', '{"BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_professional(
  target_profile_id uuid,
  target_establishment_id uuid,
  updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_commission numeric;
  changed_fields integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION ''authentication_required''; END IF;
  IF NOT public.has_active_membership(target_establishment_id, ARRAY[''admin''])
  THEN RAISE EXCEPTION ''forbidden''; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.role = ''professional''
      AND membership.status = ''active''
  ) THEN RAISE EXCEPTION ''professional_membership_required''; END IF;
  IF updates IS NULL OR jsonb_typeof(updates) <> ''object''
  THEN RAISE EXCEPTION ''invalid_updates''; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(updates) key
    WHERE key NOT IN (''commission_rate'', ''specialties'', ''instagram'', ''titulo_profissional'', ''work_hours'')
  ) THEN RAISE EXCEPTION ''unsupported_professional_field''; END IF;

  IF updates ? ''commission_rate'' THEN
    new_commission := (updates->>''commission_rate'')::numeric;
    IF new_commission < 0 OR new_commission > 1 THEN RAISE EXCEPTION ''invalid_commission''; END IF;
    UPDATE public.memberships SET commission_rate = new_commission, updated_at = now()
    WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;
  END IF;

  IF updates ? ''work_hours'' THEN
    BEGIN
      IF jsonb_typeof((updates->>''work_hours'')::jsonb) <> ''array''
      THEN RAISE EXCEPTION ''invalid_work_hours''; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION ''invalid_work_hours'';
    END;
  END IF;

  UPDATE public.profiles SET
    commission_rate = COALESCE(new_commission, commission_rate),
    specialties = CASE WHEN updates ? ''specialties'' THEN NULLIF(trim(updates->>''specialties''), '''') ELSE specialties END,
    instagram = CASE WHEN updates ? ''instagram'' THEN NULLIF(trim(leading ''@'' FROM updates->>''instagram''), '''') ELSE instagram END,
    titulo_profissional = CASE WHEN updates ? ''titulo_profissional'' THEN NULLIF(trim(updates->>''titulo_profissional''), '''') ELSE titulo_profissional END,
    work_hours = CASE WHEN updates ? ''work_hours'' THEN updates->>''work_hours'' ELSE work_hours END,
    updated_at = now()
  WHERE id = target_profile_id;

  SELECT count(*)::integer INTO changed_fields FROM jsonb_object_keys(updates);
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), ''professional.updated'', target_establishment_id, target_profile_id,
    jsonb_build_object(''fields_changed'', changed_fields));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_professional(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_professional(uuid, uuid, jsonb) TO authenticated;

COMMIT;"}', 'fix_professional_admin_updates', NULL, NULL, NULL),
	('20260717012000', '{"BEGIN;

DROP POLICY IF EXISTS \"Public reads professional gallery bucket\" ON storage.buckets;
CREATE POLICY \"Public reads professional gallery bucket\" ON storage.buckets
  FOR SELECT TO anon, authenticated
  USING (id = ''professional-gallery'');

COMMIT;"}', 'professional_gallery_bucket_visibility', NULL, NULL, NULL),
	('20260722153015', '{"BEGIN;

-- Existing Supabase projects may have granted EXECUTE directly to anon when
-- these functions were created. Revoking PUBLIC alone does not remove that
-- direct grant, so keep the multi-app RPC surface authenticated-only.
REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.unregister_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unregister_push_device(text) FROM anon;

REVOKE ALL ON FUNCTION public.get_my_operational_contexts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_operational_contexts() FROM anon;

GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_operational_contexts() TO authenticated, service_role;

NOTIFY pgrst, ''reload schema'';

COMMIT;"}', 'harden_multi_app_rpc_grants', 'brusantos777@gmail.com', NULL, NULL),
	('20260722153549', '{"BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Reconciles databases where the historical schedule-block migration was only
-- partially applied. Every operation remains safe on a clean migration chain.

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN (''break'', ''time_off'', ''blocked'')),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 160),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT schedule_blocks_valid_period CHECK (ends_at > starts_at),
  CONSTRAINT schedule_blocks_max_period CHECK (ends_at <= starts_at + interval ''31 days'')
);

CREATE INDEX IF NOT EXISTS schedule_blocks_establishment_period_idx
  ON public.schedule_blocks (establishment_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS schedule_blocks_professional_period_idx
  ON public.schedule_blocks (professional_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schedule_blocks FROM anon, authenticated;

DROP POLICY IF EXISTS \"Operational members read schedule blocks\" ON public.schedule_blocks;
CREATE POLICY \"Operational members read schedule blocks\"
ON public.schedule_blocks
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_active_membership(establishment_id, ARRAY[''admin''])
  OR (
    public.has_active_membership(establishment_id, ARRAY[''professional'', ''admin''])
    AND (
      professional_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.establishments establishment
        WHERE establishment.id = schedule_blocks.establishment_id
          AND establishment.share_agendas = true
      )
    )
  )
);

GRANT SELECT ON TABLE public.schedule_blocks TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_blocks;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_schedule_blocks(
  target_establishment_id uuid,
  range_start timestamptz,
  range_end timestamptz,
  target_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  establishment_id uuid,
  professional_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  kind text,
  reason text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional boolean;
  can_view_team boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION ''authentication_required''; END IF;
  IF range_end <= range_start OR range_end > range_start + interval ''31 days'' THEN
    RAISE EXCEPTION ''invalid_schedule_block_range'';
  END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY[''admin'']);
  actor_is_professional := public.has_active_membership(
    target_establishment_id,
    ARRAY[''professional'', ''admin'']
  );
  SELECT establishment.share_agendas INTO can_view_team
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF NOT actor_is_admin AND NOT actor_is_professional THEN RAISE EXCEPTION ''forbidden''; END IF;
  IF NOT actor_is_admin
    AND (target_professional_id IS NULL OR target_professional_id <> actor_id)
    AND NOT COALESCE(can_view_team, false)
  THEN RAISE EXCEPTION ''forbidden''; END IF;

  RETURN QUERY
  SELECT block.id, block.establishment_id, block.professional_id,
    block.starts_at, block.ends_at, block.kind, block.reason,
    block.created_by, block.created_at, block.updated_at
  FROM public.schedule_blocks block
  WHERE block.establishment_id = target_establishment_id
    AND block.deleted_at IS NULL
    AND (target_professional_id IS NULL OR block.professional_id = target_professional_id)
    AND block.starts_at < range_end
    AND block.ends_at > range_start
  ORDER BY block.starts_at, block.professional_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_schedule_block(
  target_establishment_id uuid,
  target_professional_id uuid,
  requested_start timestamptz,
  requested_end timestamptz,
  requested_kind text,
  requested_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_owner boolean;
  created_block_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION ''authentication_required''; END IF;
  IF requested_start <= now() THEN RAISE EXCEPTION ''schedule_block_must_be_in_future''; END IF;
  IF requested_end <= requested_start OR requested_end > requested_start + interval ''31 days'' THEN
    RAISE EXCEPTION ''invalid_schedule_block_range'';
  END IF;
  IF requested_kind NOT IN (''break'', ''time_off'', ''blocked'') THEN RAISE EXCEPTION ''invalid_schedule_block_kind''; END IF;
  IF char_length(COALESCE(requested_reason, '''')) > 160 THEN RAISE EXCEPTION ''schedule_block_reason_too_long''; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY[''admin'']);
  actor_is_owner := actor_id = target_professional_id
    AND public.has_active_membership(target_establishment_id, ARRAY[''professional'', ''admin'']);
  IF NOT actor_is_admin AND NOT actor_is_owner THEN RAISE EXCEPTION ''forbidden''; END IF;

  PERFORM profile.id
  FROM public.profiles profile
  JOIN public.memberships membership
    ON membership.profile_id = profile.id
    AND membership.establishment_id = target_establishment_id
    AND membership.status = ''active''
    AND membership.role IN (''professional'', ''admin'')
  WHERE profile.id = target_professional_id
    AND profile.deleted_at IS NULL
  FOR UPDATE OF profile;
  IF NOT FOUND THEN RAISE EXCEPTION ''professional_unavailable''; END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.professional_id = target_professional_id
      AND appointment.status IN (''pending'', ''confirmed'')
      AND appointment.deleted_at IS NULL
      AND appointment.date_time < requested_end
      AND appointment.ends_at > requested_start
  ) THEN RAISE EXCEPTION ''schedule_block_conflict''; END IF;

  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks block
    WHERE block.establishment_id = target_establishment_id
      AND block.professional_id = target_professional_id
      AND block.deleted_at IS NULL
      AND block.starts_at < requested_end
      AND block.ends_at > requested_start
  ) THEN RAISE EXCEPTION ''schedule_block_overlap''; END IF;

  INSERT INTO public.schedule_blocks (
    establishment_id, professional_id, starts_at, ends_at, kind, reason, created_by
  ) VALUES (
    target_establishment_id, target_professional_id, requested_start, requested_end,
    requested_kind, NULLIF(trim(requested_reason), ''''), actor_id
  ) RETURNING id INTO created_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, ''schedule_block_created'', target_establishment_id, target_professional_id,
    jsonb_build_object(''schedule_block_id'', created_block_id, ''kind'', requested_kind,
      ''starts_at'', requested_start, ''ends_at'', requested_end)
  );

  RETURN created_block_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_schedule_block(target_block_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_block public.schedule_blocks%ROWTYPE;
  actor_is_admin boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION ''authentication_required''; END IF;

  SELECT * INTO current_block
  FROM public.schedule_blocks block
  WHERE block.id = target_block_id AND block.deleted_at IS NULL
  FOR UPDATE;
  IF current_block.id IS NULL THEN RAISE EXCEPTION ''schedule_block_not_found''; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_block.establishment_id, ARRAY[''admin'']);
  IF NOT actor_is_admin AND current_block.professional_id <> actor_id THEN RAISE EXCEPTION ''forbidden''; END IF;
  IF NOT actor_is_admin
    AND NOT public.has_active_membership(current_block.establishment_id, ARRAY[''professional'', ''admin''])
  THEN RAISE EXCEPTION ''forbidden''; END IF;

  UPDATE public.schedule_blocks
  SET deleted_at = now(), updated_at = now()
  WHERE id = target_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, ''schedule_block_deleted'', current_block.establishment_id, current_block.professional_id,
    jsonb_build_object(''schedule_block_id'', current_block.id, ''kind'', current_block.kind,
      ''starts_at'', current_block.starts_at, ''ends_at'', current_block.ends_at)
  );

  RETURN target_block_id;
END;
$$;

-- Preserve the centralized availability implementation as the base calculation,
-- then decorate its slots with schedule block information.
DO $$
BEGIN
  IF to_regprocedure(''public.compute_available_slots_before_schedule_blocks(uuid,uuid,text,date,text)'') IS NULL THEN
    ALTER FUNCTION public.compute_available_slots(uuid, uuid, text, date, text)
      RENAME TO compute_available_slots_before_schedule_blocks;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.compute_available_slots(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_local_date date,
  ignored_appointment_id text DEFAULT NULL
)
RETURNS TABLE (
  starts_at timestamptz,
  local_time text,
  duration_minutes integer,
  available boolean,
  unavailable_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT base.starts_at,
    base.local_time,
    base.duration_minutes,
    CASE WHEN base.available AND COALESCE(overlap.blocked, false) THEN false ELSE base.available END,
    CASE WHEN base.available AND COALESCE(overlap.blocked, false) THEN ''blocked'' ELSE base.unavailable_reason END
  FROM public.compute_available_slots_before_schedule_blocks(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_local_date,
    ignored_appointment_id
  ) base
  LEFT JOIN LATERAL (
    SELECT true AS blocked
    FROM public.schedule_blocks block
    WHERE base.starts_at IS NOT NULL
      AND block.establishment_id = target_establishment_id
      AND block.professional_id = target_professional_id
      AND block.deleted_at IS NULL
      AND block.starts_at < base.starts_at + make_interval(mins => base.duration_minutes)
      AND block.ends_at > base.starts_at
    LIMIT 1
  ) overlap ON true;
$$;

-- Serialize appointment and block creation through the professional row. The
-- original RPC remains the business-rule authority and now calls the decorated
-- availability function after the lock is acquired.
DO $$
BEGIN
  IF to_regprocedure(''public.create_appointment_before_schedule_blocks(uuid,uuid,text,timestamptz,text,uuid)'') IS NULL THEN
    ALTER FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid)
      RENAME TO create_appointment_before_schedule_blocks;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_client_name text DEFAULT NULL,
  target_client_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM profile.id FROM public.profiles profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION ''professional_unavailable''; END IF;

  RETURN public.create_appointment_before_schedule_blocks(
    target_establishment_id, target_professional_id, target_service_id,
    target_date_time, target_client_name, target_client_id
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure(''public.reschedule_appointment_before_schedule_blocks(text,timestamptz,uuid,text)'') IS NULL THEN
    ALTER FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text)
      RENAME TO reschedule_appointment_before_schedule_blocks;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  target_appointment_id text,
  requested_date_time timestamptz,
  requested_professional_id uuid,
  requested_service_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM profile.id FROM public.profiles profile
  WHERE profile.id = requested_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION ''professional_unavailable''; END IF;

  RETURN public.reschedule_appointment_before_schedule_blocks(
    target_appointment_id, requested_date_time, requested_professional_id, requested_service_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_schedule_blocks(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_schedule_block(uuid, uuid, timestamptz, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_schedule_block(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_available_slots_before_schedule_blocks(uuid, uuid, text, date, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_available_slots(uuid, uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_appointment_before_schedule_blocks(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_appointment_before_schedule_blocks(text, timestamptz, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_schedule_blocks(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_schedule_block(uuid, uuid, timestamptz, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_schedule_block(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_schedule_blocks(uuid, timestamptz, timestamptz, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_schedule_block(uuid, uuid, timestamptz, timestamptz, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_schedule_block(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.compute_available_slots(uuid, uuid, text, date, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_schedule_blocks(uuid, timestamptz, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_schedule_block(uuid, uuid, timestamptz, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_schedule_block(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO service_role;

NOTIFY pgrst, ''reload schema'';
COMMIT;
"}', 'restore_schedule_blocks_contract', 'brusantos777@gmail.com', NULL, NULL),
	('20260728000000', '{BEGIN,"ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS cancellation_note_internal text","ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_cancellation_reason_code_check","ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_cancellation_reason_code_check
  CHECK (
    cancellation_reason_code IS NULL OR cancellation_reason_code IN (
      ''client_work_conflict'', ''client_health'', ''client_transport'',
      ''client_reschedule'', ''client_other'', ''establishment_cancelled'',
      ''professional_cancelled''
    )
  )","UPDATE public.appointments
SET
  cancellation_reason_code = CASE
    WHEN cancellation_reason = ''Imprevisto de trabalho'' THEN ''client_work_conflict''
    WHEN cancellation_reason = ''Questões de saúde'' THEN ''client_health''
    WHEN cancellation_reason = ''Problema de transporte'' THEN ''client_transport''
    WHEN cancellation_reason = ''Vou reagendar'' THEN ''client_reschedule''
    WHEN cancellation_reason = ''Outro'' THEN ''client_other''
    WHEN cancelled_by_role = ''professional'' THEN ''professional_cancelled''
    ELSE ''establishment_cancelled''
  END,
  cancellation_note_internal = CASE
    WHEN cancellation_reason IS NULL OR cancellation_reason IN (
      ''Imprevisto de trabalho'', ''Questões de saúde'', ''Problema de transporte'',
      ''Vou reagendar'', ''Outro''
    ) THEN cancellation_note_internal
    ELSE COALESCE(cancellation_note_internal, cancellation_reason)
  END
WHERE status = ''cancelled'' AND cancellation_reason_code IS NULL","CREATE OR REPLACE FUNCTION public.update_appointment_status_v2(
  target_appointment_id text,
  new_status text,
  new_cancellation_reason_code text DEFAULT NULL,
  new_cancellation_note_internal text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional_member boolean;
  actor_is_owner_client boolean;
  effective_cancelled_by_role text;
  effective_reason_code text;
  effective_min_hours integer;
  current_appointment public.appointments%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION ''authentication_required''; END IF;
  IF new_status NOT IN (''confirmed'', ''cancelled'', ''completed'') THEN RAISE EXCEPTION ''invalid_status_value''; END IF;

  SELECT * INTO current_appointment FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION ''appointment_not_found''; END IF;
  IF current_appointment.status IN (''cancelled'', ''completed'') THEN RAISE EXCEPTION ''appointment_status_immutable''; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY[''admin'']);
  actor_is_professional_member := public.has_active_membership(
    current_appointment.establishment_id, ARRAY[''professional'', ''admin'']
  );
  actor_is_owner_client := current_appointment.client_id = actor_id;

  IF new_status = ''confirmed'' THEN
    IF current_appointment.status <> ''pending'' THEN RAISE EXCEPTION ''invalid_status_transition''; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION ''forbidden''; END IF;
  ELSIF new_status = ''completed'' THEN
    IF current_appointment.status <> ''confirmed'' THEN RAISE EXCEPTION ''invalid_status_transition''; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION ''forbidden''; END IF;
    IF current_appointment.date_time > now() THEN RAISE EXCEPTION ''appointment_not_yet_finished''; END IF;
  ELSE
    IF current_appointment.status NOT IN (''pending'', ''confirmed'') THEN RAISE EXCEPTION ''invalid_status_transition''; END IF;
    IF NOT (actor_is_owner_client OR actor_is_professional_member) THEN RAISE EXCEPTION ''forbidden''; END IF;

    IF actor_is_owner_client AND NOT actor_is_professional_member THEN
      IF new_cancellation_reason_code NOT IN (
        ''client_work_conflict'', ''client_health'', ''client_transport'', ''client_reschedule'', ''client_other''
      ) THEN RAISE EXCEPTION ''invalid_cancellation_reason''; END IF;
      IF NULLIF(trim(COALESCE(new_cancellation_note_internal, '''')), '''') IS NOT NULL THEN RAISE EXCEPTION ''forbidden''; END IF;
      SELECT CASE WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0
        THEN 24 ELSE establishment.min_cancellation_hours END::integer
      INTO effective_min_hours
      FROM public.establishments AS establishment
      WHERE establishment.id = current_appointment.establishment_id;
      IF current_appointment.date_time <= now() THEN RAISE EXCEPTION ''appointment_already_started''; END IF;
      IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
        RAISE EXCEPTION ''cancellation_window_closed'';
      END IF;
      effective_reason_code := new_cancellation_reason_code;
    ELSE
      effective_reason_code := CASE WHEN actor_is_admin THEN ''establishment_cancelled'' ELSE ''professional_cancelled'' END;
    END IF;

    IF actor_is_admin THEN effective_cancelled_by_role := ''admin'';
    ELSIF actor_is_professional_member THEN effective_cancelled_by_role := ''professional'';
    ELSE effective_cancelled_by_role := ''client'';
    END IF;
  END IF;

  UPDATE public.appointments AS appointment SET
    status = new_status,
    cancellation_reason_code = CASE WHEN new_status = ''cancelled'' THEN effective_reason_code ELSE appointment.cancellation_reason_code END,
    cancellation_note_internal = CASE
      WHEN new_status = ''cancelled'' AND (actor_is_admin OR actor_is_professional_member)
        THEN NULLIF(trim(COALESCE(new_cancellation_note_internal, '''')), '''')
      ELSE appointment.cancellation_note_internal
    END,
    cancellation_reason = CASE WHEN new_status = ''cancelled'' THEN effective_reason_code ELSE appointment.cancellation_reason END,
    cancelled_by_role = CASE WHEN new_status = ''cancelled'' THEN effective_cancelled_by_role ELSE appointment.cancelled_by_role END
  WHERE appointment.id = target_appointment_id;

  RETURN target_appointment_id;
END;
$$","REVOKE ALL ON FUNCTION public.update_appointment_status_v2(text, text, text, text) FROM PUBLIC, anon","GRANT EXECUTE ON FUNCTION public.update_appointment_status_v2(text, text, text, text) TO authenticated, service_role","COMMENT ON COLUMN public.appointments.cancellation_reason_code IS
  ''Controlled public cancellation reason. Safe for role-appropriate presentation.''","COMMENT ON COLUMN public.appointments.cancellation_note_internal IS
  ''Internal administrative note. Never expose through client-facing RPCs or UI.''","CREATE OR REPLACE FUNCTION public.get_client_appointments_v2()
RETURNS TABLE (
  appointment_id text,
  appointment_status text,
  starts_at timestamptz,
  reschedule_count integer,
  cancellation_reason_code text,
  cancelled_by_role text,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  establishment_address text,
  establishment_phone text,
  establishment_timezone text,
  establishment_currency text,
  min_cancellation_hours integer,
  service_id text,
  service_name text,
  service_price numeric,
  service_duration_minutes integer,
  professional_id uuid,
  professional_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    appointment.id::text,
    appointment.status,
    appointment.date_time,
    appointment.reschedule_count,
    COALESCE(
      appointment.cancellation_reason_code,
      CASE appointment.cancellation_reason
        WHEN ''Imprevisto de trabalho'' THEN ''client_work_conflict''
        WHEN ''Questões de saúde'' THEN ''client_health''
        WHEN ''Problema de transporte'' THEN ''client_transport''
        WHEN ''Vou reagendar'' THEN ''client_reschedule''
        WHEN ''Outro'' THEN ''client_other''
        ELSE CASE WHEN appointment.cancelled_by_role = ''professional''
          THEN ''professional_cancelled'' ELSE ''establishment_cancelled'' END
      END
    ),
    appointment.cancelled_by_role,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.address,
    establishment.phone,
    establishment.timezone,
    establishment.currency,
    CASE WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0
      THEN 24 ELSE establishment.min_cancellation_hours END::integer,
    service.id,
    COALESCE(service.name, ''Serviço indisponível''),
    service.price,
    service.duration_minutes,
    appointment.professional_id,
    COALESCE(professional.name, ''Profissional indisponível'')
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment ON establishment.id = appointment.establishment_id
  LEFT JOIN public.services AS service ON service.id = appointment.service_id
  LEFT JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND appointment.client_id = (SELECT auth.uid())
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.date_time DESC;
$$","REVOKE ALL ON FUNCTION public.get_client_appointments_v2() FROM PUBLIC, anon","GRANT EXECUTE ON FUNCTION public.get_client_appointments_v2() TO authenticated, service_role",COMMIT}', 'safe_cancellation_contract', NULL, NULL, NULL);


--
-- PostgreSQL database dump complete
--

-- \unrestrict ygps2TyP5dwNLydVlm2dhjyvvleJZ3WM9d8J4pJbDobU2bX0lE4OdwLUtfomDem

RESET ALL;
