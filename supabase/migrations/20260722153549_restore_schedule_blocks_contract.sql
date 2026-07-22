BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Reconciles databases where the historical schedule-block migration was only
-- partially applied. Every operation remains safe on a clean migration chain.

CREATE TABLE IF NOT EXISTS public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('break', 'time_off', 'blocked')),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 160),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT schedule_blocks_valid_period CHECK (ends_at > starts_at),
  CONSTRAINT schedule_blocks_max_period CHECK (ends_at <= starts_at + interval '31 days')
);

CREATE INDEX IF NOT EXISTS schedule_blocks_establishment_period_idx
  ON public.schedule_blocks (establishment_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS schedule_blocks_professional_period_idx
  ON public.schedule_blocks (professional_id, starts_at, ends_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.schedule_blocks FROM anon, authenticated;

DROP POLICY IF EXISTS "Operational members read schedule blocks" ON public.schedule_blocks;
CREATE POLICY "Operational members read schedule blocks"
ON public.schedule_blocks
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_active_membership(establishment_id, ARRAY['admin'])
  OR (
    public.has_active_membership(establishment_id, ARRAY['professional', 'admin'])
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
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF range_end <= range_start OR range_end > range_start + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_professional := public.has_active_membership(
    target_establishment_id,
    ARRAY['professional', 'admin']
  );
  SELECT establishment.share_agendas INTO can_view_team
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF NOT actor_is_admin AND NOT actor_is_professional THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT actor_is_admin
    AND (target_professional_id IS NULL OR target_professional_id <> actor_id)
    AND NOT COALESCE(can_view_team, false)
  THEN RAISE EXCEPTION 'forbidden'; END IF;

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
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_start <= now() THEN RAISE EXCEPTION 'schedule_block_must_be_in_future'; END IF;
  IF requested_end <= requested_start OR requested_end > requested_start + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;
  IF requested_kind NOT IN ('break', 'time_off', 'blocked') THEN RAISE EXCEPTION 'invalid_schedule_block_kind'; END IF;
  IF char_length(COALESCE(requested_reason, '')) > 160 THEN RAISE EXCEPTION 'schedule_block_reason_too_long'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_owner := actor_id = target_professional_id
    AND public.has_active_membership(target_establishment_id, ARRAY['professional', 'admin']);
  IF NOT actor_is_admin AND NOT actor_is_owner THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM profile.id
  FROM public.profiles profile
  JOIN public.memberships membership
    ON membership.profile_id = profile.id
    AND membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.role IN ('professional', 'admin')
  WHERE profile.id = target_professional_id
    AND profile.deleted_at IS NULL
  FOR UPDATE OF profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.professional_id = target_professional_id
      AND appointment.status IN ('pending', 'confirmed')
      AND appointment.deleted_at IS NULL
      AND appointment.date_time < requested_end
      AND appointment.ends_at > requested_start
  ) THEN RAISE EXCEPTION 'schedule_block_conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks block
    WHERE block.establishment_id = target_establishment_id
      AND block.professional_id = target_professional_id
      AND block.deleted_at IS NULL
      AND block.starts_at < requested_end
      AND block.ends_at > requested_start
  ) THEN RAISE EXCEPTION 'schedule_block_overlap'; END IF;

  INSERT INTO public.schedule_blocks (
    establishment_id, professional_id, starts_at, ends_at, kind, reason, created_by
  ) VALUES (
    target_establishment_id, target_professional_id, requested_start, requested_end,
    requested_kind, NULLIF(trim(requested_reason), ''), actor_id
  ) RETURNING id INTO created_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, 'schedule_block_created', target_establishment_id, target_professional_id,
    jsonb_build_object('schedule_block_id', created_block_id, 'kind', requested_kind,
      'starts_at', requested_start, 'ends_at', requested_end)
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
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO current_block
  FROM public.schedule_blocks block
  WHERE block.id = target_block_id AND block.deleted_at IS NULL
  FOR UPDATE;
  IF current_block.id IS NULL THEN RAISE EXCEPTION 'schedule_block_not_found'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_block.establishment_id, ARRAY['admin']);
  IF NOT actor_is_admin AND current_block.professional_id <> actor_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT actor_is_admin
    AND NOT public.has_active_membership(current_block.establishment_id, ARRAY['professional', 'admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.schedule_blocks
  SET deleted_at = now(), updated_at = now()
  WHERE id = target_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, 'schedule_block_deleted', current_block.establishment_id, current_block.professional_id,
    jsonb_build_object('schedule_block_id', current_block.id, 'kind', current_block.kind,
      'starts_at', current_block.starts_at, 'ends_at', current_block.ends_at)
  );

  RETURN target_block_id;
END;
$$;

-- Preserve the centralized availability implementation as the base calculation,
-- then decorate its slots with schedule block information.
DO $$
BEGIN
  IF to_regprocedure('public.compute_available_slots_before_schedule_blocks(uuid,uuid,text,date,text)') IS NULL THEN
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
    CASE WHEN base.available AND COALESCE(overlap.blocked, false) THEN 'blocked' ELSE base.unavailable_reason END
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
  IF to_regprocedure('public.create_appointment_before_schedule_blocks(uuid,uuid,text,timestamptz,text,uuid)') IS NULL THEN
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
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  RETURN public.create_appointment_before_schedule_blocks(
    target_establishment_id, target_professional_id, target_service_id,
    target_date_time, target_client_name, target_client_id
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.reschedule_appointment_before_schedule_blocks(text,timestamptz,uuid,text)') IS NULL THEN
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
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

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

NOTIFY pgrst, 'reload schema';
COMMIT;
