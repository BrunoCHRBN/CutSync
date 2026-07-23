BEGIN;

-- P0: force sensitive account-status changes through an auditable RPC.
CREATE OR REPLACE FUNCTION public.audit_governance_actions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  status_reason text := nullif(btrim(current_setting('cutsync.governance_status_reason', true)), '');
BEGIN
  IF TG_TABLE_NAME = 'establishments' AND NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
    VALUES (
      (SELECT auth.uid()),
      'establishment.status_changed',
      NEW.id,
      'establishment',
      jsonb_build_object(
        'old_status', OLD.account_status,
        'new_status', NEW.account_status,
        'name', NEW.name,
        'reason', coalesce(status_reason, 'Não informado')
      )
    );
  ELSIF TG_TABLE_NAME = 'governance_users' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
      VALUES ((SELECT auth.uid()), 'governance.user_created', NEW.profile_id, 'governance_user', jsonb_build_object('role', NEW.role));
    ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
      VALUES ((SELECT auth.uid()), 'governance.user_role_changed', NEW.profile_id, 'governance_user', jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
      VALUES ((SELECT auth.uid()), 'governance.user_removed', OLD.profile_id, 'governance_user', jsonb_build_object('role', OLD.role));
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_governance_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND nullif(btrim(current_setting('cutsync.governance_status_reason', true)), '') IS NULL THEN
    RAISE EXCEPTION 'governance_status_change_requires_reason';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_governance_status_change ON public.establishments;
CREATE TRIGGER guard_governance_status_change
  BEFORE UPDATE OF account_status ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.guard_governance_status_change();

CREATE OR REPLACE FUNCTION public.update_governance_establishment_status(
  target_establishment_id uuid,
  target_status text,
  target_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_status text;
  establishment_name text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_status NOT IN ('active', 'delinquent', 'blocked') THEN
    RAISE EXCEPTION 'invalid_account_status';
  END IF;
  IF char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'status_change_reason_invalid';
  END IF;

  SELECT account_status, name INTO current_status, establishment_name
  FROM public.establishments
  WHERE id = target_establishment_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF current_status = target_status THEN RAISE EXCEPTION 'status_unchanged'; END IF;

  PERFORM set_config('cutsync.governance_status_reason', btrim(target_reason), true);
  UPDATE public.establishments SET account_status = target_status, updated_at = now()
  WHERE id = target_establishment_id;

  RETURN jsonb_build_object(
    'id', target_establishment_id,
    'name', establishment_name,
    'old_status', current_status,
    'new_status', target_status,
    'reason', btrim(target_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_governance_establishments(
  search_term text DEFAULT NULL,
  status_filter text DEFAULT NULL,
  page_size integer DEFAULT 25,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, slug text, document_number text, document_type text,
  verification_level integer, account_status text, address text,
  kyc_status text, email_verified boolean, whatsapp_verified boolean,
  recent_status_changed_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT e.id, e.name, e.slug, e.document_number, e.document_type,
    e.verification_level, e.account_status, e.address, e.kyc_status,
    e.email_verified, e.whatsapp_verified,
    max(l.created_at) FILTER (WHERE l.action = 'establishment.status_changed'),
    count(*) OVER ()
  FROM public.establishments e
  LEFT JOIN public.security_audit_logs l ON l.target_id = e.id AND l.target_type = 'establishment'
  WHERE (nullif(btrim(search_term), '') IS NULL OR e.name ILIKE '%' || btrim(search_term) || '%' OR e.slug ILIKE '%' || btrim(search_term) || '%' OR coalesce(e.document_number, '') ILIKE '%' || btrim(search_term) || '%')
    AND (status_filter IS NULL OR e.account_status = status_filter)
  GROUP BY e.id
  ORDER BY e.created_at DESC
  LIMIT least(greatest(coalesce(page_size, 25), 1), 100)
  OFFSET greatest(coalesce(page_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_governance_audit_events(
  search_term text DEFAULT NULL,
  action_filter text DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  page_size integer DEFAULT 40,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id bigint, action text, target_id uuid, target_type text, changes jsonb,
  client_ip text, created_at timestamptz, actor_name text, target_name text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT l.id, l.action, l.target_id, l.target_type, l.changes, l.client_ip, l.created_at,
    coalesce(actor.name, 'Sistema'), coalesce(e.name, target_profile.name, l.target_id::text), count(*) OVER ()
  FROM public.security_audit_logs l
  LEFT JOIN public.profiles actor ON actor.id = l.actor_id
  LEFT JOIN public.establishments e ON e.id = l.target_id AND l.target_type = 'establishment'
  LEFT JOIN public.profiles target_profile ON target_profile.id = l.target_id AND l.target_type = 'profile'
  WHERE (nullif(btrim(search_term), '') IS NULL OR l.action ILIKE '%' || btrim(search_term) || '%' OR coalesce(e.name, target_profile.name, '') ILIKE '%' || btrim(search_term) || '%')
    AND (action_filter IS NULL OR l.action = action_filter)
    AND (date_from IS NULL OR l.created_at >= date_from)
    AND (date_to IS NULL OR l.created_at < date_to)
  ORDER BY l.created_at DESC
  LIMIT least(greatest(coalesce(page_size, 40), 1), 100)
  OFFSET greatest(coalesce(page_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_governance_establishment_detail(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', e.id, 'name', e.name, 'slug', e.slug, 'address', e.address,
      'document_number', e.document_number, 'document_type', e.document_type,
      'verification_level', e.verification_level, 'account_status', e.account_status,
      'kyc_status', e.kyc_status, 'email_verified', e.email_verified,
      'whatsapp_verified', e.whatsapp_verified, 'created_at', e.created_at,
      'updated_at', e.updated_at
    ),
    'status_history', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'changes', l.changes, 'created_at', l.created_at, 'actor_name', coalesce(p.name, 'Sistema')) ORDER BY l.created_at DESC) FROM public.security_audit_logs l LEFT JOIN public.profiles p ON p.id = l.actor_id WHERE l.target_id = e.id AND l.target_type = 'establishment' AND l.action = 'establishment.status_changed'), '[]'::jsonb),
    'recent_events', coalesce((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'changes', l.changes, 'created_at', l.created_at, 'actor_name', coalesce(p.name, 'Sistema')) ORDER BY l.created_at DESC) FROM public.security_audit_logs l LEFT JOIN public.profiles p ON p.id = l.actor_id WHERE l.target_id = e.id AND l.target_type = 'establishment' LIMIT 20), '[]'::jsonb),
    'upcoming_appointments', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'date_time', a.date_time, 'ends_at', a.ends_at, 'status', a.status, 'client_name', a.client_name) ORDER BY a.date_time ASC) FROM public.appointments a WHERE a.establishment_id = e.id AND a.date_time >= now() AND a.deleted_at IS NULL AND a.status NOT IN ('cancelled', 'canceled') LIMIT 5), '[]'::jsonb)
  ) INTO result
  FROM public.establishments e WHERE e.id = target_establishment_id;
  IF result IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_governance_establishment_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_governance_establishments(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_governance_audit_events(text, text, timestamptz, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_governance_establishment_detail(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_governance_establishment_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_governance_establishments(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_governance_audit_events(text, text, timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_governance_establishment_detail(uuid) TO authenticated;

COMMIT;
