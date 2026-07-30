BEGIN;

DO $test$
<<pending_business_access_and_media>>
DECLARE
  owner_id uuid := gen_random_uuid();
  establishment_id uuid := gen_random_uuid();
  resolved_owner uuid;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (owner_id, 'pending-business-owner@example.test', now());

  INSERT INTO public.profiles(id, name, email, role)
  VALUES (owner_id, 'Pending Business Owner', 'pending-business-owner@example.test', 'admin')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role;

  INSERT INTO public.establishments(id, name, slug, account_status)
  VALUES (
    establishment_id,
    'Pending Business',
    'pending-business-' || replace(establishment_id::text, '-', ''),
    'pending_verification'
  );

  IF EXISTS (
    SELECT 1
    FROM public.billing_accounts AS account
    WHERE account.establishment_id = pending_business_access_and_media.establishment_id
  ) THEN
    RAISE EXCEPTION 'pending establishment was billed before its owner membership existed';
  END IF;

  INSERT INTO public.memberships(profile_id, establishment_id, role, status, created_by)
  VALUES (owner_id, establishment_id, 'admin', 'active', owner_id);

  SELECT account.billing_owner_profile_id
  INTO resolved_owner
  FROM public.billing_accounts AS account
  WHERE account.establishment_id = pending_business_access_and_media.establishment_id;

  IF resolved_owner IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'pending establishment billing owner was not resolved';
  END IF;

  IF public.billing_access_mode(establishment_id) IS DISTINCT FROM 'full' THEN
    RAISE EXCEPTION 'pending establishment did not receive full access';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'banners'
      AND bucket.public
      AND bucket.file_size_limit = 15728640
      AND bucket.allowed_mime_types @> ARRAY['image/jpeg', 'image/png', 'image/webp']
  ) THEN
    RAISE EXCEPTION 'establishment media bucket is missing or misconfigured';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'storage'
      AND policy.tablename = 'objects'
      AND policy.policyname IN (
        'Establishment admins read own brand media',
        'Establishment admins upload own brand media',
        'Establishment admins update own brand media',
        'Establishment admins delete own brand media'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'establishment media policies are incomplete';
  END IF;
END;
$test$;

SELECT set_config(
  'request.jwt.claim.sub',
  (
    SELECT membership.profile_id::text
    FROM public.memberships AS membership
    JOIN public.establishments AS establishment
      ON establishment.id = membership.establishment_id
    WHERE establishment.slug LIKE 'pending-business-%'
      AND membership.role = 'admin'
      AND membership.status = 'active'
    ORDER BY establishment.created_at DESC
    LIMIT 1
  ),
  true
);
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', current_setting('request.jwt.claim.sub', true),
    'role', 'authenticated',
    'aal', 'aal2'
  )::text,
  true
);

SET LOCAL ROLE authenticated;

WITH updated AS (
  UPDATE public.establishments
  SET name = name
  WHERE slug LIKE 'pending-business-%'
  RETURNING id
)
SELECT 1 / count(*)::integer AS authenticated_admin_update_succeeded
FROM updated;

RESET ROLE;

ROLLBACK;
