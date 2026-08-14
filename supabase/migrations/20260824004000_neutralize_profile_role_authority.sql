-- PS1-E1A.1: Hardening and neutralization of profiles.role as decision source
-- Transforms profiles.role and profiles.establishment_id into legacy compatibility projections.
-- Decisions for operational role, capabilities, and routing stem exclusively from memberships.role_template,
-- business capabilities catalog, and user_app_active_contexts.

-- 1. Neutralize submit_client_account_deletion_request with fail-closed checks:
-- Only pure client accounts (without active unit memberships, active organization memberships,
-- or active governance privileges) are eligible for direct client account deletion.
-- Any active business or operational relationship requires offboarding before personal account deletion.
CREATE OR REPLACE FUNCTION public.submit_client_account_deletion_request()
RETURNS TABLE (
  id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  request_row public.governance_privacy_requests%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = caller_id
      AND profile.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'client_profile_required'; END IF;

  -- Fail-closed guard: block if caller has ANY active establishment membership
  IF EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.profile_id = caller_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_business_relationship_requires_offboarding';
  END IF;

  -- Fail-closed guard: block if caller has ANY active organization membership
  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS org_member
    WHERE org_member.profile_id = caller_id
      AND org_member.status = 'active'
      AND org_member.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'active_business_relationship_requires_offboarding';
  END IF;

  -- Fail-closed guard: block if caller has active governance / platform privileges
  IF EXISTS (
    SELECT 1
    FROM public.governance_users AS gov_user
    WHERE gov_user.profile_id = caller_id
      AND (gov_user.expires_at IS NULL OR gov_user.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'active_business_relationship_requires_offboarding';
  END IF;

  SELECT privacy_request.*
  INTO request_row
  FROM public.governance_privacy_requests AS privacy_request
  WHERE privacy_request.target_profile_id = caller_id
    AND privacy_request.status IN ('pending', 'processing', 'failed')
  ORDER BY privacy_request.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.governance_privacy_requests (
      target_profile_id, requested_by, request_reason
    ) VALUES (
      caller_id, caller_id,
      'Solicitação de exclusão iniciada pelo titular da conta CutSync.'
    )
    RETURNING * INTO request_row;

    INSERT INTO public.governance_audit_log (
      actor_id, target_entity, target_id, action, state_before, state_after
    ) VALUES (
      caller_id, 'profiles', caller_id,
      'privacy_deletion_requested',
      '{}'::jsonb,
      jsonb_build_object('request_id', request_row.id, 'status', request_row.status)
    );
  END IF;

  RETURN QUERY
  SELECT
    request_row.id,
    request_row.status,
    request_row.created_at,
    request_row.updated_at;
END;
$$;

-- 2. Schema comments declaring legacy compatibility status
COMMENT ON COLUMN public.profiles.role IS 'LEGACY COMPATIBILITY PROJECTION ONLY. Do not use for authorization, routing, or permissions. Operational authority stems from memberships.role_template and business capabilities.';
COMMENT ON COLUMN public.profiles.establishment_id IS 'LEGACY LAST-VISITED HINT ONLY. Operational active context is managed via user_app_active_contexts and memberships.';
