-- Execute after 20260722160000_client_profile_preferences.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
  END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('83000000-0000-0000-0000-000000000001', 'client-profile-one@example.test', '{"name":"Client Profile One"}'::jsonb, now(), now(), now()),
  ('83000000-0000-0000-0000-000000000002', 'client-profile-two@example.test', '{"name":"Client Profile Two"}'::jsonb, now(), now(), now());

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('83000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  own_profile record;
BEGIN
  SELECT * INTO own_profile FROM public.get_my_client_profile();
  IF own_profile.id <> '83000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'FAIL: client profile getter returned a different owner';
  END IF;

  SELECT * INTO own_profile
  FROM public.update_my_client_profile('Cliente Seguro', '(11) 99999-9999');
  IF own_profile.name <> 'Cliente Seguro' OR own_profile.phone <> '11999999999' THEN
    RAISE EXCEPTION 'FAIL: profile fields were not normalized';
  END IF;

  SELECT * INTO own_profile
  FROM public.update_my_client_preferences(ARRAY['whatsapp', 'email', 'email'], true);
  IF own_profile.notification_channels <> ARRAY['email', 'whatsapp']::text[]
    OR NOT own_profile.lgpd_marketing_accepted
  THEN
    RAISE EXCEPTION 'FAIL: client preferences were not normalized';
  END IF;

  IF NOT public.accept_my_lgpd_terms(false) THEN
    RAISE EXCEPTION 'FAIL: LGPD consent was not recorded';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.update_my_client_profile('Cliente ' || U&'\+01F488', '11999999999')$$,
  'invalid_profile_name'
);

SELECT pg_temp.expect_error(
  $$SELECT public.update_my_client_profile('<svg>Cliente</svg>', '11999999999')$$,
  'invalid_profile_name'
);

SELECT pg_temp.expect_error(
  $$SELECT public.update_my_client_preferences(ARRAY['sms'], false)$$,
  'invalid_notification_channel'
);

SELECT pg_temp.expect_error(
  $$UPDATE public.profiles SET email = 'changed@example.test'
    WHERE id = '83000000-0000-0000-0000-000000000001'$$,
  'permission denied'
);

SELECT pg_temp.expect_error(
  $$UPDATE public.profiles SET lgpd_terms_accepted = false
    WHERE id = '83000000-0000-0000-0000-000000000001'$$,
  'permission denied'
);

SELECT pg_temp.expect_error(
  $$UPDATE public.profiles SET notification_channels = ARRAY['email', 'email']
    WHERE id = '83000000-0000-0000-0000-000000000001'$$,
  'profiles_notification_channels_allowed'
);

SELECT pg_temp.set_actor('83000000-0000-0000-0000-000000000002');

DO $$
DECLARE
  visible_profile record;
BEGIN
  SELECT * INTO visible_profile FROM public.get_my_client_profile();
  IF visible_profile.id <> '83000000-0000-0000-0000-000000000002'::uuid THEN
    RAISE EXCEPTION 'FAIL: a client read another profile';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'client-avatars'
      AND public
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'FAIL: client avatar bucket is not hardened';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
