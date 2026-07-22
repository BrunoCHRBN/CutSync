BEGIN;

UPDATE public.profiles
SET notification_channels = ARRAY(
  SELECT DISTINCT channel
  FROM unnest(COALESCE(notification_channels, ARRAY[]::text[])) AS channel
  WHERE channel IN ('email', 'whatsapp', 'push')
  ORDER BY channel
);

UPDATE public.profiles AS profile
SET notification_channels = array_remove(profile.notification_channels, 'push')
WHERE 'push' = ANY(profile.notification_channels)
  AND NOT EXISTS (
    SELECT 1
    FROM public.push_devices AS device
    WHERE device.profile_id = profile.id
      AND device.app_kind = 'client'
      AND device.enabled
  );

ALTER TABLE public.profiles
  ALTER COLUMN notification_channels SET DEFAULT ARRAY['whatsapp'],
  ALTER COLUMN notification_channels SET NOT NULL;

CREATE OR REPLACE FUNCTION public.text_array_has_duplicates(target_values text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT count(*) <> count(DISTINCT value)
  FROM unnest(COALESCE(target_values, ARRAY[]::text[])) AS value;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_notification_channels_allowed'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_notification_channels_allowed
      CHECK (
        notification_channels <@ ARRAY['email', 'whatsapp', 'push']::text[]
        AND array_position(notification_channels, NULL) IS NULL
        AND NOT public.text_array_has_duplicates(notification_channels)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_safe_client_profile_text(target_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT target_value IS NOT NULL
    AND target_value !~ '[<>]'
    AND target_value !~* 'data[[:space:]]*:[[:space:]]*image[[:space:]]*/[[:space:]]*svg\+xml'
    AND target_value !~* '\mxmlns[[:space:]]*='
    AND target_value !~* '\msvg[[:space:]]*:'
    AND target_value !~ (
      '['
      || U&'\+01F1E6' || '-' || U&'\+01FAFF'
      || U&'\2600' || '-' || U&'\27BF'
      || U&'\200D' || U&'\FE0F' || U&'\20E3'
      || ']'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_client_profile()
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  avatar_url text,
  notification_channels text[],
  lgpd_marketing_accepted boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    profile.id,
    profile.name,
    profile.email,
    profile.phone,
    profile.avatar_url,
    COALESCE(profile.notification_channels, ARRAY[]::text[]),
    COALESCE(profile.lgpd_marketing_accepted, false)
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid())
    AND profile.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.update_my_client_profile(
  target_name text,
  target_phone text
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  avatar_url text,
  notification_channels text[],
  lgpd_marketing_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_name text := btrim(COALESCE(target_name, ''));
  normalized_phone text := regexp_replace(COALESCE(target_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 80
    OR NOT public.is_safe_client_profile_text(normalized_name)
  THEN
    RAISE EXCEPTION 'invalid_profile_name';
  END IF;
  IF NOT public.is_safe_client_profile_text(COALESCE(target_phone, ''))
    OR (normalized_phone <> '' AND char_length(normalized_phone) NOT BETWEEN 10 AND 13)
  THEN
    RAISE EXCEPTION 'invalid_profile_phone';
  END IF;

  UPDATE public.profiles AS profile
  SET name = normalized_name,
      phone = NULLIF(normalized_phone, ''),
      updated_at = now()
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN QUERY SELECT * FROM public.get_my_client_profile();
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_client_preferences(
  target_notification_channels text[],
  target_lgpd_marketing_accepted boolean
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  avatar_url text,
  notification_channels text[],
  lgpd_marketing_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_channels text[];
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(target_notification_channels, ARRAY[]::text[])) AS channel
    WHERE channel NOT IN ('email', 'whatsapp', 'push')
  ) THEN
    RAISE EXCEPTION 'invalid_notification_channel';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT channel ORDER BY channel), ARRAY[]::text[])
  INTO normalized_channels
  FROM unnest(COALESCE(target_notification_channels, ARRAY[]::text[])) AS channel;

  UPDATE public.profiles AS profile
  SET notification_channels = normalized_channels,
      lgpd_marketing_accepted = COALESCE(target_lgpd_marketing_accepted, false),
      updated_at = now()
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN QUERY SELECT * FROM public.get_my_client_profile();
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_client_avatar(target_avatar_url text)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  avatar_url text,
  notification_channels text[],
  lgpd_marketing_accepted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_url text := NULLIF(btrim(COALESCE(target_avatar_url, '')), '');
  expected_path text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  expected_path := '/storage/v1/object/public/client-avatars/' || actor_id::text || '/avatar';

  IF normalized_url IS NOT NULL THEN
    IF char_length(normalized_url) > 2048
      OR normalized_url !~ '^https://'
      OR position(expected_path IN normalized_url) = 0
      OR NOT public.is_safe_client_profile_text(normalized_url)
      OR NOT EXISTS (
        SELECT 1
        FROM storage.objects AS object
        WHERE object.bucket_id = 'client-avatars'
          AND object.name = actor_id::text || '/avatar'
      )
    THEN
      RAISE EXCEPTION 'invalid_avatar_url';
    END IF;
  END IF;

  UPDATE public.profiles AS profile
  SET avatar_url = normalized_url,
      updated_at = now()
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN QUERY SELECT * FROM public.get_my_client_profile();
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_my_lgpd_terms(target_marketing_accepted boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  UPDATE public.profiles AS profile
  SET lgpd_terms_accepted = true,
      lgpd_marketing_accepted = COALESCE(target_marketing_accepted, false),
      lgpd_accepted_at = COALESCE(profile.lgpd_accepted_at, now()),
      updated_at = now()
  WHERE profile.id = (SELECT auth.uid())
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN true;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-avatars',
  'client-avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Clients read own avatar object" ON storage.objects;
CREATE POLICY "Clients read own avatar object"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-avatars'
    AND name = (SELECT auth.uid())::text || '/avatar'
  );

DROP POLICY IF EXISTS "Clients upload own avatar" ON storage.objects;
CREATE POLICY "Clients upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-avatars'
    AND name = (SELECT auth.uid())::text || '/avatar'
  );

DROP POLICY IF EXISTS "Clients update own avatar" ON storage.objects;
CREATE POLICY "Clients update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-avatars'
    AND name = (SELECT auth.uid())::text || '/avatar'
  )
  WITH CHECK (
    bucket_id = 'client-avatars'
    AND name = (SELECT auth.uid())::text || '/avatar'
  );

DROP POLICY IF EXISTS "Clients delete own avatar" ON storage.objects;
CREATE POLICY "Clients delete own avatar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-avatars'
    AND name = (SELECT auth.uid())::text || '/avatar'
  );

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  name,
  phone,
  avatar_url,
  push_token,
  work_hours,
  specialties,
  instagram,
  titulo_profissional,
  notification_channels,
  pix_key,
  lgpd_marketing_accepted
) ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.text_array_has_duplicates(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_safe_client_profile_text(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_client_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_client_profile(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_client_preferences(text[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_client_avatar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_my_lgpd_terms(boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.text_array_has_duplicates(text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_safe_client_profile_text(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_client_profile() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_client_profile(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_client_preferences(text[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_my_client_avatar(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_my_lgpd_terms(boolean) TO authenticated, service_role;

COMMIT;
