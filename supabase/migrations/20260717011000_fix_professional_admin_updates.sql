BEGIN;

CREATE OR REPLACE FUNCTION public.admin_update_professional(
  target_profile_id uuid,
  target_establishment_id uuid,
  updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_commission numeric;
  changed_fields integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.role = 'professional'
      AND membership.status = 'active'
  ) THEN RAISE EXCEPTION 'professional_membership_required'; END IF;
  IF updates IS NULL OR jsonb_typeof(updates) <> 'object'
  THEN RAISE EXCEPTION 'invalid_updates'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(updates) AS key
    WHERE key NOT IN ('commission_rate', 'specialties', 'instagram', 'titulo_profissional', 'work_hours')
  ) THEN RAISE EXCEPTION 'unsupported_professional_field'; END IF;

  IF updates ? 'commission_rate' THEN
    new_commission := (updates->>'commission_rate')::numeric;
    IF new_commission < 0 OR new_commission > 1 THEN RAISE EXCEPTION 'invalid_commission'; END IF;
    UPDATE public.memberships AS membership
    SET commission_rate = new_commission, updated_at = now()
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id;
  END IF;

  IF updates ? 'work_hours' THEN
    BEGIN
      IF jsonb_typeof((updates->>'work_hours')::jsonb) <> 'array'
      THEN RAISE EXCEPTION 'invalid_work_hours'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_work_hours';
    END;
  END IF;

  UPDATE public.profiles AS profile SET
    commission_rate = COALESCE(new_commission, profile.commission_rate),
    specialties = CASE WHEN updates ? 'specialties' THEN NULLIF(trim(updates->>'specialties'), '') ELSE profile.specialties END,
    instagram = CASE WHEN updates ? 'instagram' THEN NULLIF(trim(leading '@' FROM updates->>'instagram'), '') ELSE profile.instagram END,
    titulo_profissional = CASE WHEN updates ? 'titulo_profissional' THEN NULLIF(trim(updates->>'titulo_profissional'), '') ELSE profile.titulo_profissional END,
    work_hours = CASE WHEN updates ? 'work_hours' THEN updates->>'work_hours' ELSE profile.work_hours END,
    updated_at = now()
  WHERE profile.id = target_profile_id;

  SELECT count(*)::integer
  INTO changed_fields
  FROM jsonb_object_keys(updates);

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, target_profile_id, metadata
  )
  VALUES (
    (SELECT auth.uid()),
    'professional.updated',
    target_establishment_id,
    target_profile_id,
    jsonb_build_object('fields_changed', changed_fields)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_professional(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_professional(uuid, uuid, jsonb) TO authenticated;

COMMIT;
