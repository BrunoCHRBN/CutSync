-- Control access hardening. Created through `supabase migration new` and
-- ordered after the existing Control access/AAL2 migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_identity_migration_conflict(
  actor_profile_id uuid,
  target_conflict_id uuid,
  target_action text,
  target_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE conflict public.identity_migration_conflicts%ROWTYPE;
  resolved_organization_id uuid;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF target_action NOT IN ('link', 'reject', 'request_evidence')
    OR char_length(btrim(target_reason)) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'invalid_resolution'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.governance_users
    WHERE profile_id = actor_profile_id
      AND role IN ('SaaS_Editor', 'SaaS_Owner')
      AND is_active
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO conflict FROM public.identity_migration_conflicts
  WHERE id = target_conflict_id FOR UPDATE;
  IF NOT FOUND OR conflict.status <> 'pending' THEN RAISE EXCEPTION 'conflict_not_pending'; END IF;

  IF target_action = 'link' THEN
    IF conflict.legal_entity_id IS NULL OR conflict.requester_profile_id IS NULL THEN
      RAISE EXCEPTION 'secure_backfill_required';
    END IF;
    SELECT organization_id INTO resolved_organization_id
    FROM public.organization_legal_entities
    WHERE legal_entity_id = conflict.legal_entity_id AND status = 'active'
    LIMIT 1;
    IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'legal_entity_without_organization'; END IF;
    INSERT INTO public.profile_legal_entities(
      profile_id, legal_entity_id, relationship, created_by
    ) VALUES (
      conflict.requester_profile_id, conflict.legal_entity_id, 'owner', actor_profile_id
    ) ON CONFLICT (profile_id, legal_entity_id) DO UPDATE
      SET relationship = 'owner', status = 'active', revoked_at = NULL;
    INSERT INTO public.organization_members(
      organization_id, profile_id, role, created_by
    ) VALUES (
      resolved_organization_id, conflict.requester_profile_id, 'owner', actor_profile_id
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE
      SET role = 'owner', status = 'active', revoked_at = NULL, updated_at = now();
  END IF;

  UPDATE public.identity_migration_conflicts SET
    status = CASE target_action
      WHEN 'link' THEN 'linked'
      WHEN 'reject' THEN 'rejected'
      ELSE 'evidence_requested'
    END,
    resolution_reason = btrim(target_reason),
    resolved_by = actor_profile_id,
    resolved_at = now()
  WHERE id = target_conflict_id;
  INSERT INTO public.security_audit_logs(action, actor_id, target_type, target_id, changes)
  VALUES (
    'identity_conflict.' || target_action, actor_profile_id, 'identity_conflict',
    target_conflict_id, jsonb_build_object('reason_provided', true)
  );
  RETURN target_action;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_identity_migration_conflict(
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_identity_migration_conflict(
  uuid,
  uuid,
  text,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION public.find_control_profile_by_email(target_email text)
RETURNS TABLE (
  profile_id uuid,
  name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.get_control_context();

  IF NOT public.is_governance_user(
    ARRAY['SaaS_Owner']::public.governance_role_enum[]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF nullif(btrim(coalesce(target_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'profile_email_required';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    coalesce(profile.name, 'Usuário'),
    profile.email
  FROM public.profiles AS profile
  WHERE lower(profile.email) = lower(btrim(target_email))
    AND profile.deleted_at IS NULL
  ORDER BY profile.id
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.find_control_profile_by_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_control_profile_by_email(text)
TO authenticated, service_role;

COMMIT;
