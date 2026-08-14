BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'professional-gallery',
  'professional-gallery',
  true,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public reads professional gallery" ON storage.objects;
CREATE POLICY "Public reads professional gallery" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'professional-gallery');

DROP POLICY IF EXISTS "Professionals upload own gallery" ON storage.objects;
CREATE POLICY "Professionals upload own gallery" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'professional-gallery'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.memberships AS membership
      WHERE membership.profile_id = (SELECT auth.uid())
        AND membership.role IN ('professional', 'admin')
        AND membership.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Professionals delete own gallery" ON storage.objects;
CREATE POLICY "Professionals delete own gallery" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'professional-gallery'
    AND owner_id = (SELECT auth.uid())::text
  );

COMMIT;
