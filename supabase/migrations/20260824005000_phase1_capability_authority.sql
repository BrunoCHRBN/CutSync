-- PS1-E1B: Capability Authority Migration (Batch 1)
-- Migrates operational RPC authorization from legacy role checks (has_active_membership with ARRAY['admin'])
-- to effective capability checks using the canonical primitive public.has_business_capability().

BEGIN;

-- 1. Canonical Authorization Primitive
CREATE OR REPLACE FUNCTION public.has_business_capability(
  target_establishment_id uuid,
  required_capability text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  resolved_access_mode text;
  capabilities text[];
BEGIN
  IF caller_id IS NULL OR target_establishment_id IS NULL OR required_capability IS NULL THEN
    RETURN false;
  END IF;

  -- Ensure capability is registered and active in the business catalog
  IF NOT EXISTS (
    SELECT 1 FROM public.business_capability_catalog AS catalog
    WHERE catalog.capability = required_capability AND catalog.active
  ) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(billing.access_mode, 'blocked')
  INTO resolved_access_mode
  FROM public.resolve_business_billing_context(target_establishment_id) AS billing
  LIMIT 1;

  IF resolved_access_mode IS NULL OR resolved_access_mode = 'blocked' THEN
    RETURN false;
  END IF;

  capabilities := public.resolve_business_operational_capabilities(
    target_establishment_id,
    caller_id,
    resolved_access_mode
  );

  RETURN required_capability = ANY(capabilities);
END;
$$;

REVOKE ALL ON FUNCTION public.has_business_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_business_capability(uuid, text) TO authenticated, service_role;

-- 2. Team Management RPCs
-- 2.1 admin_update_professional
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
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_team')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.role = 'professional'
      AND membership.status = 'active'
  ) THEN RAISE EXCEPTION 'professional_membership_required'; END IF;

  IF updates IS NULL OR jsonb_typeof(updates) <> 'object'
  THEN RAISE EXCEPTION 'invalid_updates'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(updates) key
    WHERE key NOT IN ('commission_rate', 'specialties', 'instagram', 'titulo_profissional', 'work_hours')
  ) THEN RAISE EXCEPTION 'unsupported_professional_field'; END IF;

  IF updates ? 'commission_rate' THEN
    new_commission := (updates->>'commission_rate')::numeric;
    IF new_commission < 0 OR new_commission > 1 THEN RAISE EXCEPTION 'invalid_commission'; END IF;
    UPDATE public.memberships SET commission_rate = new_commission, updated_at = now()
    WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;
  END IF;

  IF updates ? 'work_hours' THEN
    BEGIN
      IF jsonb_typeof((updates->>'work_hours')::jsonb) <> 'array'
      THEN RAISE EXCEPTION 'invalid_work_hours'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_work_hours';
    END;
  END IF;

  UPDATE public.profiles SET
    commission_rate = COALESCE(new_commission, commission_rate),
    specialties = CASE WHEN updates ? 'specialties' THEN NULLIF(trim(updates->>'specialties'), '') ELSE specialties END,
    instagram = CASE WHEN updates ? 'instagram' THEN NULLIF(trim(leading '@' FROM updates->>'instagram'), '') ELSE instagram END,
    titulo_profissional = CASE WHEN updates ? 'titulo_profissional' THEN NULLIF(trim(updates->>'titulo_profissional'), '') ELSE titulo_profissional END,
    work_hours = CASE WHEN updates ? 'work_hours' THEN updates->>'work_hours' ELSE work_hours END,
    updated_at = now()
  WHERE id = target_profile_id;

  SELECT count(*)::integer INTO changed_fields FROM jsonb_object_keys(updates);
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'professional.updated', target_establishment_id, target_profile_id,
    jsonb_build_object('fields_changed', changed_fields));
END;
$$;

-- 2.2 remove_professional
CREATE OR REPLACE FUNCTION public.remove_professional(
  target_profile_id uuid,
  target_establishment_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE next_membership public.memberships%ROWTYPE;
BEGIN
  IF NOT public.has_business_capability(target_establishment_id, 'manage_team')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF char_length(trim(COALESCE(reason, ''))) NOT BETWEEN 5 AND 500
  THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;

  UPDATE public.memberships SET status = 'revoked', revoked_at = now(),
    revocation_reason = trim(reason), updated_at = now()
  WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id
    AND role = 'professional' AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_membership_required'; END IF;

  DELETE FROM public.profile_establishments
  WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;

  IF EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = target_profile_id AND profile.establishment_id = target_establishment_id
  ) THEN
    SELECT * INTO next_membership FROM public.memberships
    WHERE profile_id = target_profile_id AND status = 'active' ORDER BY created_at LIMIT 1;
    UPDATE public.profiles SET establishment_id = next_membership.establishment_id,
      role = COALESCE(next_membership.role, 'client'),
      commission_rate = COALESCE(next_membership.commission_rate, 0.50), updated_at = now()
    WHERE id = target_profile_id;
  END IF;
END;
$$;

-- 2.3 revoke_invitation
CREATE OR REPLACE FUNCTION public.revoke_invitation(target_invitation_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_invitation public.invitations%ROWTYPE;
BEGIN
  IF char_length(trim(COALESCE(reason, ''))) NOT BETWEEN 5 AND 500
  THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;

  SELECT * INTO target_invitation FROM public.invitations
  WHERE id = target_invitation_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;

  IF NOT public.is_superadmin() AND NOT public.can_manage_business_invitation(
    target_invitation.establishment_id, target_invitation.role
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.invitations SET status = 'revoked', revoked_at = now(),
    revocation_reason = trim(reason) WHERE id = target_invitation_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'invitation_revoked', target_invitation.establishment_id, NULL,
    jsonb_build_object('invitation_id', target_invitation_id, 'reason', trim(reason))
  );
END;
$$;

-- 3. Schedule Blocks RPCs
-- 3.1 create_schedule_block
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
  actor_can_manage_team boolean;
  actor_can_manage_self boolean;
  created_block_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_start <= now() THEN RAISE EXCEPTION 'schedule_block_must_be_in_future'; END IF;
  IF requested_end <= requested_start OR requested_end > requested_start + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;
  IF requested_kind NOT IN ('break', 'time_off', 'blocked') THEN RAISE EXCEPTION 'invalid_schedule_block_kind'; END IF;
  IF char_length(COALESCE(requested_reason, '')) > 160 THEN RAISE EXCEPTION 'schedule_block_reason_too_long'; END IF;

  actor_can_manage_team := public.is_superadmin()
    OR public.has_business_capability(target_establishment_id, 'manage_team_blocks');
  actor_can_manage_self := actor_id = target_professional_id
    AND public.has_business_capability(target_establishment_id, 'manage_own_blocks');

  IF NOT actor_can_manage_team AND NOT actor_can_manage_self THEN RAISE EXCEPTION 'forbidden'; END IF;

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

-- 3.2 delete_schedule_block
CREATE OR REPLACE FUNCTION public.delete_schedule_block(target_block_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_block public.schedule_blocks%ROWTYPE;
  actor_can_manage_team boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO current_block
  FROM public.schedule_blocks block
  WHERE block.id = target_block_id AND block.deleted_at IS NULL
  FOR UPDATE;
  IF current_block.id IS NULL THEN RAISE EXCEPTION 'schedule_block_not_found'; END IF;

  actor_can_manage_team := public.is_superadmin()
    OR public.has_business_capability(current_block.establishment_id, 'manage_team_blocks');

  IF NOT actor_can_manage_team AND current_block.professional_id <> actor_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT actor_can_manage_team
    AND NOT public.has_business_capability(current_block.establishment_id, 'manage_own_blocks')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.schedule_blocks
  SET deleted_at = now(), updated_at = now()
  WHERE id = target_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, 'schedule_block_deleted', current_block.establishment_id, current_block.professional_id,
    jsonb_build_object('schedule_block_id', target_block_id)
  );

  RETURN target_block_id;
END;
$$;

-- 4. Clients RPCs
-- 4.1 get_establishment_client_contacts
CREATE OR REPLACE FUNCTION public.get_establishment_client_contacts(
  target_establishment_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'view_clients')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    profile.id,
    profile.name,
    profile.email,
    profile.phone
  FROM public.appointments AS appointment
  JOIN public.profiles AS profile ON profile.id = appointment.client_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND profile.deleted_at IS NULL;
END;
$$;

-- 5. Services & Combos RPCs
-- 5.1 replace_service_combo_items
CREATE OR REPLACE FUNCTION public.replace_service_combo_items(
  target_combo_id text,
  target_member_service_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  combo_row public.services%ROWTYPE;
  member_id text;
  member_kind text;
  idx integer := 0;
BEGIN
  SELECT * INTO combo_row FROM public.services WHERE id = target_combo_id AND deleted_at IS NULL;
  IF combo_row.id IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  IF combo_row.kind <> 'combo' THEN RAISE EXCEPTION 'not_a_combo'; END IF;

  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(combo_row.establishment_id, 'manage_services')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_member_service_ids IS NULL OR cardinality(target_member_service_ids) < 2 THEN
    RAISE EXCEPTION 'combo_requires_two_members';
  END IF;

  FOREACH member_id IN ARRAY target_member_service_ids LOOP
    IF member_id = target_combo_id THEN RAISE EXCEPTION 'combo_cannot_include_self'; END IF;
    SELECT service.kind INTO member_kind
    FROM public.services AS service
    WHERE service.id = member_id
      AND service.establishment_id = combo_row.establishment_id
      AND service.deleted_at IS NULL;
    IF member_kind IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
    IF member_kind <> 'single' THEN RAISE EXCEPTION 'combo_members_must_be_single'; END IF;
  END LOOP;

  DELETE FROM public.service_combo_items WHERE combo_id = target_combo_id;
  FOREACH member_id IN ARRAY target_member_service_ids LOOP
    idx := idx + 1;
    INSERT INTO public.service_combo_items (combo_id, service_id, sort_order)
    VALUES (target_combo_id, member_id, idx);
  END LOOP;

  UPDATE public.services
  SET updated_at = now()
  WHERE id = target_combo_id;
END;
$$;

-- 6. Analytical & Operational Reports RPCs
-- 6.1 get_admin_report_v2
CREATE OR REPLACE FUNCTION public.get_admin_report_v2(
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
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_report_status';
  END IF;

  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'view_unit_reports')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  day_count := target_range_end - target_range_start + 1;
  previous_range_end := target_range_start - 1;
  previous_range_start := previous_range_end - day_count + 1;
  range_starts_at := target_range_start::timestamp AT TIME ZONE target_timezone;
  range_ends_at := (target_range_end + 1):timestamp AT TIME ZONE target_timezone;
  previous_starts_at := previous_range_start::timestamp AT TIME ZONE target_timezone;
  previous_ends_at := (previous_range_end + 1)::timestamp AT TIME ZONE target_timezone;

  available_minutes := public.admin_report_available_minutes(
    target_establishment_id, target_range_start, target_range_end, target_professional_id
  );
  previous_available_minutes := public.admin_report_available_minutes(
    target_establishment_id, previous_range_start, previous_range_end, target_professional_id
  );

  summary := public.admin_report_summary(
    target_establishment_id, range_starts_at, range_ends_at, target_timezone,
    available_minutes, target_professional_id, target_service_id, target_status
  );
  previous_summary := public.admin_report_summary(
    target_establishment_id, previous_starts_at, previous_ends_at, target_timezone,
    previous_available_minutes, target_professional_id, target_service_id, target_status
  );
  daily_series := public.admin_report_daily_series(
    target_establishment_id, target_range_start, target_range_end, target_timezone,
    target_professional_id, target_service_id, target_status
  );
  hourly_demand := public.admin_report_hourly_demand(
    target_establishment_id, range_starts_at, range_ends_at, target_timezone,
    target_professional_id, target_service_id, target_status
  );
  services := public.admin_report_services(
    target_establishment_id, range_starts_at, range_ends_at,
    target_professional_id, target_status
  );
  professionals := public.admin_report_professionals(
    target_establishment_id, range_starts_at, range_ends_at,
    target_service_id, target_status
  );
  cancellations := public.admin_report_cancellations(
    target_establishment_id, range_starts_at, range_ends_at,
    target_professional_id, target_service_id
  );
  clients := public.admin_report_clients(
    target_establishment_id, range_starts_at, range_ends_at,
    target_professional_id, target_service_id, target_status
  );

  RETURN jsonb_build_object(
    'establishment_id', target_establishment_id,
    'range_start', target_range_start,
    'range_end', target_range_end,
    'timezone', target_timezone,
    'filters', jsonb_build_object(
      'professional_id', target_professional_id,
      'service_id', target_service_id,
      'status', target_status
    ),
    'summary', summary,
    'comparison_summary', previous_summary,
    'daily_series', daily_series,
    'hourly_demand', hourly_demand,
    'services', services,
    'professionals', professionals,
    'cancellations', cancellations,
    'clients', clients
  );
END;
$function$;

-- 6.2 get_admin_report_drilldown
CREATE OR REPLACE FUNCTION public.get_admin_report_drilldown(
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
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled') THEN RAISE EXCEPTION 'invalid_report_status'; END IF;

  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'view_unit_reports')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT timezone INTO target_timezone FROM public.establishments WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF target_dimension = 'appointments' THEN
    WITH rows AS (
      SELECT jsonb_build_object(
        'kind', 'appointment', 'id', appointment.id, 'date_time', appointment.date_time,
        'status', appointment.status, 'service_name', COALESCE(service.name, 'Serviço removido'),
        'professional_id', appointment.professional_id, 'professional_name', COALESCE(professional.name, 'Profissional'),
        'client_name', COALESCE(NULLIF(appointment.client_name, ''), 'Cliente não identificado'),
        'production_value', COALESCE(service.price, 0)
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
      ORDER BY appointment.date_time DESC, appointment.id DESC
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*)::integer
    INTO result_items, fetched_count FROM rows;
  ELSE
    WITH rows AS (
      SELECT jsonb_build_object(
        'kind', 'client', 'client_id', appointment.client_id,
        'client_name', COALESCE(NULLIF(appointment.client_name, ''), 'Cliente não identificado'),
        'appointments_count', count(*), 'total_spent', sum(COALESCE(service.price, 0)),
        'last_appointment_at', max(appointment.date_time)
      ) AS payload
      FROM public.appointments appointment
      LEFT JOIN public.services service ON service.id = appointment.service_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_day IS NULL OR (appointment.date_time AT TIME ZONE target_timezone)::date = target_day)
        AND (target_day_of_week IS NULL OR extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_day_of_week)
        AND (target_hour IS NULL OR extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_hour)
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      GROUP BY appointment.client_id, COALESCE(NULLIF(appointment.client_name, ''), 'Cliente não identificado')
      ORDER BY count(*) DESC, max(appointment.date_time) DESC
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*)::integer
    INTO result_items, fetched_count FROM rows;
  END IF;

  RETURN jsonb_build_object(
    'items', CASE WHEN fetched_count > safe_limit THEN result_items - (safe_limit)::integer ELSE result_items END,
    'next_cursor', CASE WHEN fetched_count > safe_limit THEN (cursor_offset + safe_limit)::text ELSE NULL END,
    'has_more', fetched_count > safe_limit
  );
END;
$function$;

-- 7. Discovery & Settings RPCs
-- 7.1 publish_establishment_discovery
CREATE OR REPLACE FUNCTION public.publish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (discovery_status text, published_at timestamptz, requirements jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE requirement_state jsonb;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'manage_operational_settings')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active' AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner'])
    )
  THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;

  requirement_state := public.establishment_discovery_requirements(target_establishment_id);
  IF requirement_state IS NULL THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE((requirement_state->>'account_active')::boolean, false)
    OR NOT COALESCE((requirement_state->>'name_valid')::boolean, false)
    OR NOT COALESCE((requirement_state->>'slug_valid')::boolean, false)
    OR NOT COALESCE((requirement_state->>'active_service_present')::boolean, false)
  THEN RAISE EXCEPTION 'discovery_requirements_not_met' USING ERRCODE = '22023'; END IF;

  UPDATE public.establishments AS establishment
  SET published_at = COALESCE(establishment.published_at, now()),
      updated_at = now()
  WHERE establishment.id = target_establishment_id;

  RETURN QUERY
  SELECT 'published'::text, establishment.published_at, requirement_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

COMMIT;
