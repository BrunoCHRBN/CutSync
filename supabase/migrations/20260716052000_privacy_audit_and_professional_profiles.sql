BEGIN;

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS revocation_reason text;

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS revocation_reason text;

CREATE TABLE IF NOT EXISTS public.professional_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  bio text CHECK (char_length(COALESCE(bio, '')) <= 1000),
  portfolio_url text,
  instagram_url text,
  gallery_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS professional_profile_id uuid
  REFERENCES public.professional_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS professional_profiles_slug_idx
  ON public.professional_profiles(slug) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS memberships_professional_profile_idx
  ON public.memberships(professional_profile_id) WHERE professional_profile_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_safe_public_url(value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT value IS NULL OR value = '' OR value ~* '^https://[^[:space:]]+$';
$$;

CREATE OR REPLACE FUNCTION public.is_valid_professional_gallery(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN jsonb_typeof(value) <> 'array' THEN false
    ELSE jsonb_array_length(value) <= 12 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) item
      WHERE jsonb_typeof(item) <> 'object'
        OR COALESCE(item->>'url', '') !~* '^https://[^[:space:]]+$'
        OR char_length(trim(COALESCE(item->>'alt', ''))) NOT BETWEEN 3 AND 160
    )
  END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'professional_profiles_safe_urls_check'
      AND conrelid = 'public.professional_profiles'::regclass
  ) THEN
    ALTER TABLE public.professional_profiles ADD CONSTRAINT professional_profiles_safe_urls_check
      CHECK (public.is_safe_public_url(portfolio_url) AND public.is_safe_public_url(instagram_url));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'professional_profiles_gallery_check'
      AND conrelid = 'public.professional_profiles'::regclass
  ) THEN
    ALTER TABLE public.professional_profiles ADD CONSTRAINT professional_profiles_gallery_check
      CHECK (public.is_valid_professional_gallery(gallery_urls));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.link_professional_profile_to_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role IN ('professional', 'admin') AND NEW.status = 'active' AND NEW.professional_profile_id IS NULL THEN
    SELECT profile.id INTO NEW.professional_profile_id
    FROM public.professional_profiles profile WHERE profile.user_id = NEW.profile_id;
  ELSIF NEW.role NOT IN ('professional', 'admin') THEN
    NEW.professional_profile_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_professional_profile_membership ON public.memberships;
CREATE TRIGGER link_professional_profile_membership
  BEFORE INSERT OR UPDATE OF role, status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.link_professional_profile_to_membership();

CREATE OR REPLACE FUNCTION public.prevent_authorization_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'authorization_audit_log_is_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS authorization_audit_log_immutable ON public.authorization_audit_log;
CREATE TRIGGER authorization_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.authorization_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_authorization_audit_mutation();

DROP POLICY IF EXISTS "Authorized users read audit trail" ON public.authorization_audit_log;
CREATE POLICY "Admins read tenant audit trail" ON public.authorization_audit_log
  FOR SELECT TO authenticated USING (
    public.is_superadmin()
    OR (establishment_id IS NOT NULL AND public.has_active_membership(establishment_id, ARRAY['admin']))
  );

REVOKE ALL ON public.authorization_audit_log FROM anon, authenticated;
GRANT SELECT ON public.authorization_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
    VALUES ((SELECT auth.uid()), 'membership.granted', NEW.establishment_id, NEW.profile_id,
      jsonb_build_object('role', NEW.role));
  ELSE
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
      VALUES ((SELECT auth.uid()), 'membership.role_changed', NEW.establishment_id, NEW.profile_id,
        jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
    END IF;
    IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate THEN
      INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
      VALUES ((SELECT auth.uid()), 'commission.changed', NEW.establishment_id, NEW.profile_id,
        jsonb_build_object('old_rate', OLD.commission_rate, 'new_rate', NEW.commission_rate));
    END IF;
    IF NEW.status = 'revoked' AND OLD.status IS DISTINCT FROM 'revoked' THEN
      INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
      VALUES ((SELECT auth.uid()), 'membership.revoked', NEW.establishment_id, NEW.profile_id,
        jsonb_build_object('role', OLD.role, 'reason', NEW.revocation_reason));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_membership_changes ON public.memberships;
CREATE TRIGGER audit_membership_changes
  AFTER INSERT OR UPDATE OF role, commission_rate, status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.audit_membership_change();

CREATE OR REPLACE FUNCTION public.can_view_private_profile(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT target_profile_id = (SELECT auth.uid())
    OR public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.memberships manager
      WHERE manager.profile_id = (SELECT auth.uid())
        AND manager.role = 'admin'
        AND manager.status = 'active'
        AND (
          EXISTS (
            SELECT 1 FROM public.memberships target
            WHERE target.profile_id = target_profile_id
              AND target.establishment_id = manager.establishment_id
              AND target.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.appointments appointment
            WHERE appointment.client_id = target_profile_id
              AND appointment.establishment_id = manager.establishment_id
          )
        )
    );
$$;

DO $$
DECLARE existing_policy record;
BEGIN
  FOR existing_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', existing_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY "Private profiles visible only to owner and managers" ON public.profiles
  FOR SELECT TO authenticated USING (public.can_view_private_profile(id));

REVOKE SELECT ON public.profiles FROM anon, authenticated;
REVOKE SELECT (email, phone, push_token, commission_rate, establishment_id, role,
  work_hours, specialties, instagram, titulo_profissional, deleted_at)
  ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, name, avatar_url) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_establishment_client_contacts(target_establishment_id uuid)
RETURNS TABLE (id uuid, name text, email text, phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT DISTINCT profile.id, profile.name, profile.email, profile.phone
  FROM public.appointments appointment
  JOIN public.profiles profile ON profile.id = appointment.client_id
  WHERE appointment.establishment_id = target_establishment_id
    AND profile.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_appointment_participant_names(target_appointment_ids uuid[])
RETURNS TABLE (appointment_id uuid, client_name text, professional_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT appointment.id,
    COALESCE(NULLIF(appointment.client_name, ''), client_profile.name, 'Cliente'),
    professional_profile.name
  FROM public.appointments appointment
  LEFT JOIN public.profiles client_profile ON client_profile.id = appointment.client_id
  JOIN public.profiles professional_profile ON professional_profile.id = appointment.professional_id
  WHERE appointment.id = ANY(COALESCE(target_appointment_ids, ARRAY[]::uuid[]))
    AND (
      public.is_superadmin()
      OR appointment.client_id = (SELECT auth.uid())
      OR appointment.professional_id = (SELECT auth.uid())
      OR public.has_active_membership(appointment.establishment_id, ARRAY['admin'])
    );
$$;

DROP FUNCTION IF EXISTS public.get_public_team(uuid);
CREATE FUNCTION public.get_public_team(target_establishment_id uuid)
RETURNS TABLE (
  id uuid, name text, avatar_url text, titulo_profissional text,
  specialties text, professional_profile_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT profile.id, profile.name, profile.avatar_url, profile.titulo_profissional, profile.specialties,
    CASE WHEN public_profile.is_public THEN public_profile.slug ELSE NULL END
  FROM public.memberships membership
  JOIN public.profiles profile ON profile.id = membership.profile_id
  LEFT JOIN public.professional_profiles public_profile
    ON public_profile.id = membership.professional_profile_id
  WHERE membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.role IN ('professional', 'admin')
    AND profile.deleted_at IS NULL
  ORDER BY profile.name;
$$;

CREATE OR REPLACE FUNCTION public.get_public_professional_profile(profile_slug text)
RETURNS TABLE (
  id uuid, slug text, name text, avatar_url text, titulo_profissional text,
  specialties text, bio text, portfolio_url text, instagram_url text, gallery_urls jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public_profile.id, public_profile.slug, profile.name, profile.avatar_url,
    profile.titulo_profissional, profile.specialties, public_profile.bio,
    public_profile.portfolio_url, public_profile.instagram_url, public_profile.gallery_urls
  FROM public.professional_profiles public_profile
  JOIN public.profiles profile ON profile.id = public_profile.user_id
  WHERE public_profile.slug = lower(trim(profile_slug))
    AND public_profile.is_public = true
    AND profile.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.get_my_professional_profile()
RETURNS TABLE (
  id uuid, slug text, bio text, portfolio_url text, instagram_url text,
  gallery_urls jsonb, is_public boolean, created_at timestamptz, updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public_profile.id, public_profile.slug, public_profile.bio,
    public_profile.portfolio_url, public_profile.instagram_url,
    public_profile.gallery_urls, public_profile.is_public,
    public_profile.created_at, public_profile.updated_at
  FROM public.professional_profiles public_profile
  WHERE public_profile.user_id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_professional_profile(
  requested_slug text,
  requested_bio text DEFAULT NULL,
  requested_portfolio_url text DEFAULT NULL,
  requested_instagram_url text DEFAULT NULL,
  requested_gallery_urls jsonb DEFAULT '[]'::jsonb,
  requested_is_public boolean DEFAULT false
)
RETURNS TABLE (profile_id uuid, profile_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_slug text := lower(trim(requested_slug));
  generated_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.professional_profiles profile
    WHERE profile.user_id = (SELECT auth.uid())
  ) AND NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = (SELECT auth.uid())
      AND membership.role IN ('professional', 'admin') AND membership.status = 'active'
  ) THEN RAISE EXCEPTION 'professional_membership_required'; END IF;
  IF normalized_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' THEN RAISE EXCEPTION 'invalid_slug'; END IF;
  IF char_length(COALESCE(requested_bio, '')) > 1000 THEN RAISE EXCEPTION 'bio_too_long'; END IF;
  IF NOT public.is_safe_public_url(NULLIF(trim(requested_portfolio_url), ''))
    OR NOT public.is_safe_public_url(NULLIF(trim(requested_instagram_url), ''))
  THEN RAISE EXCEPTION 'invalid_public_url'; END IF;
  IF NOT public.is_valid_professional_gallery(COALESCE(requested_gallery_urls, '[]'::jsonb))
  THEN RAISE EXCEPTION 'invalid_gallery'; END IF;

  INSERT INTO public.professional_profiles(
    user_id, slug, bio, portfolio_url, instagram_url, gallery_urls, is_public
  ) VALUES (
    (SELECT auth.uid()), normalized_slug, NULLIF(trim(requested_bio), ''),
    NULLIF(trim(requested_portfolio_url), ''), NULLIF(trim(requested_instagram_url), ''),
    COALESCE(requested_gallery_urls, '[]'::jsonb), requested_is_public
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug, bio = EXCLUDED.bio, portfolio_url = EXCLUDED.portfolio_url,
    instagram_url = EXCLUDED.instagram_url, gallery_urls = EXCLUDED.gallery_urls,
    is_public = EXCLUDED.is_public, updated_at = now()
  RETURNING id INTO generated_id;

  UPDATE public.memberships SET professional_profile_id = generated_id, updated_at = now()
  WHERE profile_id = (SELECT auth.uid()) AND role IN ('professional', 'admin') AND status = 'active';

  INSERT INTO public.authorization_audit_log(actor_id, action, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'professional_profile.updated', (SELECT auth.uid()),
    jsonb_build_object('slug', normalized_slug, 'is_public', requested_is_public));

  RETURN QUERY SELECT generated_id, normalized_slug;
END;
$$;

ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public reads published professional profiles" ON public.professional_profiles;
DROP POLICY IF EXISTS "Professionals read own public profile" ON public.professional_profiles;
CREATE POLICY "Public reads published professional profiles" ON public.professional_profiles
  FOR SELECT TO anon, authenticated USING (is_public = true);
CREATE POLICY "Professionals read own public profile" ON public.professional_profiles
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.professional_profiles FROM anon, authenticated;

DROP FUNCTION IF EXISTS public.remove_professional(uuid, uuid);
CREATE FUNCTION public.remove_professional(
  target_profile_id uuid,
  target_establishment_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE next_membership public.memberships%ROWTYPE;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(trim(COALESCE(reason, ''))) NOT BETWEEN 5 AND 500
  THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;

  UPDATE public.memberships SET status = 'revoked', revoked_at = now(),
    revocation_reason = trim(reason), updated_at = now()
  WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id
    AND role = 'professional' AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_membership_required'; END IF;

  DELETE FROM public.profile_establishments
  WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;

  IF EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = target_profile_id AND profile.establishment_id = target_establishment_id
  ) THEN
    SELECT * INTO next_membership FROM public.memberships
    WHERE profile_id = target_profile_id AND status = 'active' ORDER BY created_at LIMIT 1;
    UPDATE public.profiles SET establishment_id = next_membership.establishment_id,
      role = COALESCE(next_membership.role, 'client'),
      commission_rate = COALESCE(next_membership.commission_rate, 0.50), updated_at = now()
    WHERE id = target_profile_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(target_invitation_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_invitation public.invitations%ROWTYPE;
BEGIN
  IF char_length(trim(COALESCE(reason, ''))) NOT BETWEEN 5 AND 500
  THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;

  SELECT * INTO target_invitation FROM public.invitations
  WHERE id = target_invitation_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  IF NOT public.is_superadmin() AND NOT (
    target_invitation.role = 'professional'
    AND public.has_active_membership(target_invitation.establishment_id, ARRAY['admin'])
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.invitations SET status = 'revoked', revoked_at = now(),
    revocation_reason = trim(reason) WHERE id = target_invitation_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata)
  VALUES ((SELECT auth.uid()), 'invitation.revoked', target_invitation.establishment_id,
    jsonb_build_object('invitation_id', target_invitation.id, 'role', target_invitation.role,
      'invited_email', target_invitation.invited_email, 'reason', trim(reason)));
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_private_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_establishment_client_contacts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_appointment_participant_names(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_team(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_professional_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_professional_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_my_professional_profile(text, text, text, text, jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_professional(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_authorization_audit_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_membership_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_safe_public_url(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_professional_gallery(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_professional_profile_to_membership() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.can_view_private_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_establishment_client_contacts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_appointment_participant_names(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_team(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_professional_profile(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_professional_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_professional_profile(text, text, text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_professional(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid, text) TO authenticated;

COMMIT;