BEGIN;

-- Qualify invitation columns so PL/pgSQL does not confuse them with the
-- function parameters. The public signature and behavior stay unchanged.
CREATE OR REPLACE FUNCTION public.create_establishment_invite_v2(
  target_establishment_id uuid,
  target_contact text,
  target_role text
)
RETURNS TABLE (
  invitation_id uuid,
  raw_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_contact text := lower(btrim(target_contact));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF target_role NOT IN ('admin', 'professional') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF normalized_contact = '' THEN
    RAISE EXCEPTION 'invalid_contact';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.establishments AS establishment
    WHERE establishment.id = target_establishment_id
  ) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF NOT public.can_manage_business_invitation(
    target_establishment_id,
    target_role
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.establishment_invites AS invitation
  SET status = 'revoked',
      revoked_at = now()
  WHERE invitation.establishment_id = target_establishment_id
    AND lower(invitation.target_contact) = normalized_contact
    AND invitation.role = target_role
    AND invitation.status = 'pending';

  INSERT INTO public.establishment_invites (
    establishment_id,
    target_contact,
    role,
    token_hash,
    expires_at,
    created_by
  ) VALUES (
    target_establishment_id,
    normalized_contact,
    target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'),
    generated_expiry,
    (SELECT auth.uid())
  )
  RETURNING id INTO generated_id;

  INSERT INTO public.security_audit_logs(
    actor_id,
    action,
    target_id,
    target_type,
    changes
  ) VALUES (
    (SELECT auth.uid()),
    'invite.created',
    generated_id,
    'invite',
    jsonb_build_object(
      'establishment_id', target_establishment_id,
      'role', target_role
    )
  );

  RETURN QUERY
  SELECT generated_id, generated_token, generated_expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_establishment_invite_v2(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_establishment_invite_v2(uuid, text, text)
  TO authenticated, service_role;

COMMIT;
