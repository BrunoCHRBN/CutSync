BEGIN;

CREATE TABLE IF NOT EXISTS public.push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_kind text NOT NULL CHECK (app_kind IN ('client', 'business')),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  expo_push_token text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_profile_app_idx
  ON public.push_devices (profile_id, app_kind, enabled);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own push devices" ON public.push_devices;
CREATE POLICY "Users read own push devices"
  ON public.push_devices
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

REVOKE ALL ON public.push_devices FROM anon, authenticated;
GRANT SELECT ON public.push_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_devices TO service_role;

CREATE OR REPLACE FUNCTION public.register_push_device(
  target_app_kind text,
  target_platform text,
  target_expo_push_token text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_token text := trim(target_expo_push_token);
  registered_id uuid;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF target_app_kind IS NULL OR target_app_kind NOT IN ('client', 'business') THEN
    RAISE EXCEPTION 'invalid_app_kind';
  END IF;

  IF target_platform IS NULL OR target_platform NOT IN ('android', 'ios') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  IF target_expo_push_token IS NULL
    OR normalized_token = ''
    OR normalized_token <> target_expo_push_token
    OR char_length(normalized_token) < 20
    OR char_length(normalized_token) > 512
  THEN
    RAISE EXCEPTION 'invalid_push_token';
  END IF;

  INSERT INTO public.push_devices (
    profile_id,
    app_kind,
    platform,
    expo_push_token,
    enabled,
    last_seen_at,
    updated_at
  )
  VALUES (
    actor_id,
    target_app_kind,
    target_platform,
    normalized_token,
    true,
    now(),
    now()
  )
  ON CONFLICT (expo_push_token) DO UPDATE
  SET app_kind = EXCLUDED.app_kind,
      platform = EXCLUDED.platform,
      enabled = true,
      last_seen_at = now(),
      updated_at = now()
  WHERE push_devices.profile_id = actor_id
  RETURNING id INTO registered_id;

  IF registered_id IS NULL THEN
    RAISE EXCEPTION 'push_token_registered';
  END IF;

  RETURN registered_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_device(target_expo_push_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  UPDATE public.push_devices
  SET enabled = false,
      updated_at = now()
  WHERE profile_id = (SELECT auth.uid())
    AND expo_push_token = target_expo_push_token
    AND enabled = true;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_operational_contexts()
RETURNS TABLE (
  membership_id uuid,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  membership_role text,
  membership_status text,
  commission_rate numeric,
  establishment_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  RETURN QUERY
  SELECT
    membership.id,
    establishment.id,
    establishment.name,
    establishment.slug,
    membership.role,
    membership.status,
    membership.commission_rate,
    establishment.account_status::text
  FROM public.memberships membership
  JOIN public.establishments establishment
    ON establishment.id = membership.establishment_id
  WHERE membership.profile_id = actor_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
  ORDER BY establishment.name, membership.role;
END;
$$;

REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unregister_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_operational_contexts() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_operational_contexts() TO authenticated;

GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_operational_contexts() TO service_role;

COMMIT;
