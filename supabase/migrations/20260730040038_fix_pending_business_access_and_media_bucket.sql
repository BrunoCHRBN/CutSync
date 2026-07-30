BEGIN;

-- Establishments are created as pending_verification before their first admin
-- membership exists. Provision billing only after that membership is available
-- so the pending unit resolves to full access and receives the correct owner.
CREATE OR REPLACE FUNCTION public.initialize_membership_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  establishment_status text;
  active_admin_count integer;
BEGIN
  IF NEW.role <> 'admin' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT establishment.account_status
  INTO establishment_status
  FROM public.establishments AS establishment
  WHERE establishment.id = NEW.establishment_id;

  IF establishment_status NOT IN ('active', 'pending_verification') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.billing_accounts AS account
    WHERE account.establishment_id = NEW.establishment_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.billing_coverage_assignments AS coverage
    WHERE coverage.establishment_id = NEW.establishment_id
      AND coverage.status = 'active'
      AND coverage.effective_from <= now()
      AND (coverage.effective_until IS NULL OR coverage.effective_until > now())
  ) THEN
    PERFORM public.ensure_billing_account_for_establishment(NEW.establishment_id, 0);
  END IF;

  SELECT count(*)
  INTO active_admin_count
  FROM public.memberships AS membership
  WHERE membership.establishment_id = NEW.establishment_id
    AND membership.role = 'admin'
    AND membership.status = 'active';

  IF active_admin_count = 1 THEN
    UPDATE public.billing_accounts AS account
    SET billing_owner_profile_id = NEW.profile_id,
        owner_resolution_status = 'automatic',
        updated_at = now()
    WHERE account.establishment_id = NEW.establishment_id
      AND account.billing_owner_profile_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_membership_billing()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS initialize_membership_billing_trigger
  ON public.memberships;
CREATE TRIGGER initialize_membership_billing_trigger
AFTER INSERT OR UPDATE OF role, status
ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.initialize_membership_billing();

-- Repair registrations created before the membership-aware trigger existed.
SELECT public.ensure_billing_account_for_establishment(establishment.id, 0)
FROM public.establishments AS establishment
WHERE establishment.account_status IN ('active', 'pending_verification')
  AND EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.establishment_id = establishment.id
      AND membership.role = 'admin'
      AND membership.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.billing_accounts AS account
    WHERE account.establishment_id = establishment.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.billing_coverage_assignments AS coverage
    WHERE coverage.establishment_id = establishment.id
      AND coverage.status = 'active'
      AND coverage.effective_from <= now()
      AND (coverage.effective_until IS NULL OR coverage.effective_until > now())
  );

UPDATE public.billing_accounts AS account
SET billing_owner_profile_id = resolved.profile_id,
    owner_resolution_status = 'automatic',
    updated_at = now()
FROM (
  SELECT membership.establishment_id, min(membership.profile_id::text)::uuid AS profile_id
  FROM public.memberships AS membership
  WHERE membership.role = 'admin'
    AND membership.status = 'active'
  GROUP BY membership.establishment_id
  HAVING count(*) = 1
) AS resolved
WHERE account.establishment_id = resolved.establishment_id
  AND account.billing_owner_profile_id IS NULL;

-- Public brand media is served by URL, while every metadata/write operation is
-- restricted to a full-access admin of the establishment encoded in the path.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners',
  'banners',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Establishment admins read own brand media" ON storage.objects;
CREATE POLICY "Establishment admins read own brand media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'banners'
  AND public.has_active_membership(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    ARRAY['admin']
  )
  AND public.can_use_establishment_feature(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    'admin_write'
  )
);

DROP POLICY IF EXISTS "Establishment admins upload own brand media" ON storage.objects;
CREATE POLICY "Establishment admins upload own brand media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banners'
  AND public.has_active_membership(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    ARRAY['admin']
  )
  AND public.can_use_establishment_feature(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    'admin_write'
  )
);

DROP POLICY IF EXISTS "Establishment admins update own brand media" ON storage.objects;
CREATE POLICY "Establishment admins update own brand media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'banners'
  AND public.has_active_membership(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    ARRAY['admin']
  )
  AND public.can_use_establishment_feature(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    'admin_write'
  )
)
WITH CHECK (
  bucket_id = 'banners'
  AND public.has_active_membership(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    ARRAY['admin']
  )
  AND public.can_use_establishment_feature(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    'admin_write'
  )
);

DROP POLICY IF EXISTS "Establishment admins delete own brand media" ON storage.objects;
CREATE POLICY "Establishment admins delete own brand media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'banners'
  AND public.has_active_membership(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    ARRAY['admin']
  )
  AND public.can_use_establishment_feature(
    CASE
      WHEN COALESCE((storage.foldername(name))[1], '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN ((storage.foldername(name))[1])::uuid
      ELSE NULL
    END,
    'admin_write'
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
