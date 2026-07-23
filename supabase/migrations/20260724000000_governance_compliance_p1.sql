BEGIN;

-- P1: governança de conformidade, acesso e verificação.
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS kyc_document_path text;

-- Remove any legacy public reference and prevent it from being reintroduced.
UPDATE public.establishments SET kyc_document_url = NULL WHERE kyc_document_url IS NOT NULL;
CREATE OR REPLACE FUNCTION public.guard_legacy_kyc_url()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.kyc_document_url IS NOT NULL THEN RAISE EXCEPTION 'public_kyc_document_url_forbidden'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_legacy_kyc_url ON public.establishments;
CREATE TRIGGER guard_legacy_kyc_url BEFORE INSERT OR UPDATE OF kyc_document_url ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_kyc_url();

ALTER TABLE public.establishment_requests
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS document_type text;

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS revocation_reason text;

CREATE TABLE IF NOT EXISTS public.governance_verification_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_path text,
  previous_status text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('submitted', 'approved', 'rejected')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governance_verification_reviews_establishment_idx
  ON public.governance_verification_reviews(establishment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.governance_privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'rejected')),
  request_reason text NOT NULL CHECK (char_length(btrim(request_reason)) BETWEEN 10 AND 500),
  decision_reason text,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS governance_privacy_requests_status_idx
  ON public.governance_privacy_requests(status, created_at DESC);

ALTER TABLE public.governance_verification_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governance_privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_governance_user_direct_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF nullif(btrim(current_setting('cutsync.governance_access_reason', true)), '') IS NULL THEN
    RAISE EXCEPTION 'governance_access_change_requires_reason';
  END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.role = 'SaaS_Owner'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'SaaS_Owner')
     AND (SELECT count(*) FROM public.governance_users WHERE role='SaaS_Owner') <= 1 THEN
    RAISE EXCEPTION 'last_owner_protected';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_governance_user_direct_write ON public.governance_users;
CREATE TRIGGER guard_governance_user_direct_write BEFORE INSERT OR UPDATE OR DELETE ON public.governance_users
  FOR EACH ROW EXECUTE FUNCTION public.guard_governance_user_direct_write();

DROP POLICY IF EXISTS governance_verification_reviews_read ON public.governance_verification_reviews;
CREATE POLICY governance_verification_reviews_read ON public.governance_verification_reviews
  FOR SELECT TO authenticated USING (public.is_governance_user());
DROP POLICY IF EXISTS governance_privacy_requests_read ON public.governance_privacy_requests;
CREATE POLICY governance_privacy_requests_read ON public.governance_privacy_requests
  FOR SELECT TO authenticated USING (public.is_governance_user() OR requested_by = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.governance_verification_reviews, public.governance_privacy_requests, public.governance_users FROM authenticated;
-- Fluxos antigos não podem contornar justificativa e auditoria do P1.
REVOKE EXECUTE ON FUNCTION public.approve_establishment_request(uuid), public.reject_establishment_request(uuid, text) FROM authenticated;

-- O bucket nunca é público; documentos só são entregues por createSignedUrl.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('governance-kyc', 'governance-kyc', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];

DROP POLICY IF EXISTS governance_kyc_read ON storage.objects;
CREATE POLICY governance_kyc_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'governance-kyc' AND public.is_governance_user());
DROP POLICY IF EXISTS governance_kyc_insert ON storage.objects;
CREATE POLICY governance_kyc_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'governance-kyc' AND public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]));
DROP POLICY IF EXISTS governance_kyc_update ON storage.objects;
CREATE POLICY governance_kyc_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'governance-kyc' AND public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]))
  WITH CHECK (bucket_id = 'governance-kyc' AND public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]));
DROP POLICY IF EXISTS governance_kyc_delete ON storage.objects;
CREATE POLICY governance_kyc_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'governance-kyc' AND public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]));

CREATE OR REPLACE FUNCTION public.list_governance_establishment_requests(
  search_term text DEFAULT NULL, status_filter text DEFAULT NULL,
  page_size integer DEFAULT 50, page_offset integer DEFAULT 0
)
RETURNS TABLE (id uuid, requester_id uuid, requester_name text, requester_email text, name text,
  slug text, address text, phone text, document_number text, status text, rejection_reason text,
  establishment_id uuid, created_at timestamptz, reviewed_at timestamptz, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT r.id, r.requester_id, r.requester_name, r.requester_email, r.name, r.slug,
    r.address, r.phone, r.document_number, r.status, r.rejection_reason, r.establishment_id,
    r.created_at, r.reviewed_at, count(*) OVER ()
  FROM public.establishment_requests r
  WHERE (nullif(btrim(search_term), '') IS NULL OR r.name ILIKE '%'||btrim(search_term)||'%' OR r.slug ILIKE '%'||btrim(search_term)||'%' OR r.requester_name ILIKE '%'||btrim(search_term)||'%' OR r.requester_email ILIKE '%'||btrim(search_term)||'%' OR coalesce(r.document_number, '') ILIKE '%'||btrim(search_term)||'%')
    AND (status_filter IS NULL OR r.status = status_filter)
  ORDER BY r.created_at DESC LIMIT least(greatest(coalesce(page_size, 50), 1), 100) OFFSET greatest(coalesce(page_offset, 0), 0);
END; $$;

CREATE OR REPLACE FUNCTION public.approve_governance_establishment_request(target_request_id uuid, reason text)
RETURNS TABLE (establishment_id uuid, invitation_id uuid, raw_token text, invited_email text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE r public.establishment_requests%ROWTYPE; new_id uuid; invite_id uuid;
  token text := encode(extensions.gen_random_bytes(32), 'hex'); expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'approval_reason_required'; END IF;
  SELECT * INTO r FROM public.establishment_requests WHERE id = target_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug)=lower(r.slug)) THEN RAISE EXCEPTION 'slug_unavailable'; END IF;
  INSERT INTO public.establishments(name, slug, address, phone, primary_color, timezone, currency, account_status)
    VALUES (r.name, r.slug, r.address, r.phone, r.primary_color, 'America/Sao_Paulo', 'BRL', 'pending_verification') RETURNING id INTO new_id;
  INSERT INTO public.invitations(establishment_id, invited_email, role, token_hash, expires_at, created_by)
    VALUES (new_id, lower(r.requester_email), 'admin', encode(extensions.digest(token,'sha256'),'hex'), expiry, (SELECT auth.uid())) RETURNING id INTO invite_id;
  UPDATE public.establishment_requests SET status='approved', reviewed_by=(SELECT auth.uid()), reviewed_at=now(), establishment_id=new_id, updated_at=now() WHERE id=target_request_id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
    VALUES ((SELECT auth.uid()), 'governance.request.approved', new_id, r.requester_id, jsonb_build_object('request_id', target_request_id, 'invitation_id', invite_id, 'reason_provided', true));
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
    VALUES ((SELECT auth.uid()), 'governance.request.approved', target_request_id, 'establishment_request', jsonb_build_object('establishment_id', new_id, 'reason_provided', true));
  RETURN QUERY SELECT new_id, invite_id, token, lower(r.requester_email), expiry;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_governance_establishment_request(target_request_id uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
  UPDATE public.establishment_requests SET status='rejected', rejection_reason=btrim(reason), reviewed_by=(SELECT auth.uid()), reviewed_at=now(), updated_at=now() WHERE id=target_request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  INSERT INTO public.authorization_audit_log(actor_id, action, metadata) VALUES ((SELECT auth.uid()), 'governance.request.rejected', jsonb_build_object('request_id', target_request_id, 'reason_provided', true));
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.request.rejected', target_request_id, 'establishment_request', jsonb_build_object('reason_provided', true));
END; $$;

CREATE OR REPLACE FUNCTION public.submit_governance_verification(target_establishment_id uuid, document_path text, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE previous text; clean_path text := btrim(document_path);
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'verification_reason_required'; END IF;
  IF clean_path IS NULL OR clean_path !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]+\.(pdf|PDF|jpg|JPG|jpeg|JPEG|png|PNG)$' THEN RAISE EXCEPTION 'invalid_kyc_document_path'; END IF;
  SELECT kyc_status INTO previous FROM public.establishments WHERE id=target_establishment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  UPDATE public.establishments SET kyc_document_path=clean_path, kyc_status='pending', updated_at=now() WHERE id=target_establishment_id;
  INSERT INTO public.governance_verification_reviews(establishment_id, reviewer_id, document_path, previous_status, decision, reason) VALUES (target_establishment_id,(SELECT auth.uid()),clean_path,coalesce(previous,'unsubmitted'),'submitted',btrim(reason));
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.kyc.submitted', target_establishment_id, 'establishment', jsonb_build_object('decision','submitted','reason_provided',true));
  RETURN jsonb_build_object('establishment_id',target_establishment_id,'kyc_status','pending');
END; $$;

CREATE OR REPLACE FUNCTION public.list_governance_verification_reviews(target_establishment_id uuid DEFAULT NULL, status_filter text DEFAULT NULL)
RETURNS TABLE (id uuid, establishment_id uuid, establishment_name text, document_path text, previous_status text, decision text, reason text, reviewer_id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT v.id, v.establishment_id, e.name, v.document_path, v.previous_status, v.decision, v.reason, v.reviewer_id, v.created_at
  FROM public.governance_verification_reviews v JOIN public.establishments e ON e.id=v.establishment_id
  WHERE (target_establishment_id IS NULL OR v.establishment_id=target_establishment_id) AND (status_filter IS NULL OR v.decision=status_filter)
  ORDER BY v.created_at DESC LIMIT 100;
END; $$;

CREATE OR REPLACE FUNCTION public.review_governance_verification(target_review_id uuid, target_decision text, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE review public.governance_verification_reviews%ROWTYPE; old_status text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_verification_decision'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'verification_reason_required'; END IF;
  SELECT * INTO review FROM public.governance_verification_reviews WHERE id=target_review_id AND decision='submitted' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification_review_not_pending'; END IF;
  SELECT kyc_status INTO old_status FROM public.establishments WHERE id=review.establishment_id FOR UPDATE;
  UPDATE public.establishments SET kyc_status=target_decision, verification_level=CASE WHEN target_decision='approved' THEN greatest(verification_level,3) ELSE verification_level END, updated_at=now() WHERE id=review.establishment_id;
  UPDATE public.governance_verification_reviews SET decision=target_decision, reviewer_id=(SELECT auth.uid()), reason=btrim(reason) WHERE id=target_review_id;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.kyc.reviewed', review.establishment_id, 'establishment', jsonb_build_object('review_id',target_review_id,'decision',target_decision,'previous_status',old_status,'reason_provided',true));
  RETURN jsonb_build_object('establishment_id',review.establishment_id,'decision',target_decision);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_governance_privacy_request(target_profile_id uuid, reason text)
RETURNS public.governance_privacy_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result public.governance_privacy_requests;
BEGIN
  IF (SELECT auth.uid()) <> target_profile_id AND NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'privacy_reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=target_profile_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO public.governance_privacy_requests(target_profile_id,requested_by,request_reason) VALUES (target_profile_id,(SELECT auth.uid()),btrim(reason)) RETURNING * INTO result;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.privacy.submitted', result.id, 'privacy_request', jsonb_build_object('target_profile_id',target_profile_id));
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.list_governance_privacy_requests(status_filter text DEFAULT NULL)
RETURNS TABLE (id uuid, target_profile_id uuid, target_name text, requested_by uuid, status text, request_reason text, decision_reason text, decided_by uuid, decided_at timestamptz, executed_at timestamptz, created_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT r.id, r.target_profile_id, coalesce(p.name,'Usuário anonimizado'), r.requested_by, r.status, r.request_reason, r.decision_reason, r.decided_by, r.decided_at, r.executed_at, r.created_at, r.updated_at
  FROM public.governance_privacy_requests r LEFT JOIN public.profiles p ON p.id=r.target_profile_id
  WHERE status_filter IS NULL OR r.status=status_filter ORDER BY r.created_at DESC LIMIT 100;
END; $$;

CREATE OR REPLACE FUNCTION public.execute_governance_privacy_request(request_id uuid, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions AS $$
DECLARE request_row public.governance_privacy_requests%ROWTYPE;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'privacy_reason_required'; END IF;
  SELECT * INTO request_row FROM public.governance_privacy_requests WHERE id=request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'privacy_request_not_found'; END IF;
  IF request_row.status='executed' THEN RETURN jsonb_build_object('id',request_row.id,'status','executed','idempotent',true); END IF;
  IF request_row.status<>'pending' THEN RAISE EXCEPTION 'privacy_request_not_pending'; END IF;
  PERFORM public.anonymize_user_profile(request_row.target_profile_id);
  UPDATE public.governance_privacy_requests SET status='executed', decision_reason=btrim(reason), decided_by=(SELECT auth.uid()), decided_at=now(), executed_at=now(), updated_at=now() WHERE id=request_id;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.privacy.executed', request_id, 'privacy_request', jsonb_build_object('status','executed','reason_provided',true));
  RETURN jsonb_build_object('id',request_id,'status','executed','idempotent',false);
END; $$;

CREATE OR REPLACE FUNCTION public.reject_governance_privacy_request(request_id uuid, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'privacy_reason_required'; END IF;
  UPDATE public.governance_privacy_requests SET status='rejected', decision_reason=btrim(reason), decided_by=(SELECT auth.uid()), decided_at=now(), updated_at=now() WHERE id=request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'privacy_request_not_pending'; END IF;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.privacy.rejected', request_id, 'privacy_request', jsonb_build_object('status','rejected','reason_provided',true));
  RETURN jsonb_build_object('id',request_id,'status','rejected');
END; $$;

CREATE OR REPLACE FUNCTION public.list_governance_users()
RETURNS TABLE (profile_id uuid, name text, email text, role public.governance_role_enum, granted_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT g.profile_id, coalesce(p.name,'Usuário'), p.email, g.role, g.granted_at, g.updated_at FROM public.governance_users g JOIN public.profiles p ON p.id=g.profile_id ORDER BY g.role, p.name;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_governance_role(target_profile_id uuid, target_role public.governance_role_enum, reason text)
RETURNS public.governance_users LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE result public.governance_users;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'access_reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=target_profile_id) THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  PERFORM set_config('cutsync.governance_access_reason', btrim(reason), true);
  INSERT INTO public.governance_users(profile_id,role,granted_by) VALUES (target_profile_id,target_role,(SELECT auth.uid())) ON CONFLICT (profile_id) DO UPDATE SET role=excluded.role, granted_by=(SELECT auth.uid()), updated_at=now() RETURNING * INTO result;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.user_role_changed', target_profile_id, 'governance_user', jsonb_build_object('role',target_role,'reason_provided',true));
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_governance_role(target_profile_id uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE owner_count integer;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'access_reason_required'; END IF;
  IF (SELECT role FROM public.governance_users WHERE profile_id=target_profile_id)='SaaS_Owner' THEN
    SELECT count(*) INTO owner_count FROM public.governance_users WHERE role='SaaS_Owner';
    IF owner_count <= 1 THEN RAISE EXCEPTION 'last_owner_protected'; END IF;
  END IF;
  PERFORM set_config('cutsync.governance_access_reason', btrim(reason), true);
  DELETE FROM public.governance_users WHERE profile_id=target_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'governance_user_not_found'; END IF;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.user_removed', target_profile_id, 'governance_user', jsonb_build_object('reason_provided',true));
END; $$;

CREATE OR REPLACE FUNCTION public.list_governance_memberships(status_filter text DEFAULT NULL)
RETURNS TABLE (id uuid, profile_id uuid, profile_name text, profile_email text, establishment_id uuid, establishment_name text, role text, status text, created_at timestamptz, revoked_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT m.id, m.profile_id, coalesce(p.name,'Usuário'), p.email, m.establishment_id, e.name, m.role, m.status, m.created_at, m.revoked_at FROM public.memberships m JOIN public.profiles p ON p.id=m.profile_id JOIN public.establishments e ON e.id=m.establishment_id WHERE status_filter IS NULL OR m.status=status_filter ORDER BY m.created_at DESC LIMIT 200;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_governance_membership(target_membership_id uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE m public.memberships%ROWTYPE;
BEGIN
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;
  SELECT * INTO m FROM public.memberships WHERE id=target_membership_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership_not_active'; END IF;
  IF m.role='admin' AND NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF m.role='professional' AND NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.memberships SET status='revoked', revoked_at=now(), revocation_reason=btrim(reason), updated_at=now() WHERE id=target_membership_id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata) VALUES ((SELECT auth.uid()), 'governance.membership.revoked', m.establishment_id, m.profile_id, jsonb_build_object('membership_id',m.id,'role',m.role,'reason_provided',true));
END; $$;

CREATE OR REPLACE FUNCTION public.list_governance_invitations(status_filter text DEFAULT NULL)
RETURNS TABLE (id uuid, establishment_id uuid, establishment_name text, invited_email text, role text, status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT i.id, i.establishment_id, e.name, i.invited_email, i.role, i.status, i.expires_at, i.created_at FROM public.invitations i JOIN public.establishments e ON e.id=i.establishment_id WHERE status_filter IS NULL OR i.status=status_filter ORDER BY i.created_at DESC LIMIT 200;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_governance_invitation(target_invitation_id uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE i public.invitations%ROWTYPE;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;
  SELECT * INTO i FROM public.invitations WHERE id=target_invitation_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE public.invitations SET status='revoked', revoked_at=now(), revocation_reason=btrim(reason) WHERE id=target_invitation_id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata) VALUES ((SELECT auth.uid()), 'governance.invitation.revoked', i.establishment_id, jsonb_build_object('invitation_id',i.id,'role',i.role,'reason_provided',true));
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_establishment_onboarding(target_establishment_id uuid, opening_hours text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('cutsync.governance_status_reason', 'Onboarding concluído', true);
  UPDATE public.establishments SET opening_hours=finalize_establishment_onboarding.opening_hours, account_status='active', updated_at=now() WHERE id=target_establishment_id;
END; $$;

REVOKE ALL ON FUNCTION public.list_governance_establishment_requests(text,text,integer,integer), public.approve_governance_establishment_request(uuid,text), public.reject_governance_establishment_request(uuid,text), public.submit_governance_verification(uuid,text,text), public.list_governance_verification_reviews(uuid,text), public.review_governance_verification(uuid,text,text), public.submit_governance_privacy_request(uuid,text), public.list_governance_privacy_requests(text), public.execute_governance_privacy_request(uuid,text), public.reject_governance_privacy_request(uuid,text), public.list_governance_users(), public.grant_governance_role(uuid,public.governance_role_enum,text), public.revoke_governance_role(uuid,text), public.list_governance_memberships(text), public.revoke_governance_membership(uuid,text), public.list_governance_invitations(text), public.revoke_governance_invitation(uuid,text), public.finalize_establishment_onboarding(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_governance_establishment_requests(text,text,integer,integer), public.list_governance_verification_reviews(uuid,text), public.list_governance_privacy_requests(text), public.list_governance_users(), public.list_governance_memberships(text), public.list_governance_invitations(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_governance_establishment_request(uuid,text), public.reject_governance_establishment_request(uuid,text), public.submit_governance_verification(uuid,text,text), public.review_governance_verification(uuid,text,text), public.submit_governance_privacy_request(uuid,text), public.execute_governance_privacy_request(uuid,text), public.reject_governance_privacy_request(uuid,text), public.grant_governance_role(uuid,public.governance_role_enum,text), public.revoke_governance_role(uuid,text), public.revoke_governance_membership(uuid,text), public.revoke_governance_invitation(uuid,text), public.finalize_establishment_onboarding(uuid,text) TO authenticated;

COMMIT;
