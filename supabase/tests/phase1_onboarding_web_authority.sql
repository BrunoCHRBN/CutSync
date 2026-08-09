BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_onboarding_actor(actor_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
END;
$$;

DO $test$
DECLARE
  actor_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  personal_request_id uuid := gen_random_uuid();
  establishment_request_id uuid := gen_random_uuid();
  receipt jsonb;
  context_row jsonb;
  progress_row jsonb;
  denied boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (actor_id, 'onboarding-actor@example.test', now()),
    (outsider_id, 'onboarding-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  ) VALUES (
    unit_id,
    'Onboarding Unit',
    'onboarding-unit-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false
  );

  -- The profile role is intentionally client. Establishment authority comes
  -- exclusively from the active membership and its role template.
  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (actor_id, NULL, 'Onboarding Actor', 'onboarding-actor@example.test', 'client'),
    (outsider_id, NULL, 'Onboarding Outsider', 'onboarding-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET
    establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES (
    actor_id, unit_id, 'admin', 'admin', 'active', actor_id
  );

  PERFORM pg_temp.set_onboarding_actor(actor_id);
  PERFORM public.set_my_active_context(
    'web', 'establishment', unit_id, NULL, gen_random_uuid()
  );

  SELECT context INTO context_row
  FROM public.get_my_authorized_contexts('web') AS context
  WHERE context->>'contextKind' = 'establishment';
  IF context_row->>'establishmentId' <> unit_id::text
    OR NOT (context_row->>'active')::boolean
    OR context_row->>'roleTemplate' <> 'admin'
    OR NOT (context_row->'capabilities' ? 'manage_services')
    OR context_row->>'establishmentSlug' IS NULL
  THEN
    RAISE EXCEPTION 'Web authority context did not come from membership capabilities: %', context_row;
  END IF;

  receipt := public.set_my_onboarding_progress(
    'web', 'client_account', 'personal', NULL, NULL,
    'account_details', 'in_progress', 0, personal_request_id
  );
  IF receipt->>'status' <> 'in_progress'
    OR (receipt->>'version')::integer <> 1
    OR NOT (receipt->'allowedActions' ? 'advance')
    OR (receipt->>'replayed')::boolean
  THEN
    RAISE EXCEPTION 'personal onboarding was not created: %', receipt;
  END IF;

  receipt := public.set_my_onboarding_progress(
    'web', 'client_account', 'personal', NULL, NULL,
    'account_details', 'in_progress', 0, personal_request_id
  );
  IF NOT (receipt->>'replayed')::boolean
    OR (receipt->>'version')::integer <> 1
  THEN
    RAISE EXCEPTION 'personal onboarding replay failed: %', receipt;
  END IF;

  receipt := public.set_my_onboarding_progress(
    'web', 'client_account', 'personal', NULL, NULL,
    'preferences', 'paused', 1, gen_random_uuid()
  );
  IF receipt->>'status' <> 'paused'
    OR NOT (receipt->'allowedActions' ? 'resume')
  THEN
    RAISE EXCEPTION 'onboarding pause failed: %', receipt;
  END IF;

  receipt := public.set_my_onboarding_progress(
    'web', 'client_account', 'personal', NULL, NULL,
    'preferences', 'in_progress', 2, gen_random_uuid()
  );
  receipt := public.set_my_onboarding_progress(
    'web', 'client_account', 'personal', NULL, NULL,
    'completed', 'completed', 3, gen_random_uuid()
  );
  IF receipt->>'status' <> 'completed'
    OR jsonb_array_length(receipt->'allowedActions') <> 0
    OR (receipt->>'version')::integer <> 4
  THEN
    RAISE EXCEPTION 'onboarding completion failed: %', receipt;
  END IF;

  SELECT progress INTO progress_row
  FROM public.get_my_onboarding_progress('web', 'client_account') AS progress;
  IF progress_row->>'status' <> 'completed'
    OR progress_row->>'dataCutoffAt' IS NULL
    OR progress_row->>'correlationId' IS NULL
    OR progress_row->>'completedAt' IS NULL
  THEN
    RAISE EXCEPTION 'onboarding read model is incomplete: %', progress_row;
  END IF;

  receipt := public.set_my_onboarding_progress(
    'web', 'professional_profile', 'establishment', unit_id, NULL,
    'professional_details', 'in_progress', 0, establishment_request_id
  );
  IF receipt->>'establishmentId' <> unit_id::text THEN
    RAISE EXCEPTION 'establishment onboarding scope was lost: %', receipt;
  END IF;

  UPDATE public.memberships
  SET status = 'revoked', revoked_at = now()
  WHERE profile_id = actor_id AND establishment_id = unit_id;
  denied := false;
  BEGIN
    PERFORM public.set_my_onboarding_progress(
      'web', 'professional_profile', 'establishment', unit_id, NULL,
      'professional_details', 'in_progress', 0, establishment_request_id
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'revoked actor replayed establishment onboarding';
  END IF;

  PERFORM pg_temp.set_onboarding_actor(outsider_id);
  denied := false;
  BEGIN
    PERFORM public.set_my_onboarding_progress(
      'web', 'professional_profile', 'establishment', unit_id, NULL,
      'professional_details', 'in_progress', 0, gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'outsider wrote establishment onboarding';
  END IF;

  IF has_table_privilege(
    'authenticated', 'public.user_onboarding_progress', 'SELECT'
  ) OR has_table_privilege(
    'authenticated', 'public.user_onboarding_events', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'onboarding tables must remain RPC-only';
  END IF;
END;
$test$;

ROLLBACK;
