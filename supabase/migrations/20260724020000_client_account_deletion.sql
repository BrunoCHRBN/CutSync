BEGIN;

ALTER TABLE public.governance_privacy_requests
  DROP CONSTRAINT IF EXISTS governance_privacy_requests_status_check;

ALTER TABLE public.governance_privacy_requests
  ADD CONSTRAINT governance_privacy_requests_status_check
  CHECK (status IN ('pending', 'processing', 'executed', 'rejected', 'failed'));

ALTER TABLE public.governance_privacy_requests
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;

WITH duplicate_requests AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY target_profile_id
      ORDER BY created_at DESC, id DESC
    ) AS position
  FROM public.governance_privacy_requests
  WHERE status = 'pending'
)
UPDATE public.governance_privacy_requests AS request
SET
  status = 'rejected',
  decision_reason = 'Solicitação duplicada encerrada durante a migração.',
  decided_at = now(),
  updated_at = now()
FROM duplicate_requests
WHERE request.id = duplicate_requests.id
  AND duplicate_requests.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS governance_privacy_requests_active_profile_idx
  ON public.governance_privacy_requests(target_profile_id)
  WHERE status IN ('pending', 'processing', 'failed');

CREATE OR REPLACE FUNCTION public.submit_client_account_deletion_request()
RETURNS TABLE (
  id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  request_row public.governance_privacy_requests%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = caller_id
      AND profiles.role = 'client'
      AND profiles.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'client_profile_required';
  END IF;

  SELECT *
  INTO request_row
  FROM public.governance_privacy_requests
  WHERE target_profile_id = caller_id
    AND status IN ('pending', 'processing', 'failed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.governance_privacy_requests (
      target_profile_id,
      requested_by,
      request_reason
    )
    VALUES (
      caller_id,
      caller_id,
      'Solicitação de exclusão iniciada pelo titular da conta CutSync.'
    )
    RETURNING * INTO request_row;

    INSERT INTO public.security_audit_logs (
      actor_id,
      action,
      target_id,
      target_type,
      changes
    )
    VALUES (
      caller_id,
      'client.account_deletion.requested',
      request_row.id,
      'privacy_request',
      jsonb_build_object('status', 'pending', 'source', 'client_self_service')
    );
  END IF;

  RETURN QUERY
  SELECT request_row.id, request_row.status, request_row.created_at, request_row.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_account_deletion_request()
RETURNS TABLE (
  id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  processing_started_at timestamptz,
  executed_at timestamptz,
  decision_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  RETURN QUERY
  SELECT
    request.id,
    request.status,
    request.created_at,
    request.updated_at,
    request.processing_started_at,
    request.executed_at,
    CASE
      WHEN request.status IN ('rejected', 'failed') THEN request.decision_reason
      ELSE NULL
    END
  FROM public.governance_privacy_requests AS request
  WHERE request.target_profile_id = caller_id
  ORDER BY request.created_at DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_client_account_deletion_execution(
  target_request_id uuid,
  execution_reason text
)
RETURNS TABLE (
  request_id uuid,
  target_profile_id uuid,
  status text,
  profile_anonymized_at timestamptz,
  auth_deleted_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_row public.governance_privacy_requests%ROWTYPE;
  caller_id uuid := (SELECT auth.uid());
BEGIN
  IF caller_id IS NULL
     OR coalesce((SELECT auth.jwt() ->> 'aal'), 'aal1') <> 'aal2'
     OR NOT public.is_governance_user(
       ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]
     ) THEN
    RAISE EXCEPTION 'governance_aal2_required';
  END IF;

  IF char_length(btrim(coalesce(execution_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'privacy_reason_required';
  END IF;

  SELECT *
  INTO request_row
  FROM public.governance_privacy_requests
  WHERE id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy_request_not_found';
  END IF;

  IF request_row.status = 'executed' THEN
    RETURN QUERY
    SELECT
      request_row.id,
      request_row.target_profile_id,
      request_row.status,
      request_row.profile_anonymized_at,
      request_row.auth_deleted_at;
    RETURN;
  END IF;

  IF request_row.status NOT IN ('pending', 'processing', 'failed') THEN
    RAISE EXCEPTION 'privacy_request_not_executable';
  END IF;

  UPDATE public.governance_privacy_requests
  SET
    status = 'processing',
    decision_reason = btrim(execution_reason),
    decided_by = caller_id,
    decided_at = coalesce(decided_at, now()),
    processing_started_at = now(),
    attempt_count = attempt_count + 1,
    last_error_code = NULL,
    updated_at = now()
  WHERE id = target_request_id
  RETURNING * INTO request_row;

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    caller_id,
    'governance.privacy.processing',
    target_request_id,
    'privacy_request',
    jsonb_build_object('attempt', request_row.attempt_count)
  );

  RETURN QUERY
  SELECT
    request_row.id,
    request_row.target_profile_id,
    request_row.status,
    request_row.profile_anonymized_at,
    request_row.auth_deleted_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.anonymize_client_account_deletion(
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_row public.governance_privacy_requests%ROWTYPE;
  anonymous_email text;
BEGIN
  SELECT *
  INTO request_row
  FROM public.governance_privacy_requests
  WHERE id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy_request_not_found';
  END IF;

  IF request_row.status = 'executed' OR request_row.profile_anonymized_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', request_row.status,
      'idempotent', true
    );
  END IF;

  IF request_row.status <> 'processing' THEN
    RAISE EXCEPTION 'privacy_request_not_processing';
  END IF;

  anonymous_email :=
    'deleted+' || replace(request_row.id::text, '-', '') || '@anon.cutsync.invalid';

  UPDATE public.profiles
  SET
    name = 'Usuário Anonimizado',
    email = anonymous_email,
    phone = NULL,
    avatar_url = NULL,
    instagram = NULL,
    titulo_profissional = NULL,
    specialties = NULL,
    work_hours = NULL,
    pix_key = NULL,
    push_token = NULL,
    notification_channels = ARRAY[]::text[],
    lgpd_marketing_accepted = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
  WHERE id = request_row.target_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  UPDATE public.memberships
  SET
    status = 'revoked',
    revoked_at = coalesce(revoked_at, now()),
    revocation_reason = 'Exclusão de conta solicitada pelo titular',
    updated_at = now()
  WHERE profile_id = request_row.target_profile_id
    AND status = 'active';

  DELETE FROM public.profile_establishments
  WHERE profile_id = request_row.target_profile_id;

  UPDATE public.push_devices
  SET
    enabled = false,
    expo_push_token =
      'deleted-' || replace(id::text, '-', ''),
    updated_at = now()
  WHERE profile_id = request_row.target_profile_id;

  UPDATE public.governance_privacy_requests
  SET
    profile_anonymized_at = now(),
    updated_at = now()
  WHERE id = target_request_id;

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    request_row.decided_by,
    'governance.privacy.profile_anonymized',
    target_request_id,
    'privacy_request',
    jsonb_build_object('status', 'processing')
  );

  RETURN jsonb_build_object(
    'request_id', request_row.id,
    'status', 'processing',
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_client_account_deletion(
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_row public.governance_privacy_requests%ROWTYPE;
BEGIN
  SELECT *
  INTO request_row
  FROM public.governance_privacy_requests
  WHERE id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'privacy_request_not_found';
  END IF;

  IF request_row.status = 'executed' THEN
    RETURN jsonb_build_object('request_id', request_row.id, 'status', 'executed', 'idempotent', true);
  END IF;

  IF request_row.status <> 'processing' OR request_row.profile_anonymized_at IS NULL THEN
    RAISE EXCEPTION 'privacy_request_not_ready';
  END IF;

  UPDATE public.governance_privacy_requests
  SET
    status = 'executed',
    auth_deleted_at = now(),
    executed_at = now(),
    last_error_code = NULL,
    updated_at = now()
  WHERE id = target_request_id;

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    request_row.decided_by,
    'governance.privacy.executed',
    target_request_id,
    'privacy_request',
    jsonb_build_object('status', 'executed', 'attempt', request_row.attempt_count)
  );

  RETURN jsonb_build_object('request_id', request_row.id, 'status', 'executed', 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_client_account_deletion(
  target_request_id uuid,
  target_error_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  request_row public.governance_privacy_requests%ROWTYPE;
  safe_error_code text;
BEGIN
  safe_error_code := left(
    regexp_replace(lower(coalesce(target_error_code, 'execution_failed')), '[^a-z0-9_]', '', 'g'),
    64
  );
  IF safe_error_code = '' THEN
    safe_error_code := 'execution_failed';
  END IF;

  UPDATE public.governance_privacy_requests
  SET
    status = 'failed',
    last_error_code = safe_error_code,
    updated_at = now()
  WHERE id = target_request_id
    AND status = 'processing'
  RETURNING * INTO request_row;

  IF FOUND THEN
    INSERT INTO public.security_audit_logs (
      actor_id,
      action,
      target_id,
      target_type,
      changes
    )
    VALUES (
      request_row.decided_by,
      'governance.privacy.failed',
      target_request_id,
      'privacy_request',
      jsonb_build_object('status', 'failed', 'error_code', safe_error_code)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_client_account_deletion_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_client_account_deletion_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.begin_client_account_deletion_execution(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anonymize_client_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_client_account_deletion(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_governance_privacy_request(uuid, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.submit_client_account_deletion_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_account_deletion_request() TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_client_account_deletion_execution(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_client_account_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_account_deletion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_client_account_deletion(uuid, text) TO service_role;

COMMIT;
