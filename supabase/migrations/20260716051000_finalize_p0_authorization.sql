BEGIN;

-- Esta migration complementar é intencionalmente idempotente: corrige projetos
-- onde a primeira versão do P0 já tenha sido registrada pelo Supabase.
CREATE OR REPLACE FUNCTION public.bootstrap_superadmins_from_config()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  configured_emails text := current_setting('app.settings.cutsync_superadmin_emails', true);
  inserted_count integer := 0;
BEGIN
  IF trim(COALESCE(configured_emails, '')) = '' THEN RETURN 0; END IF;

  WITH allowed_email AS (
    SELECT lower(trim(value)) AS email
    FROM unnest(string_to_array(configured_emails, ',')) AS value
    WHERE trim(value) <> ''
  )
  INSERT INTO public.superadmins(profile_id, granted_by)
  SELECT p.id, NULL
  FROM public.profiles p
  JOIN allowed_email allowed ON allowed.email = lower(p.email)
  WHERE p.deleted_at IS NULL
  ON CONFLICT (profile_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

SELECT public.bootstrap_superadmins_from_config();

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, push_token text, work_hours text,
  specialties text, instagram text, titulo_profissional text, deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, active_membership.establishment_id, p.name,
    COALESCE(active_membership.role, 'client'), p.email, p.phone, p.avatar_url,
    COALESCE(active_membership.commission_rate, p.commission_rate), p.push_token,
    p.work_hours, p.specialties, p.instagram, p.titulo_profissional, p.deleted_at
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT m.establishment_id, m.role, m.commission_rate
    FROM public.memberships m
    WHERE m.profile_id = p.id AND m.status = 'active'
    ORDER BY (m.establishment_id = p.establishment_id) DESC, m.created_at
    LIMIT 1
  ) active_membership ON true
  WHERE p.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'authenticated' AND (SELECT auth.uid()) = OLD.id AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
      OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
    )
  THEN RAISE EXCEPTION 'protected_profile_fields'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_authorization_fields ON public.profiles;
CREATE TRIGGER protect_profile_authorization_fields
  BEFORE UPDATE OF role, establishment_id, commission_rate ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization_fields();

CREATE OR REPLACE FUNCTION public.inspect_invitation(invitation_token text)
RETURNS TABLE (establishment_name text, invited_email text, invited_role text, invitation_status text, expiration timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE current_email text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_invitation_token'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = (SELECT auth.uid());
  RETURN QUERY
  SELECT e.name, i.invited_email, i.role,
    CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
    i.expires_at
  FROM public.invitations i
  JOIN public.establishments e ON e.id = i.establishment_id
  WHERE i.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    AND lower(i.invited_email) = current_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text)
RETURNS TABLE (accepted_role text, accepted_establishment_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  pending_invitation public.invitations%ROWTYPE;
  current_email text;
  effective_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_invitation_token'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users
  WHERE id = (SELECT auth.uid()) AND email_confirmed_at IS NOT NULL;
  IF current_email IS NULL THEN RAISE EXCEPTION 'verified_email_required'; END IF;

  SELECT * INTO pending_invitation FROM public.invitations
  WHERE token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR pending_invitation.status <> 'pending' THEN RAISE EXCEPTION 'invalid_or_used_invitation'; END IF;
  IF pending_invitation.expires_at <= now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = pending_invitation.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;
  IF lower(pending_invitation.invited_email) <> current_email THEN RAISE EXCEPTION 'invitation_email_mismatch'; END IF;

  INSERT INTO public.memberships(profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES ((SELECT auth.uid()), pending_invitation.establishment_id, pending_invitation.role, 'active', 0.50, pending_invitation.created_by)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = CASE WHEN public.memberships.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
      status = 'active', revoked_at = NULL, updated_at = now();

  SELECT role INTO effective_role FROM public.memberships
  WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invitation.establishment_id;

  UPDATE public.profiles
  SET establishment_id = pending_invitation.establishment_id, role = effective_role,
      commission_rate = (SELECT commission_rate FROM public.memberships
        WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invitation.establishment_id),
      updated_at = now()
  WHERE id = (SELECT auth.uid());

  INSERT INTO public.profile_establishments(profile_id, establishment_id, role)
  VALUES ((SELECT auth.uid()), pending_invitation.establishment_id, effective_role)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  UPDATE public.invitations
  SET status = 'accepted', accepted_by = (SELECT auth.uid()), accepted_at = now()
  WHERE id = pending_invitation.id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'invitation.accepted', pending_invitation.establishment_id, (SELECT auth.uid()),
    jsonb_build_object('invitation_id', pending_invitation.id, 'role', effective_role));

  RETURN QUERY SELECT effective_role, pending_invitation.establishment_id;
END;
$$;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar_url, push_token) ON public.profiles TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_superadmins_from_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_authorization_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inspect_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

COMMIT;