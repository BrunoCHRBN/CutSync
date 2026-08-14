BEGIN;

DROP POLICY IF EXISTS "Public reads professional gallery bucket" ON storage.buckets;
CREATE POLICY "Public reads professional gallery bucket" ON storage.buckets
  FOR SELECT TO anon, authenticated
  USING (id = 'professional-gallery');

COMMIT;
