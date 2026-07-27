-- Execute only in an isolated homologation environment after creating the
-- Auth user. Replace the synthetic placeholder with that user's email.

BEGIN;

DO $$
DECLARE
  target_email constant text := 'replace-with-your-test-email@example.test';
  target_profile_id uuid;
BEGIN
  IF target_email = 'replace-with-your-test-email@example.test' THEN
    RAISE EXCEPTION 'replace_bootstrap_email';
  END IF;

  SELECT profile.id
  INTO target_profile_id
  FROM public.profiles AS profile
  WHERE lower(profile.email) = lower(target_email)
    AND profile.deleted_at IS NULL;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.governance_users AS governance
    WHERE governance.role = 'SaaS_Owner'
      AND governance.is_active
      AND governance.revoked_at IS NULL
      AND (governance.expires_at IS NULL OR governance.expires_at > now())
      AND governance.profile_id <> target_profile_id
  ) THEN
    RAISE EXCEPTION 'active_owner_already_exists_use_control_access_management';
  END IF;

  PERFORM set_config(
    'cutsync.governance_access_reason',
    'Bootstrap controlado do primeiro proprietário do CutSync Control',
    true
  );

  INSERT INTO public.governance_users (
    profile_id,
    role,
    granted_by,
    granted_at,
    is_active,
    expires_at,
    revoked_at,
    revoked_by
  )
  VALUES (
    target_profile_id,
    'SaaS_Owner',
    target_profile_id,
    now(),
    true,
    NULL,
    NULL,
    NULL
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET
    role = 'SaaS_Owner',
    granted_by = EXCLUDED.granted_by,
    granted_at = EXCLUDED.granted_at,
    is_active = true,
    expires_at = NULL,
    revoked_at = NULL,
    revoked_by = NULL,
    updated_at = now();
END;
$$;

COMMIT;
