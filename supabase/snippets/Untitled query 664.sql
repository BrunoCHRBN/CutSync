ROLLBACK;

BEGIN;

SELECT set_config(
  'cutsync.governance_access_reason',
  'Bootstrap local do primeiro proprietário do Control',
  true
);

INSERT INTO public.governance_users (
  profile_id,
  role,
  granted_by,
  is_active,
  expires_at,
  revoked_at,
  revoked_by
)
VALUES (
  '98a8ffd4-0884-4c61-81e3-92e0c05572e0'::uuid,
  'SaaS_Owner'::public.governance_role_enum,
  '98a8ffd4-0884-4c61-81e3-92e0c05572e0'::uuid,
  true,
  NULL,
  NULL,
  NULL
)
ON CONFLICT (profile_id) DO UPDATE
SET
  role = 'SaaS_Owner',
  is_active = true,
  expires_at = NULL,
  revoked_at = NULL,
  revoked_by = NULL,
  updated_at = now();

COMMIT;