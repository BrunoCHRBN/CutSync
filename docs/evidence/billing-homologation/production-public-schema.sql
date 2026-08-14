


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."governance_role_enum" AS ENUM (
    'SaaS_Viewer',
    'SaaS_Editor',
    'SaaS_Owner'
);


ALTER TYPE "public"."governance_role_enum" OWNER TO "postgres";


CREATE TYPE "public"."invite_status_enum" AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);


ALTER TYPE "public"."invite_status_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_governance_kb_solution"("target_topic_id" "uuid", "target_reply_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  topic_kind text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT kind INTO topic_kind FROM public.governance_kb_topics WHERE id = target_topic_id;
  IF topic_kind NOT IN ('question', 'incident') THEN
    RAISE EXCEPTION 'topic_cannot_be_resolved';
  END IF;

  IF target_reply_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.governance_kb_replies
    WHERE id = target_reply_id AND topic_id = target_topic_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'invalid_solution';
  END IF;

  UPDATE public.governance_kb_topics
  SET accepted_reply_id = target_reply_id,
      resolution_status = CASE WHEN target_reply_id IS NULL THEN 'open' ELSE 'resolved' END,
      last_change_summary = CASE WHEN target_reply_id IS NULL THEN 'Tópico reaberto' ELSE 'Solução aceita' END
  WHERE id = target_topic_id;
END;
$$;


ALTER FUNCTION "public"."accept_governance_kb_solution"("target_topic_id" "uuid", "target_reply_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invitation"("invitation_token" "text") RETURNS TABLE("accepted_role" "text", "accepted_establishment_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."accept_invitation"("invitation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invitation_v2"("invitation_token" "text") RETURNS TABLE("accepted_role" "text", "accepted_establishment_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  pending_invite public.establishment_invites%ROWTYPE;
  current_email TEXT;
  current_phone TEXT;
  effective_role TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_invitation_token'; END IF;

  SELECT lower(email), phone INTO current_email, current_phone FROM public.profiles
  WHERE id = (SELECT auth.uid()) AND deleted_at IS NULL;

  -- Obter o convite com trava for update
  SELECT * INTO pending_invite FROM public.establishment_invites
  WHERE token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex') FOR UPDATE;
  
  IF NOT FOUND OR pending_invite.status <> 'pending' THEN 
    RAISE EXCEPTION 'invalid_or_used_invitation'; 
  END IF;

  -- Expiração passiva
  IF pending_invite.expires_at <= now() THEN
    UPDATE public.establishment_invites SET status = 'expired' WHERE id = pending_invite.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;

  -- Match de Identidade
  IF lower(pending_invite.target_contact) <> current_email AND pending_invite.target_contact <> current_phone THEN
    RAISE EXCEPTION 'invitation_contact_mismatch';
  END IF;

  -- Vínculo na tabela de memberships
  INSERT INTO public.memberships(profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES (
    (SELECT auth.uid()),
    pending_invite.establishment_id,
    pending_invite.role,
    'active',
    0.50,
    pending_invite.created_by
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = CASE WHEN public.memberships.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
      status = 'active', revoked_at = NULL, updated_at = now();

  SELECT role INTO effective_role FROM public.memberships
  WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invite.establishment_id;

  -- Atualizar perfil ativo do usuário
  UPDATE public.profiles
  SET establishment_id = pending_invite.establishment_id,
      role = effective_role,
      commission_rate = (SELECT commission_rate FROM public.memberships
        WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invite.establishment_id),
      updated_at = now()
  WHERE id = (SELECT auth.uid());

  -- Atualizar tabela de vinculação legada
  INSERT INTO public.profile_establishments(profile_id, establishment_id, role)
  VALUES ((SELECT auth.uid()), pending_invite.establishment_id, effective_role)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  -- Marcar convite como resgatado e salvar aceite LGPD
  UPDATE public.establishment_invites
  SET status = 'accepted', 
      accepted_by = (SELECT auth.uid()), 
      accepted_at = now(),
      lgpd_accepted = true
  WHERE id = pending_invite.id;

  -- Log de Auditoria
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'invite.accepted',
    pending_invite.id,
    'invite',
    jsonb_build_object('establishment_id', pending_invite.establishment_id, 'role', effective_role)
  );

  RETURN QUERY SELECT effective_role, pending_invite.establishment_id;
END;
$_$;


ALTER FUNCTION "public"."accept_invitation_v2"("invitation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_my_lgpd_terms"("target_marketing_accepted" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  UPDATE public.profiles AS profile
  SET lgpd_terms_accepted = true,
      lgpd_marketing_accepted = COALESCE(target_marketing_accepted, false),
      lgpd_accepted_at = COALESCE(profile.lgpd_accepted_at, now()),
      updated_at = now()
  WHERE profile.id = (SELECT auth.uid())
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."accept_my_lgpd_terms"("target_marketing_accepted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_organization_invitation"("invitation_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_email text;
  invitation public.organization_invitations%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT lower(email) INTO actor_email FROM auth.users
  WHERE id = actor_id AND email_confirmed_at IS NOT NULL;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'verified_email_required'; END IF;

  SELECT * INTO invitation FROM public.organization_invitations
  WHERE token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
  FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' THEN RAISE EXCEPTION 'invalid_or_used_invitation'; END IF;
  IF invitation.expires_at <= now() THEN
    UPDATE public.organization_invitations SET status = 'expired' WHERE id = invitation.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;
  IF lower(invitation.invited_email) <> actor_email THEN RAISE EXCEPTION 'invitation_email_mismatch'; END IF;

  INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
  VALUES (invitation.organization_id, actor_id, invitation.role, invitation.created_by)
  ON CONFLICT (organization_id, profile_id) DO UPDATE
  SET role = EXCLUDED.role, status = 'active', revoked_at = NULL, updated_at = now();
  UPDATE public.organization_invitations
  SET status = 'accepted', accepted_by = actor_id, accepted_at = now()
  WHERE id = invitation.id;
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, target_profile_id, metadata
  ) VALUES (
    invitation.organization_id, actor_id, 'organization.invitation_accepted',
    actor_id, jsonb_build_object('invitation_id', invitation.id)
  );
  RETURN invitation.organization_id;
END;
$$;


ALTER FUNCTION "public"."accept_organization_invitation"("invitation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_control_subscription"("target_organization_id" "uuid", "target_plan_code" "text", "target_period_start" "date" DEFAULT CURRENT_DATE) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  account_id uuid;
  plan_id uuid;
  new_subscription_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO account_id FROM public.organization_billing_accounts WHERE organization_id = target_organization_id;
  SELECT id INTO plan_id FROM public.organization_billing_plans
    WHERE code = target_plan_code AND active AND base_price_cents IS NOT NULL;
  IF account_id IS NULL THEN RAISE EXCEPTION 'billing_account_not_found'; END IF;
  IF plan_id IS NULL THEN RAISE EXCEPTION 'priced_plan_not_found'; END IF;

  INSERT INTO public.organization_subscriptions(
    billing_account_id, plan_id, status, current_period_start, current_period_end
  ) VALUES (
    account_id, plan_id, 'active', target_period_start, target_period_start + 29
  )
  ON CONFLICT (billing_account_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    grace_ends_at = NULL,
    updated_at = now()
  RETURNING id INTO new_subscription_id;

  UPDATE public.subscription_units SET effective_until = target_period_start - 1
  WHERE subscription_id = new_subscription_id
    AND effective_until IS NULL;
  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT new_subscription_id, link.establishment_id, target_period_start
  FROM public.organization_establishments link
  WHERE link.organization_id = target_organization_id
    AND link.status = 'active' AND link.effective_until IS NULL
  ON CONFLICT (subscription_id, establishment_id, effective_from)
  DO UPDATE SET effective_until = NULL;

  INSERT INTO public.organization_billing_events(
    billing_account_id, subscription_id, actor_id, event_type, metadata
  ) VALUES (
    account_id, new_subscription_id, actor_id, 'subscription.activated',
    jsonb_build_object('plan_code', target_plan_code)
  );
  RETURN new_subscription_id;
END;
$$;


ALTER FUNCTION "public"."activate_control_subscription"("target_organization_id" "uuid", "target_plan_code" "text", "target_period_start" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'admin_membership_required';
  END IF;

  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (target_organization_id, target_establishment_id, actor_id);
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id
  ) VALUES (target_organization_id, actor_id, 'organization.establishment_added', target_establishment_id);

  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT subscription.id, target_establishment_id, subscription.current_period_end + 1
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE account.organization_id = target_organization_id
    AND subscription.status <> 'canceled'
  ON CONFLICT (subscription_id, establishment_id, effective_from)
  DO UPDATE SET effective_until = NULL;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'establishment_already_grouped';
END;
$$;


ALTER FUNCTION "public"."add_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_report_available_minutes"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid" DEFAULT NULL::"uuid") RETURNS bigint
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  target_timezone text;
  establishment_hours_text text;
  establishment_schedule jsonb := '[]'::jsonb;
  establishment_has_schedule boolean := false;
  professional_record record;
  professional_schedule jsonb;
  professional_has_schedule boolean;
  establishment_day jsonb;
  professional_day jsonb;
  current_local_date date;
  current_day integer;
  establishment_open time;
  establishment_close time;
  professional_open time;
  professional_close time;
  effective_open time;
  effective_close time;
  day_starts_at timestamptz;
  day_ends_at timestamptz;
  raw_minutes numeric;
  blocked_minutes numeric;
  schedule_blocks_available boolean := false;
  total_minutes bigint := 0;
BEGIN
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;

  SELECT establishment.timezone, establishment.opening_hours
  INTO target_timezone, establishment_hours_text
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names timezone_name WHERE timezone_name.name = target_timezone) THEN
    RAISE EXCEPTION 'invalid_establishment_timezone';
  END IF;
  schedule_blocks_available := to_regclass('public.schedule_blocks') IS NOT NULL;

  BEGIN
    IF NULLIF(trim(establishment_hours_text), '') IS NOT NULL THEN
      establishment_schedule := establishment_hours_text::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END;

  IF jsonb_typeof(establishment_schedule) <> 'array' THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END IF;
  establishment_has_schedule := jsonb_array_length(establishment_schedule) > 0;

  FOR professional_record IN
    SELECT profile.id, profile.work_hours
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
      AND profile.deleted_at IS NULL
      AND (target_professional_id IS NULL OR profile.id = target_professional_id)
  LOOP
    professional_schedule := '[]'::jsonb;
    BEGIN
      IF NULLIF(trim(professional_record.work_hours), '') IS NOT NULL THEN
        professional_schedule := professional_record.work_hours::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_schedule_configuration';
    END;
    IF jsonb_typeof(professional_schedule) <> 'array' THEN
      RAISE EXCEPTION 'invalid_schedule_configuration';
    END IF;
    professional_has_schedule := jsonb_array_length(professional_schedule) > 0;

    current_local_date := target_range_start;
    WHILE current_local_date <= target_range_end LOOP
      current_day := extract(dow FROM current_local_date)::integer;
      establishment_day := NULL;
      professional_day := NULL;
      establishment_open := NULL;
      establishment_close := NULL;
      professional_open := NULL;
      professional_close := NULL;

      IF establishment_has_schedule THEN
        SELECT item INTO establishment_day
        FROM jsonb_array_elements(establishment_schedule) AS schedule_item(item)
        WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
          AND (item->>'day')::integer = current_day
        LIMIT 1;
        IF establishment_day IS NULL OR COALESCE(establishment_day->>'isOpen', 'false') <> 'true' THEN
          current_local_date := current_local_date + 1;
          CONTINUE;
        END IF;
      END IF;

      IF professional_has_schedule THEN
        SELECT item INTO professional_day
        FROM jsonb_array_elements(professional_schedule) AS schedule_item(item)
        WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
          AND (item->>'day')::integer = current_day
        LIMIT 1;
        IF professional_day IS NULL OR COALESCE(professional_day->>'isOpen', 'false') <> 'true' THEN
          current_local_date := current_local_date + 1;
          CONTINUE;
        END IF;
      END IF;

      IF NOT establishment_has_schedule AND NOT professional_has_schedule THEN
        current_local_date := current_local_date + 1;
        CONTINUE;
      END IF;

      BEGIN
        IF establishment_has_schedule THEN
          establishment_open := (establishment_day->>'open')::time;
          establishment_close := (establishment_day->>'close')::time;
        END IF;
        IF professional_has_schedule THEN
          professional_open := (professional_day->>'open')::time;
          professional_close := (professional_day->>'close')::time;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'invalid_schedule_configuration';
      END;

      IF establishment_has_schedule AND professional_has_schedule THEN
        effective_open := GREATEST(establishment_open, professional_open);
        effective_close := LEAST(establishment_close, professional_close);
      ELSIF establishment_has_schedule THEN
        effective_open := establishment_open;
        effective_close := establishment_close;
      ELSE
        effective_open := professional_open;
        effective_close := professional_close;
      END IF;

      IF effective_open IS NOT NULL AND effective_close IS NOT NULL AND effective_open < effective_close THEN
        day_starts_at := (current_local_date + effective_open) AT TIME ZONE target_timezone;
        day_ends_at := (current_local_date + effective_close) AT TIME ZONE target_timezone;
        raw_minutes := extract(epoch FROM (day_ends_at - day_starts_at)) / 60;

        blocked_minutes := 0;
        IF schedule_blocks_available THEN
          EXECUTE $query$
            SELECT COALESCE(sum(
              extract(epoch FROM (
                LEAST(schedule_block.ends_at, $3)
                - GREATEST(schedule_block.starts_at, $4)
              )) / 60
            ), 0)
            FROM public.schedule_blocks schedule_block
            WHERE schedule_block.establishment_id = $1
              AND schedule_block.professional_id = $2
              AND schedule_block.deleted_at IS NULL
              AND schedule_block.starts_at < $3
              AND schedule_block.ends_at > $4
          $query$
          INTO blocked_minutes
          USING target_establishment_id, professional_record.id, day_ends_at, day_starts_at;
        END IF;

        total_minutes := total_minutes + GREATEST(round(raw_minutes - LEAST(blocked_minutes, raw_minutes)), 0)::bigint;
      END IF;

      current_local_date := current_local_date + 1;
    END LOOP;
  END LOOP;

  RETURN total_minutes;
END;
$_$;


ALTER FUNCTION "public"."admin_report_available_minutes"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "updates" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  new_commission numeric;
  changed_fields integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.role = 'professional'
      AND membership.status = 'active'
  ) THEN RAISE EXCEPTION 'professional_membership_required'; END IF;
  IF updates IS NULL OR jsonb_typeof(updates) <> 'object'
  THEN RAISE EXCEPTION 'invalid_updates'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(updates) key
    WHERE key NOT IN ('commission_rate', 'specialties', 'instagram', 'titulo_profissional', 'work_hours')
  ) THEN RAISE EXCEPTION 'unsupported_professional_field'; END IF;

  IF updates ? 'commission_rate' THEN
    new_commission := (updates->>'commission_rate')::numeric;
    IF new_commission < 0 OR new_commission > 1 THEN RAISE EXCEPTION 'invalid_commission'; END IF;
    UPDATE public.memberships SET commission_rate = new_commission, updated_at = now()
    WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;
  END IF;

  IF updates ? 'work_hours' THEN
    BEGIN
      IF jsonb_typeof((updates->>'work_hours')::jsonb) <> 'array'
      THEN RAISE EXCEPTION 'invalid_work_hours'; END IF;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'invalid_work_hours';
    END;
  END IF;

  UPDATE public.profiles SET
    commission_rate = COALESCE(new_commission, commission_rate),
    specialties = CASE WHEN updates ? 'specialties' THEN NULLIF(trim(updates->>'specialties'), '') ELSE specialties END,
    instagram = CASE WHEN updates ? 'instagram' THEN NULLIF(trim(leading '@' FROM updates->>'instagram'), '') ELSE instagram END,
    titulo_profissional = CASE WHEN updates ? 'titulo_profissional' THEN NULLIF(trim(updates->>'titulo_profissional'), '') ELSE titulo_profissional END,
    work_hours = CASE WHEN updates ? 'work_hours' THEN updates->>'work_hours' ELSE work_hours END,
    updated_at = now()
  WHERE id = target_profile_id;

  SELECT count(*)::integer INTO changed_fields FROM jsonb_object_keys(updates);
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'professional.updated', target_establishment_id, target_profile_id,
    jsonb_build_object('fields_changed', changed_fields));
END;
$$;


ALTER FUNCTION "public"."admin_update_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."anonymize_client_account_deletion"("target_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."anonymize_client_account_deletion"("target_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."anonymize_user_profile"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Apenas o próprio proprietário da conta ou um SaaS_Editor/SaaS_Owner pode solicitar
  IF (SELECT auth.uid()) <> target_user_id 
     AND NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
  THEN
     RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO user_email FROM public.profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
     RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Anonimizar tabela public.profiles
  UPDATE public.profiles
  SET name = 'Usuário Anonimizado',
      email = encode(extensions.digest(user_email || now()::text, 'sha256'), 'hex') || '@anon.cutsync.com.br',
      phone = NULL,
      avatar_url = NULL,
      instagram = NULL,
      titulo_profissional = NULL,
      deleted_at = now(),
      updated_at = now()
  WHERE id = target_user_id;

  -- Revogar memberships associados ao usuário
  UPDATE public.memberships
  SET status = 'revoked',
      revoked_at = now(),
      revocation_reason = 'Solicitação de Anonimização (LGPD)'
  WHERE profile_id = target_user_id AND status = 'active';

  -- Registrar o log de auditoria
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'profile.anonymized',
    target_user_id,
    'profile',
    jsonb_build_object('profile_id', target_user_id)
  );
END;
$$;


ALTER FUNCTION "public"."anonymize_user_profile"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_establishment_request"("target_request_id" "uuid") RETURNS TABLE("establishment_id" "uuid", "invitation_id" "uuid", "raw_token" "text", "invited_email" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  pending_request public.establishment_requests%ROWTYPE;
  new_establishment_id uuid;
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_invitation_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO pending_request FROM public.establishment_requests
  WHERE id = target_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF EXISTS (SELECT 1 FROM public.establishments e WHERE lower(e.slug) = lower(pending_request.slug)) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  INSERT INTO public.establishments(name, slug, address, phone, primary_color, timezone, currency)
  VALUES (pending_request.name, pending_request.slug, pending_request.address, pending_request.phone,
    pending_request.primary_color, 'America/Sao_Paulo', 'BRL')
  RETURNING id INTO new_establishment_id;

  INSERT INTO public.invitations(establishment_id, invited_email, role, token_hash, expires_at, created_by)
  VALUES (new_establishment_id, lower(pending_request.requester_email), 'admin',
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), generated_expiry, (SELECT auth.uid()))
  RETURNING id INTO generated_invitation_id;

  UPDATE public.establishment_requests
  SET status = 'approved', reviewed_by = (SELECT auth.uid()), reviewed_at = now(),
      establishment_id = new_establishment_id, updated_at = now()
  WHERE id = target_request_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'establishment.approved', new_establishment_id, pending_request.requester_id,
    jsonb_build_object('request_id', target_request_id, 'invitation_id', generated_invitation_id));

  RETURN QUERY SELECT new_establishment_id, generated_invitation_id, generated_token,
    lower(pending_request.requester_email), generated_expiry;
END;
$$;


ALTER FUNCTION "public"."approve_establishment_request"("target_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_governance_establishment_request"("target_request_id" "uuid", "reason" "text") RETURNS TABLE("establishment_id" "uuid", "invitation_id" "uuid", "raw_token" "text", "invited_email" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."approve_governance_establishment_request"("target_request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_governance_actions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
  RETURN coalesce(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."audit_governance_actions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_membership_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."audit_membership_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."begin_client_account_deletion_execution"("target_request_id" "uuid", "execution_reason" "text") RETURNS TABLE("request_id" "uuid", "target_profile_id" "uuid", "status" "text", "profile_anonymized_at" timestamp with time zone, "auth_deleted_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."begin_client_account_deletion_execution"("target_request_id" "uuid", "execution_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bootstrap_superadmins_from_config"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."bootstrap_superadmins_from_config"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_upload_professional_gallery_image"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    SELECT count(*) < 20
    FROM storage.objects object
    WHERE object.bucket_id = 'professional-gallery'
      AND object.owner_id = (SELECT auth.uid()::text)
  );
$$;


ALTER FUNCTION "public"."can_upload_professional_gallery_image"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_private_profile"("target_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."can_view_private_profile"("target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_profile"("target_profile_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    target_profile_id = (SELECT auth.uid())
    OR public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.appointments own_appointment
      WHERE own_appointment.client_id = (SELECT auth.uid())
        AND own_appointment.professional_id = target_profile_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships viewer
      WHERE viewer.profile_id = (SELECT auth.uid())
        AND viewer.status = 'active'
        AND viewer.role IN ('admin', 'professional')
        AND (
          EXISTS (
            SELECT 1 FROM public.memberships target
            WHERE target.profile_id = target_profile_id
              AND target.establishment_id = viewer.establishment_id
              AND target.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.client_id = target_profile_id
              AND a.establishment_id = viewer.establishment_id
          )
        )
    );
$$;


ALTER FUNCTION "public"."can_view_profile"("target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_appointment"("target_appointment_id" "text", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  target public.appointments%ROWTYPE;
  actor_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(trim(COALESCE(reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'cancellation_reason_required';
  END IF;
  SELECT * INTO target FROM public.appointments WHERE id = target_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;

  IF target.client_id = (SELECT auth.uid()) THEN actor_role := 'client';
  ELSIF public.has_active_membership(target.establishment_id, ARRAY['admin']) THEN actor_role := 'admin';
  ELSIF target.professional_id = (SELECT auth.uid())
    AND public.has_active_membership(target.establishment_id, ARRAY['professional'])
  THEN actor_role := 'professional';
  ELSE RAISE EXCEPTION 'forbidden';
  END IF;
  IF target.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;

  UPDATE public.appointments SET status = 'cancelled', cancellation_reason = trim(reason),
    cancelled_by_role = actor_role, updated_at = now() WHERE id = target.id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'appointment.cancelled', target.establishment_id, target.client_id,
    jsonb_build_object('appointment_id', target.id, 'previous_status', target.status, 'actor_role', actor_role));
END;
$$;


ALTER FUNCTION "public"."cancel_appointment"("target_appointment_id" "text", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_client_push_deliveries"("target_limit" integer DEFAULT 100) RETURNS TABLE("delivery_id" "uuid", "expo_push_token" "text", "notification_title" "text", "notification_body" "text", "notification_payload" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public.client_push_deliveries AS delivery
  SET status = 'skipped',
      last_error_code = 'push_disabled',
      locked_at = NULL,
      updated_at = now()
  WHERE delivery.status IN ('pending', 'processing')
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.push_devices AS device
        WHERE device.id = delivery.push_device_id
          AND device.enabled
          AND device.app_kind = 'client'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = delivery.profile_id
          AND profile.deleted_at IS NULL
          AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT queued.id
    FROM public.client_push_deliveries AS queued
    WHERE (
        queued.status = 'pending'
        OR (
          queued.status = 'processing'
          AND queued.locked_at < now() - interval '5 minutes'
        )
      )
      AND queued.available_at <= now()
      AND queued.attempts < 5
    ORDER BY queued.available_at, queued.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(target_limit, 100), 1), 100)
  ),
  claimed AS (
    UPDATE public.client_push_deliveries AS queued
    SET status = 'processing',
        attempts = queued.attempts + 1,
        locked_at = now(),
        updated_at = now()
    FROM candidates
    WHERE queued.id = candidates.id
    RETURNING queued.*
  )
  SELECT
    claimed.id,
    device.expo_push_token,
    claimed.title,
    claimed.body,
    claimed.payload
  FROM claimed
  JOIN public.push_devices AS device ON device.id = claimed.push_device_id
  ORDER BY claimed.created_at;
END;
$$;


ALTER FUNCTION "public"."claim_client_push_deliveries"("target_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_client_push_receipts"("target_limit" integer DEFAULT 100) RETURNS TABLE("delivery_id" "uuid", "expo_ticket_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  UPDATE public.client_push_deliveries
  SET status = 'failed',
      last_error_code = 'receipt_expired',
      updated_at = now()
  WHERE status = 'ticketed'
    AND ticketed_at < now() - interval '24 hours';

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.client_push_deliveries AS delivery
    WHERE delivery.status = 'ticketed'
      AND delivery.ticketed_at <= now() - interval '15 minutes'
      AND (
        delivery.receipt_checked_at IS NULL
        OR delivery.receipt_checked_at <= now() - interval '15 minutes'
      )
    ORDER BY delivery.ticketed_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(target_limit, 100), 1), 100)
  ),
  claimed AS (
    UPDATE public.client_push_deliveries AS delivery
    SET receipt_checked_at = now(),
        updated_at = now()
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.expo_ticket_id
  )
  SELECT claimed.id, claimed.expo_ticket_id
  FROM claimed
  WHERE claimed.expo_ticket_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."claim_client_push_receipts"("target_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_appointment"("target_appointment_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE target public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.appointments WHERE id = target_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF NOT public.has_active_membership(target.establishment_id, ARRAY['admin'])
    AND NOT (target.professional_id = (SELECT auth.uid())
      AND public.has_active_membership(target.establishment_id, ARRAY['professional']))
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target.status <> 'confirmed' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
  IF target.date_time > now() THEN RAISE EXCEPTION 'future_appointment_cannot_be_completed'; END IF;

  UPDATE public.appointments SET status = 'completed', updated_at = now() WHERE id = target.id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'appointment.completed', target.establishment_id, target.client_id,
    jsonb_build_object('appointment_id', target.id, 'previous_status', target.status));
END;
$$;


ALTER FUNCTION "public"."complete_appointment"("target_appointment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_client_account_deletion"("target_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."complete_client_account_deletion"("target_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_client_push_delivery"("target_delivery_id" "uuid", "target_success" boolean, "target_ticket_id" "text" DEFAULT NULL::"text", "target_error_code" "text" DEFAULT NULL::"text", "target_retryable" boolean DEFAULT false) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  target_device_id uuid;
BEGIN
  UPDATE public.client_push_deliveries AS delivery
  SET
    status = CASE
      WHEN target_success THEN 'ticketed'
      WHEN target_retryable AND delivery.attempts < 5 THEN 'pending'
      ELSE 'failed'
    END,
    expo_ticket_id = CASE WHEN target_success THEN NULLIF(btrim(target_ticket_id), '') ELSE NULL END,
    ticketed_at = CASE WHEN target_success THEN now() ELSE NULL END,
    available_at = CASE
      WHEN NOT target_success AND target_retryable AND delivery.attempts < 5
        THEN now() + make_interval(mins => (2 ^ LEAST(delivery.attempts, 5))::integer)
      ELSE delivery.available_at
    END,
    locked_at = NULL,
    last_error_code = CASE WHEN target_success THEN NULL ELSE NULLIF(btrim(target_error_code), '') END,
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.status = 'processing'
  RETURNING delivery.push_device_id INTO target_device_id;

  IF target_device_id IS NULL THEN RETURN false; END IF;

  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices
    SET enabled = false,
        updated_at = now()
    WHERE id = target_device_id;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."complete_client_push_delivery"("target_delivery_id" "uuid", "target_success" boolean, "target_ticket_id" "text", "target_error_code" "text", "target_retryable" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_client_push_receipt"("target_delivery_id" "uuid", "target_success" boolean, "target_error_code" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  target_device_id uuid;
BEGIN
  UPDATE public.client_push_deliveries AS delivery
  SET status = CASE WHEN target_success THEN 'sent' ELSE 'failed' END,
      sent_at = CASE WHEN target_success THEN now() ELSE NULL END,
      last_error_code = CASE WHEN target_success THEN NULL ELSE NULLIF(btrim(target_error_code), '') END,
      updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.status = 'ticketed'
  RETURNING delivery.push_device_id INTO target_device_id;

  IF target_device_id IS NULL THEN RETURN false; END IF;

  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices
    SET enabled = false,
        updated_at = now()
    WHERE id = target_device_id;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."complete_client_push_receipt"("target_delivery_id" "uuid", "target_success" boolean, "target_error_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text" DEFAULT NULL::"text") RETURNS TABLE("starts_at" timestamp with time zone, "local_time" "text", "duration_minutes" integer, "available" boolean, "unavailable_reason" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT base.starts_at,
    base.local_time,
    base.duration_minutes,
    CASE WHEN base.available AND COALESCE(overlap.blocked, false) THEN false ELSE base.available END,
    CASE WHEN base.available AND COALESCE(overlap.blocked, false) THEN 'blocked' ELSE base.unavailable_reason END
  FROM public.compute_available_slots_before_schedule_blocks(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_local_date,
    ignored_appointment_id
  ) base
  LEFT JOIN LATERAL (
    SELECT true AS blocked
    FROM public.schedule_blocks block
    WHERE base.starts_at IS NOT NULL
      AND block.establishment_id = target_establishment_id
      AND block.professional_id = target_professional_id
      AND block.deleted_at IS NULL
      AND block.starts_at < base.starts_at + make_interval(mins => base.duration_minutes)
      AND block.ends_at > base.starts_at
    LIMIT 1
  ) overlap ON true;
$$;


ALTER FUNCTION "public"."compute_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_available_slots_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text" DEFAULT NULL::"text") RETURNS TABLE("starts_at" timestamp with time zone, "local_time" "text", "duration_minutes" integer, "available" boolean, "unavailable_reason" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  target_timezone text;
  establishment_hours_text text;
  professional_hours_text text;
  establishment_schedule jsonb := '[]'::jsonb;
  professional_schedule jsonb := '[]'::jsonb;
  establishment_day jsonb;
  professional_day jsonb;
  establishment_has_schedule boolean := false;
  professional_has_schedule boolean := false;
  establishment_open time;
  establishment_close time;
  professional_open time;
  professional_close time;
  effective_open time;
  effective_close time;
  resolved_duration integer;
  professional_service_active boolean := true;
  target_day integer := extract(dow FROM target_local_date)::integer;
  local_today date;
  local_start timestamp;
  latest_local_start timestamp;
  local_slot timestamp;
  slot_start timestamptz;
  slot_end timestamptz;
BEGIN
  SELECT establishment.timezone, establishment.opening_hours
  INTO target_timezone, establishment_hours_text
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names timezone_name WHERE timezone_name.name = target_timezone) THEN
    RAISE EXCEPTION 'invalid_establishment_timezone';
  END IF;

  local_today := (now() AT TIME ZONE target_timezone)::date;
  IF target_local_date < local_today OR target_local_date > local_today + 31 THEN
    RAISE EXCEPTION 'invalid_availability_date';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = target_professional_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
  ) THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT profile.work_hours INTO professional_hours_text
  FROM public.profiles profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL;

  SELECT COALESCE(professional_service.duration_minutes, service.duration_minutes),
    COALESCE(professional_service.is_active, true)
  INTO resolved_duration, professional_service_active
  FROM public.services service
  LEFT JOIN public.professional_services professional_service
    ON professional_service.professional_id = target_professional_id
    AND professional_service.service_id = service.id
    AND professional_service.establishment_id = target_establishment_id
  WHERE service.id = target_service_id
    AND service.establishment_id = target_establishment_id
    AND service.is_active = true
    AND service.deleted_at IS NULL;

  IF resolved_duration IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  IF NOT professional_service_active THEN RAISE EXCEPTION 'service_unavailable_for_professional'; END IF;

  BEGIN
    IF NULLIF(trim(establishment_hours_text), '') IS NOT NULL THEN
      establishment_schedule := establishment_hours_text::jsonb;
    END IF;
    IF NULLIF(trim(professional_hours_text), '') IS NOT NULL THEN
      professional_schedule := professional_hours_text::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END;

  IF jsonb_typeof(establishment_schedule) <> 'array'
    OR jsonb_typeof(professional_schedule) <> 'array'
  THEN RAISE EXCEPTION 'invalid_schedule_configuration'; END IF;

  establishment_has_schedule := jsonb_array_length(establishment_schedule) > 0;
  professional_has_schedule := jsonb_array_length(professional_schedule) > 0;

  IF NOT establishment_has_schedule AND NOT professional_has_schedule THEN
    starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
    available := false; unavailable_reason := 'schedule_not_configured';
    RETURN NEXT; RETURN;
  END IF;

  IF establishment_has_schedule THEN
    SELECT item INTO establishment_day
    FROM jsonb_array_elements(establishment_schedule) AS schedule_item(item)
    WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
      AND (item->>'day')::integer = target_day
    LIMIT 1;
    IF establishment_day IS NULL OR COALESCE(establishment_day->>'isOpen', 'false') <> 'true' THEN
      starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
      available := false; unavailable_reason := 'closed';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF professional_has_schedule THEN
    SELECT item INTO professional_day
    FROM jsonb_array_elements(professional_schedule) AS schedule_item(item)
    WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
      AND (item->>'day')::integer = target_day
    LIMIT 1;
    IF professional_day IS NULL OR COALESCE(professional_day->>'isOpen', 'false') <> 'true' THEN
      starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
      available := false; unavailable_reason := 'closed';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  BEGIN
    IF establishment_has_schedule THEN
      establishment_open := (establishment_day->>'open')::time;
      establishment_close := (establishment_day->>'close')::time;
    END IF;
    IF professional_has_schedule THEN
      professional_open := (professional_day->>'open')::time;
      professional_close := (professional_day->>'close')::time;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END;

  IF establishment_has_schedule AND professional_has_schedule THEN
    effective_open := GREATEST(establishment_open, professional_open);
    effective_close := LEAST(establishment_close, professional_close);
  ELSIF establishment_has_schedule THEN
    effective_open := establishment_open;
    effective_close := establishment_close;
  ELSE
    effective_open := professional_open;
    effective_close := professional_close;
  END IF;

  IF effective_open IS NULL OR effective_close IS NULL OR effective_open >= effective_close THEN
    starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
    available := false; unavailable_reason := 'closed';
    RETURN NEXT; RETURN;
  END IF;

  local_start := target_local_date + effective_open;
  latest_local_start := target_local_date + effective_close - make_interval(mins => resolved_duration);

  IF latest_local_start < local_start THEN
    starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
    available := false; unavailable_reason := 'service_exceeds_workday';
    RETURN NEXT; RETURN;
  END IF;

  FOR local_slot IN
    SELECT generate_series(local_start, latest_local_start, interval '30 minutes')
  LOOP
    slot_start := local_slot AT TIME ZONE target_timezone;
    slot_end := slot_start + make_interval(mins => resolved_duration);
    starts_at := slot_start;
    local_time := to_char(local_slot, 'HH24:MI');
    duration_minutes := resolved_duration;

    IF slot_start <= now() THEN
      available := false;
      unavailable_reason := 'past';
    ELSIF EXISTS (
      SELECT 1 FROM public.appointments appointment
      WHERE appointment.professional_id = target_professional_id
        AND appointment.status IN ('pending', 'confirmed')
        AND appointment.deleted_at IS NULL
        AND (ignored_appointment_id IS NULL OR appointment.id <> ignored_appointment_id)
        AND appointment.date_time < slot_end
        AND appointment.ends_at > slot_start
    ) THEN
      available := false;
      unavailable_reason := 'busy';
    ELSE
      available := true;
      unavailable_reason := NULL;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$_$;


ALTER FUNCTION "public"."compute_available_slots_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."configure_control_plan"("target_plan_code" "text", "target_base_price_cents" integer, "target_currency" "text" DEFAULT 'BRL'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE plan_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_base_price_cents < 0 OR target_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_plan_price';
  END IF;
  UPDATE public.organization_billing_plans
  SET base_price_cents = target_base_price_cents, currency = target_currency, updated_at = now()
  WHERE code = target_plan_code AND active
  RETURNING id INTO plan_id;
  IF plan_id IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  RETURN plan_id;
END;
$_$;


ALTER FUNCTION "public"."configure_control_plan"("target_plan_code" "text", "target_base_price_cents" integer, "target_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_appointment"("target_appointment_id" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE target public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.appointments WHERE id = target_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF NOT public.has_active_membership(target.establishment_id, ARRAY['admin'])
    AND NOT (target.professional_id = (SELECT auth.uid())
      AND public.has_active_membership(target.establishment_id, ARRAY['professional']))
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target.status <> 'pending' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;

  UPDATE public.appointments SET status = 'confirmed', cancellation_reason = NULL,
    cancelled_by_role = NULL, updated_at = now() WHERE id = target.id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'appointment.confirmed', target.establishment_id, target.client_id,
    jsonb_build_object('appointment_id', target.id, 'previous_status', target.status));
END;
$$;


ALTER FUNCTION "public"."confirm_appointment"("target_appointment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text" DEFAULT NULL::"text", "target_client_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  PERFORM profile.id FROM public.profiles profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  RETURN public.create_appointment_before_schedule_blocks(
    target_establishment_id, target_professional_id, target_service_id,
    target_date_time, target_client_name, target_client_id
  );
END;
$$;


ALTER FUNCTION "public"."create_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_appointment_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text" DEFAULT NULL::"text", "target_client_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional boolean;
  effective_client_id uuid;
  effective_client_name text;
  initial_status text;
  created_appointment_id text;
  target_timezone text;
  selected_slot record;
  is_instant_booking boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;
  actor_is_admin := public.is_superadmin() OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_professional := target_professional_id = actor_id AND public.has_active_membership(target_establishment_id, ARRAY['professional', 'admin']);
  IF NOT EXISTS (SELECT 1 FROM public.memberships membership WHERE membership.profile_id = target_professional_id AND membership.establishment_id = target_establishment_id AND membership.status = 'active' AND membership.role IN ('professional', 'admin')) THEN
    RAISE EXCEPTION 'professional_unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services service WHERE service.id = target_service_id AND service.establishment_id = target_establishment_id AND service.is_active = true AND service.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.professional_services professional_service WHERE professional_service.professional_id = target_professional_id AND professional_service.service_id = target_service_id AND professional_service.establishment_id = target_establishment_id AND professional_service.is_active = false) THEN
    RAISE EXCEPTION 'service_unavailable_for_professional';
  END IF;

  SELECT establishment.timezone, COALESCE(establishment.instant_booking_enabled, true)
  INTO target_timezone, is_instant_booking
  FROM public.establishments establishment WHERE establishment.id = target_establishment_id;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
      target_establishment_id,
      target_professional_id,
      target_service_id,
      (target_date_time AT TIME ZONE target_timezone)::date,
      NULL
    ) slot
  WHERE slot.starts_at = target_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'; END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  IF actor_is_admin OR actor_is_professional THEN
    effective_client_id := target_client_id;
    IF effective_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = effective_client_id) THEN RAISE EXCEPTION 'client_not_found'; END IF;
    effective_client_name := NULLIF(trim(target_client_name), '');
    IF effective_client_id IS NULL AND effective_client_name IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;
    initial_status := 'confirmed';
  ELSE
    IF target_client_id IS NOT NULL AND target_client_id <> actor_id THEN RAISE EXCEPTION 'forbidden'; END IF;
    effective_client_id := actor_id;
    SELECT profile.name INTO effective_client_name FROM public.profiles profile WHERE profile.id = actor_id;
    IF effective_client_name IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;
    
    IF is_instant_booking THEN
      initial_status := 'confirmed';
    ELSE
      initial_status := 'pending';
    END IF;
  END IF;

  INSERT INTO public.appointments (establishment_id, client_id, client_name, professional_id, service_id, date_time, status, reschedule_count)
  VALUES (target_establishment_id, effective_client_id, effective_client_name, target_professional_id, target_service_id, target_date_time, initial_status, 0)
  RETURNING id INTO created_appointment_id;
  RETURN created_appointment_id;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;


ALTER FUNCTION "public"."create_appointment_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_client_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone) RETURNS TABLE("appointment_id" "text", "appointment_status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  created_id text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = actor_id
      AND profile.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.establishments AS establishment
    WHERE establishment.id = target_establishment_id
      AND establishment.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'establishment_unavailable';
  END IF;

  created_id := public.create_appointment(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    NULL,
    actor_id
  );

  RETURN QUERY
  SELECT appointment.id, appointment.status
  FROM public.appointments AS appointment
  WHERE appointment.id = created_id
    AND appointment.client_id = actor_id
    AND appointment.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
END;
$$;


ALTER FUNCTION "public"."create_client_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_establishment_and_promote_owner"("target_user_id" "uuid", "target_cnpj" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  new_establishment_id UUID;
  normalized_slug TEXT := lower(trim(requested_slug));
BEGIN
  -- Validar unicidade de CNPJ
  IF EXISTS (SELECT 1 FROM public.establishments WHERE document_number = target_cnpj) THEN
    RAISE EXCEPTION 'cnpj_already_registered';
  END IF;

  -- Validar unicidade de slug
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug) = normalized_slug) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  -- Inserir estabelecimento no Nível 1
  INSERT INTO public.establishments (
    name, slug, address, phone, primary_color, document_number, document_type, account_status, verification_level
  ) VALUES (
    trim(requested_name), normalized_slug, trim(requested_address), trim(requested_phone), upper(requested_primary_color), target_cnpj, 'CNPJ', 'pending_verification', 1
  ) RETURNING id INTO new_establishment_id;

  -- Criar membership como admin (proprietário)
  INSERT INTO public.memberships (profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES (target_user_id, new_establishment_id, 'admin', 'active', 0.50, target_user_id)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();

  -- Atualizar tabela profiles
  UPDATE public.profiles
  SET establishment_id = new_establishment_id,
      role = 'admin',
      updated_at = now()
  WHERE id = target_user_id;

  -- Atualizar tabela profile_establishments
  INSERT INTO public.profile_establishments (profile_id, establishment_id, role)
  VALUES (target_user_id, new_establishment_id, 'admin')
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  -- Registrar log de auditoria
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    target_user_id,
    'establishment.auto_promoted',
    new_establishment_id,
    'establishment',
    jsonb_build_object('cnpj', target_cnpj, 'name', requested_name, 'slug', requested_slug)
  );

  RETURN new_establishment_id;
END;
$$;


ALTER FUNCTION "public"."create_establishment_and_promote_owner"("target_user_id" "uuid", "target_cnpj" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_establishment_cpf"("target_user_id" "uuid", "target_cpf" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  new_establishment_id UUID;
  normalized_slug TEXT := lower(trim(requested_slug));
BEGIN
  -- Validar unicidade de CPF
  IF EXISTS (SELECT 1 FROM public.establishments WHERE document_number = target_cpf) THEN
    RAISE EXCEPTION 'cpf_already_registered';
  END IF;

  -- Validar unicidade de slug
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug) = normalized_slug) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  -- Inserir estabelecimento no Nível 1 com WhatsApp verificado
  INSERT INTO public.establishments (
    name, slug, address, phone, primary_color, document_number, document_type, account_status, verification_level, whatsapp_verified
  ) VALUES (
    trim(requested_name), normalized_slug, trim(requested_address), trim(requested_phone), upper(requested_primary_color), target_cpf, 'CPF', 'pending_verification', 1, true
  ) RETURNING id INTO new_establishment_id;

  -- Criar membership como admin (proprietário)
  INSERT INTO public.memberships (profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES (target_user_id, new_establishment_id, 'admin', 'active', 0.50, target_user_id)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();

  -- Atualizar tabela profiles
  UPDATE public.profiles
  SET establishment_id = new_establishment_id,
      role = 'admin',
      updated_at = now()
  WHERE id = target_user_id;

  -- Atualizar tabela profile_establishments
  INSERT INTO public.profile_establishments (profile_id, establishment_id, role)
  VALUES (target_user_id, new_establishment_id, 'admin')
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  -- Registrar log de auditoria
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    target_user_id,
    'establishment.auto_promoted_cpf',
    new_establishment_id,
    'establishment',
    jsonb_build_object('cpf', target_cpf, 'name', requested_name, 'slug', requested_slug)
  );

  RETURN new_establishment_id;
END;
$$;


ALTER FUNCTION "public"."create_establishment_cpf"("target_user_id" "uuid", "target_cpf" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_establishment_invite_v2"("target_establishment_id" "uuid", "target_contact" "text", "target_role" "text") RETURNS TABLE("invitation_id" "uuid", "raw_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  normalized_contact TEXT := lower(trim(target_contact));
  generated_token TEXT := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id UUID;
  generated_expiry TIMESTAMPTZ := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_role NOT IN ('admin', 'professional') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF target_role = 'admin' AND NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_role = 'professional' AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Revogar convites pendentes anteriores para o mesmo contato
  UPDATE public.establishment_invites
  SET status = 'revoked', revoked_at = now()
  WHERE establishment_id = target_establishment_id
    AND lower(target_contact) = normalized_contact
    AND role = target_role
    AND status = 'pending';

  -- Criar o convite seguro
  INSERT INTO public.establishment_invites (
    establishment_id, target_contact, role, token_hash, expires_at, created_by
  ) VALUES (
    target_establishment_id, normalized_contact, target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), generated_expiry, (SELECT auth.uid())
  ) RETURNING id INTO generated_id;

  -- Log de Auditoria
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'invite.created',
    generated_id,
    'invite',
    jsonb_build_object('establishment_id', target_establishment_id, 'role', target_role, 'contact', normalized_contact)
  );

  RETURN QUERY SELECT generated_id, generated_token, generated_expiry;
END;
$$;


ALTER FUNCTION "public"."create_establishment_invite_v2"("target_establishment_id" "uuid", "target_contact" "text", "target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_invitation"("target_establishment_id" "uuid", "target_email" "text", "target_role" "text") RETURNS TABLE("invitation_id" "uuid", "raw_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  normalized_email text := lower(trim(target_email));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF target_role NOT IN ('admin', 'professional') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF target_role = 'admin' AND NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_role = 'professional' AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked', revoked_at = now()
  WHERE establishment_id = target_establishment_id
    AND lower(invited_email) = normalized_email
    AND role = target_role
    AND status = 'pending';

  INSERT INTO public.invitations (
    establishment_id, invited_email, role, token_hash, expires_at, created_by
  ) VALUES (
    target_establishment_id, normalized_email, target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), generated_expiry, (SELECT auth.uid())
  ) RETURNING id INTO generated_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata)
  VALUES ((SELECT auth.uid()), 'invitation.created', target_establishment_id,
    jsonb_build_object('invitation_id', generated_id, 'role', target_role, 'email', normalized_email));

  RETURN QUERY SELECT generated_id, generated_token, generated_expiry;
END;
$_$;


ALTER FUNCTION "public"."create_invitation"("target_establishment_id" "uuid", "target_email" "text", "target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization"("initial_establishment_id" "uuid", "organization_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  new_organization_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(btrim(organization_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_organization_name';
  END IF;
  IF NOT public.has_active_membership(initial_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'admin_membership_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_establishments
    WHERE establishment_id = initial_establishment_id
      AND status = 'active' AND effective_until IS NULL
  ) THEN RAISE EXCEPTION 'establishment_already_grouped'; END IF;

  INSERT INTO public.organizations(name, created_by)
  VALUES (btrim(organization_name), actor_id)
  RETURNING id INTO new_organization_id;

  INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
  VALUES (new_organization_id, actor_id, 'owner', actor_id);
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (new_organization_id, initial_establishment_id, actor_id);
  INSERT INTO public.organization_billing_accounts(organization_id, display_name, billing_email)
  SELECT new_organization_id, btrim(organization_name), profile.email
  FROM public.profiles profile WHERE profile.id = actor_id;
  INSERT INTO public.organization_audit_log(organization_id, actor_id, action, establishment_id)
  VALUES (new_organization_id, actor_id, 'organization.created', initial_establishment_id);

  RETURN new_organization_id;
END;
$$;


ALTER FUNCTION "public"."create_organization"("initial_establishment_id" "uuid", "organization_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_schedule_block"("target_establishment_id" "uuid", "target_professional_id" "uuid", "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_kind" "text", "requested_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_owner boolean;
  created_block_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_start <= now() THEN RAISE EXCEPTION 'schedule_block_must_be_in_future'; END IF;
  IF requested_end <= requested_start OR requested_end > requested_start + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;
  IF requested_kind NOT IN ('break', 'time_off', 'blocked') THEN RAISE EXCEPTION 'invalid_schedule_block_kind'; END IF;
  IF char_length(COALESCE(requested_reason, '')) > 160 THEN RAISE EXCEPTION 'schedule_block_reason_too_long'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_owner := actor_id = target_professional_id
    AND public.has_active_membership(target_establishment_id, ARRAY['professional', 'admin']);
  IF NOT actor_is_admin AND NOT actor_is_owner THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM profile.id
  FROM public.profiles profile
  JOIN public.memberships membership
    ON membership.profile_id = profile.id
    AND membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.role IN ('professional', 'admin')
  WHERE profile.id = target_professional_id
    AND profile.deleted_at IS NULL
  FOR UPDATE OF profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.professional_id = target_professional_id
      AND appointment.status IN ('pending', 'confirmed')
      AND appointment.deleted_at IS NULL
      AND appointment.date_time < requested_end
      AND appointment.ends_at > requested_start
  ) THEN RAISE EXCEPTION 'schedule_block_conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.schedule_blocks block
    WHERE block.establishment_id = target_establishment_id
      AND block.professional_id = target_professional_id
      AND block.deleted_at IS NULL
      AND block.starts_at < requested_end
      AND block.ends_at > requested_start
  ) THEN RAISE EXCEPTION 'schedule_block_overlap'; END IF;

  INSERT INTO public.schedule_blocks (
    establishment_id, professional_id, starts_at, ends_at, kind, reason, created_by
  ) VALUES (
    target_establishment_id, target_professional_id, requested_start, requested_end,
    requested_kind, NULLIF(trim(requested_reason), ''), actor_id
  ) RETURNING id INTO created_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, 'schedule_block_created', target_establishment_id, target_professional_id,
    jsonb_build_object('schedule_block_id', created_block_id, 'kind', requested_kind,
      'starts_at', requested_start, 'ends_at', requested_end)
  );

  RETURN created_block_id;
END;
$$;


ALTER FUNCTION "public"."create_schedule_block"("target_establishment_id" "uuid", "target_professional_id" "uuid", "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_kind" "text", "requested_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_session_is_aal2"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;


ALTER FUNCTION "public"."current_session_is_aal2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_schedule_block"("target_block_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_block public.schedule_blocks%ROWTYPE;
  actor_is_admin boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO current_block
  FROM public.schedule_blocks block
  WHERE block.id = target_block_id AND block.deleted_at IS NULL
  FOR UPDATE;
  IF current_block.id IS NULL THEN RAISE EXCEPTION 'schedule_block_not_found'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_block.establishment_id, ARRAY['admin']);
  IF NOT actor_is_admin AND current_block.professional_id <> actor_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT actor_is_admin
    AND NOT public.has_active_membership(current_block.establishment_id, ARRAY['professional', 'admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.schedule_blocks
  SET deleted_at = now(), updated_at = now()
  WHERE id = target_block_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, target_profile_id, metadata
  ) VALUES (
    actor_id, 'schedule_block_deleted', current_block.establishment_id, current_block.professional_id,
    jsonb_build_object('schedule_block_id', current_block.id, 'kind', current_block.kind,
      'starts_at', current_block.starts_at, 'ends_at', current_block.ends_at)
  );

  RETURN target_block_id;
END;
$$;


ALTER FUNCTION "public"."delete_schedule_block"("target_block_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_client_appointment_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  target_event_type text;
  target_event_key text;
  target_title text;
  target_body text;
  establishment_name text;
  establishment_timezone text;
  localized_starts_at text;
BEGIN
  IF NEW.client_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      target_event_type := 'appointment_confirmed';
      target_title := 'Agendamento confirmado';
    ELSIF NEW.status = 'pending' THEN
      target_event_type := 'appointment_received';
      target_title := 'Agendamento recebido';
    ELSE
      RETURN NEW;
    END IF;
  ELSIF NEW.reschedule_count > OLD.reschedule_count
    OR NEW.date_time IS DISTINCT FROM OLD.date_time
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
  THEN
    target_event_type := 'appointment_rescheduled';
    target_title := 'Agendamento alterado';
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    target_event_type := 'appointment_cancelled';
    target_title := 'Agendamento cancelado';
  ELSIF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    target_event_type := 'appointment_confirmed';
    target_title := 'Agendamento confirmado';
  ELSE
    RETURN NEW;
  END IF;

  SELECT
    establishment.name,
    COALESCE(NULLIF(establishment.timezone, ''), 'America/Sao_Paulo')
  INTO establishment_name, establishment_timezone
  FROM public.establishments AS establishment
  WHERE establishment.id = NEW.establishment_id;

  localized_starts_at := to_char(
    NEW.date_time AT TIME ZONE establishment_timezone,
    'DD/MM/YYYY "às" HH24:MI'
  );

  target_body := CASE target_event_type
    WHEN 'appointment_received' THEN
      'Recebemos seu pedido em ' || establishment_name || ' para ' || localized_starts_at || '.'
    WHEN 'appointment_confirmed' THEN
      'Seu atendimento em ' || establishment_name || ' está confirmado para ' || localized_starts_at || '.'
    WHEN 'appointment_rescheduled' THEN
      'Seu atendimento em ' || establishment_name || ' foi alterado para ' || localized_starts_at || '.'
    WHEN 'appointment_cancelled' THEN
      'Seu atendimento em ' || establishment_name || ' foi cancelado.'
  END;

  target_event_key := concat_ws(
    ':',
    NEW.id,
    target_event_type,
    NEW.status,
    NEW.reschedule_count,
    extract(epoch FROM NEW.date_time)::bigint
  );

  INSERT INTO public.client_push_deliveries (
    event_key,
    event_type,
    profile_id,
    push_device_id,
    appointment_id,
    title,
    body,
    payload
  )
  SELECT
    target_event_key,
    target_event_type,
    NEW.client_id,
    device.id,
    NEW.id,
    target_title,
    target_body,
    jsonb_build_object(
      'appointmentId', NEW.id,
      'eventType', target_event_type,
      'url', '/appointments/' || NEW.id
    )
  FROM public.profiles AS profile
  JOIN public.push_devices AS device
    ON device.profile_id = profile.id
    AND device.app_kind = 'client'
    AND device.enabled
  WHERE profile.id = NEW.client_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_client_appointment_push"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_governance_privacy_request"("request_id" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
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


ALTER FUNCTION "public"."execute_governance_privacy_request"("request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_client_account_deletion"("target_request_id" "uuid", "target_error_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."fail_client_account_deletion"("target_request_id" "uuid", "target_error_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_establishment_onboarding"("target_establishment_id" "uuid", "opening_hours" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('cutsync.governance_status_reason', 'Onboarding concluído', true);
  UPDATE public.establishments SET opening_hours=finalize_establishment_onboarding.opening_hours, account_status='active', updated_at=now() WHERE id=target_establishment_id;
END; $$;


ALTER FUNCTION "public"."finalize_establishment_onboarding"("target_establishment_id" "uuid", "opening_hours" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_governance_kb_attachment"("target_attachment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  attachment_path text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT storage_path INTO attachment_path
  FROM public.governance_kb_attachments
  WHERE id = target_attachment_id;
  IF attachment_path IS NULL THEN
    RAISE EXCEPTION 'attachment_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'governance-kb' AND name = attachment_path
  ) THEN
    RAISE EXCEPTION 'attachment_object_not_found';
  END IF;

  UPDATE public.governance_kb_attachments
  SET upload_status = 'ready'
  WHERE id = target_attachment_id;

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  SELECT (SELECT auth.uid()), 'knowledge.attachment_uploaded', attachment.id,
    'governance_kb_attachment',
    jsonb_build_object('topic_id', attachment.topic_id, 'mime_type', attachment.mime_type, 'size_bytes', attachment.size_bytes)
  FROM public.governance_kb_attachments attachment
  WHERE attachment.id = target_attachment_id;
END;
$$;


ALTER FUNCTION "public"."finalize_governance_kb_attachment"("target_attachment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_report"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  range_starts_at timestamptz;
  range_ends_at timestamptz;
  previous_range_start date;
  previous_range_end date;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
  day_count integer;
  current_day date;
  available_minutes bigint;
  previous_available_minutes bigint;
  occupied_minutes bigint;
  previous_occupied_minutes bigint;
  summary jsonb;
  previous_summary jsonb;
  daily_series jsonb := '[]'::jsonb;
  hourly_demand jsonb := '[]'::jsonb;
  services jsonb := '[]'::jsonb;
  professionals jsonb := '[]'::jsonb;
  cancellations jsonb := '{}'::jsonb;
  clients jsonb := '{}'::jsonb;
  day_available_minutes bigint;
  day_payload jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  day_count := target_range_end - target_range_start + 1;
  previous_range_end := target_range_start - 1;
  previous_range_start := previous_range_end - day_count + 1;
  range_starts_at := target_range_start::timestamp AT TIME ZONE target_timezone;
  range_ends_at := (target_range_end + 1)::timestamp AT TIME ZONE target_timezone;
  previous_starts_at := previous_range_start::timestamp AT TIME ZONE target_timezone;
  previous_ends_at := (previous_range_end + 1)::timestamp AT TIME ZONE target_timezone;

  available_minutes := public.admin_report_available_minutes(
    target_establishment_id, target_range_start, target_range_end, NULL
  );
  previous_available_minutes := public.admin_report_available_minutes(
    target_establishment_id, previous_range_start, previous_range_end, NULL
  );

  SELECT COALESCE(sum(appointment.duration_minutes), 0)::bigint
  INTO occupied_minutes
  FROM public.appointments appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.status <> 'cancelled'
    AND appointment.date_time >= range_starts_at
    AND appointment.date_time < range_ends_at;

  SELECT COALESCE(sum(appointment.duration_minutes), 0)::bigint
  INTO previous_occupied_minutes
  FROM public.appointments appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.status <> 'cancelled'
    AND appointment.date_time >= previous_starts_at
    AND appointment.date_time < previous_ends_at;

  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(
      sum(service.price) FILTER (WHERE appointment.status = 'completed')
      / NULLIF(count(*) FILTER (WHERE appointment.status = 'completed'), 0), 0
    ),
    'occupancy_rate', CASE WHEN available_minutes > 0 THEN LEAST(round(occupied_minutes * 100.0 / available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', occupied_minutes,
    'available_minutes', available_minutes,
    'idle_minutes', GREATEST(available_minutes - occupied_minutes, 0),
    'completed_count', count(*) FILTER (WHERE appointment.status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE appointment.status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE appointment.status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE appointment.status = 'confirmed'),
    'active_count', count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed'))
  )
  INTO summary
  FROM public.appointments appointment
  LEFT JOIN public.services service ON service.id = appointment.service_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.date_time >= range_starts_at
    AND appointment.date_time < range_ends_at;

  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(
      sum(service.price) FILTER (WHERE appointment.status = 'completed')
      / NULLIF(count(*) FILTER (WHERE appointment.status = 'completed'), 0), 0
    ),
    'occupancy_rate', CASE WHEN previous_available_minutes > 0 THEN LEAST(round(previous_occupied_minutes * 100.0 / previous_available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', previous_occupied_minutes,
    'available_minutes', previous_available_minutes,
    'idle_minutes', GREATEST(previous_available_minutes - previous_occupied_minutes, 0),
    'completed_count', count(*) FILTER (WHERE appointment.status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE appointment.status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE appointment.status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE appointment.status = 'confirmed'),
    'active_count', count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed'))
  )
  INTO previous_summary
  FROM public.appointments appointment
  LEFT JOIN public.services service ON service.id = appointment.service_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.date_time >= previous_starts_at
    AND appointment.date_time < previous_ends_at;

  current_day := target_range_start;
  WHILE current_day <= target_range_end LOOP
    day_available_minutes := public.admin_report_available_minutes(
      target_establishment_id, current_day, current_day, NULL
    );
    SELECT jsonb_build_object(
      'date', current_day,
      'production_realized', COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0),
      'scheduled_value', COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
      'occupied_minutes', COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0),
      'available_minutes', day_available_minutes,
      'occupancy_rate', CASE WHEN day_available_minutes > 0 THEN LEAST(round(
        COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0)
        * 100.0 / day_available_minutes, 1
      ), 100) ELSE 0 END,
      'completed_count', count(*) FILTER (WHERE appointment.status = 'completed'),
      'cancelled_count', count(*) FILTER (WHERE appointment.status = 'cancelled'),
      'appointment_count', count(*) FILTER (WHERE appointment.status <> 'cancelled')
    )
    INTO day_payload
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= current_day::timestamp AT TIME ZONE target_timezone
      AND appointment.date_time < (current_day + 1)::timestamp AT TIME ZONE target_timezone;
    daily_series := daily_series || jsonb_build_array(day_payload);
    current_day := current_day + 1;
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(hour_report) ORDER BY hour_report.day_of_week, hour_report.hour), '[]'::jsonb)
  INTO hourly_demand
  FROM (
    SELECT
      extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS day_of_week,
      extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS hour,
      count(*) AS appointment_count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.status <> 'cancelled'
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
    GROUP BY 1, 2
  ) hour_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(service_report) ORDER BY service_report.production_realized DESC, service_report.appointment_count DESC), '[]'::jsonb)
  INTO services
  FROM (
    SELECT service.id, service.name,
      count(*) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(*) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(
        sum(service.price) FILTER (WHERE appointment.status = 'completed')
        / NULLIF(count(*) FILTER (WHERE appointment.status = 'completed'), 0), 0
      ) AS average_ticket,
      COALESCE(round(avg(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled')), 0) AS average_duration_minutes,
      COALESCE(round(
        count(*) FILTER (WHERE appointment.status <> 'cancelled') * 100.0
        / NULLIF(sum(count(*) FILTER (WHERE appointment.status <> 'cancelled')) OVER (), 0), 1
      ), 0) AS demand_share
    FROM public.services service
    LEFT JOIN public.appointments appointment
      ON appointment.service_id = service.id
      AND appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
    WHERE service.establishment_id = target_establishment_id
    GROUP BY service.id, service.name
  ) service_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(professional_report) ORDER BY professional_report.production_realized DESC, professional_report.name), '[]'::jsonb)
  INTO professionals
  FROM (
    SELECT profile.id, profile.name, membership.commission_rate,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * membership.commission_rate AS commission_amount,
      COALESCE(round(
        COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * 100.0
        / NULLIF(sum(COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0)) OVER (), 0), 1
      ), 0) AS production_share,
      capacity.available_minutes,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) AS occupied_minutes,
      CASE WHEN capacity.available_minutes > 0 THEN LEAST(round(
        COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0)
        * 100.0 / capacity.available_minutes, 1
      ), 100) ELSE 0 END AS occupancy_rate
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id AND profile.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT public.admin_report_available_minutes(
        target_establishment_id, target_range_start, target_range_end, profile.id
      ) AS available_minutes
    ) capacity
    LEFT JOIN public.appointments appointment
      ON appointment.professional_id = profile.id
      AND appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
    GROUP BY profile.id, profile.name, membership.commission_rate, capacity.available_minutes
  ) professional_report;

  SELECT jsonb_build_object(
    'total', count(*),
    'by_reason', COALESCE((
      SELECT jsonb_agg(to_jsonb(reason_report) ORDER BY reason_report.count DESC, reason_report.reason)
      FROM (
        SELECT COALESCE(NULLIF(trim(cancelled.cancellation_reason), ''), 'Não informado') AS reason, count(*) AS count
        FROM public.appointments cancelled
        WHERE cancelled.establishment_id = target_establishment_id
          AND cancelled.deleted_at IS NULL
          AND cancelled.status = 'cancelled'
          AND cancelled.date_time >= range_starts_at
          AND cancelled.date_time < range_ends_at
        GROUP BY COALESCE(NULLIF(trim(cancelled.cancellation_reason), ''), 'Não informado')
      ) reason_report
    ), '[]'::jsonb),
    'by_role', COALESCE((
      SELECT jsonb_agg(to_jsonb(role_report) ORDER BY role_report.count DESC, role_report.role)
      FROM (
        SELECT COALESCE(cancelled.cancelled_by_role, 'unknown') AS role, count(*) AS count
        FROM public.appointments cancelled
        WHERE cancelled.establishment_id = target_establishment_id
          AND cancelled.deleted_at IS NULL
          AND cancelled.status = 'cancelled'
          AND cancelled.date_time >= range_starts_at
          AND cancelled.date_time < range_ends_at
        GROUP BY COALESCE(cancelled.cancelled_by_role, 'unknown')
      ) role_report
    ), '[]'::jsonb)
  )
  INTO cancellations
  FROM public.appointments appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.status = 'cancelled'
    AND appointment.date_time >= range_starts_at
    AND appointment.date_time < range_ends_at;

  WITH completed_clients AS (
    SELECT DISTINCT appointment.client_id
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.status = 'completed'
      AND appointment.client_id IS NOT NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
  ), classified_clients AS (
    SELECT completed_client.client_id,
      EXISTS (
        SELECT 1 FROM public.appointments previous
        WHERE previous.establishment_id = target_establishment_id
          AND previous.deleted_at IS NULL
          AND previous.status = 'completed'
          AND previous.client_id = completed_client.client_id
          AND previous.date_time < range_starts_at
      ) AS is_returning
    FROM completed_clients completed_client
  )
  SELECT jsonb_build_object(
    'identified_clients', count(*),
    'new_clients', count(*) FILTER (WHERE NOT is_returning),
    'returning_clients', count(*) FILTER (WHERE is_returning),
    'return_rate', COALESCE(round(count(*) FILTER (WHERE is_returning) * 100.0 / NULLIF(count(*), 0), 1), 0),
    'walk_in_appointments', (
      SELECT count(*) FROM public.appointments walk_in
      WHERE walk_in.establishment_id = target_establishment_id
        AND walk_in.deleted_at IS NULL
        AND walk_in.status = 'completed'
        AND walk_in.client_id IS NULL
        AND walk_in.date_time >= range_starts_at
        AND walk_in.date_time < range_ends_at
    )
  )
  INTO clients
  FROM classified_clients;

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'start', target_range_start,
      'end', target_range_end,
      'days', day_count,
      'previous_start', previous_range_start,
      'previous_end', previous_range_end,
      'timezone', target_timezone
    ),
    'summary', summary,
    'previous_summary', previous_summary,
    'daily_series', daily_series,
    'hourly_demand', hourly_demand,
    'services', services,
    'professionals', professionals,
    'cancellations', cancellations,
    'clients', clients,
    'generated_at', now()
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_report"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_report_details"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_dimension" "text", "target_professional_id" "uuid" DEFAULT NULL::"uuid", "target_service_id" "text" DEFAULT NULL::"text", "target_status" "text" DEFAULT NULL::"text", "target_day" "date" DEFAULT NULL::"date", "target_day_of_week" integer DEFAULT NULL::integer, "target_hour" integer DEFAULT NULL::integer, "target_cursor" "text" DEFAULT NULL::"text", "target_limit" integer DEFAULT 25) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  safe_limit integer := LEAST(GREATEST(COALESCE(target_limit, 25), 1), 25);
  cursor_offset integer := CASE WHEN COALESCE(target_cursor, '') ~ '^[0-9]+$' THEN target_cursor::integer ELSE 0 END;
  result_items jsonb := '[]'::jsonb;
  fetched_count integer := 0;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_dimension NOT IN ('appointments', 'clients') THEN RAISE EXCEPTION 'invalid_report_dimension'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN RAISE EXCEPTION 'invalid_report_range'; END IF;
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled') THEN RAISE EXCEPTION 'invalid_report_status'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT timezone INTO target_timezone FROM public.establishments WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF target_dimension = 'appointments' THEN
    WITH rows AS (
      SELECT jsonb_build_object(
        'kind', 'appointment', 'id', appointment.id, 'date_time', appointment.date_time,
        'status', appointment.status, 'service_name', COALESCE(service.name, 'Serviço removido'),
        'professional_id', appointment.professional_id, 'professional_name', COALESCE(professional.name, 'Profissional'),
        'client_name', COALESCE(NULLIF(appointment.client_name, ''), 'Cliente não identificado'),
        'production_value', COALESCE(service.price, 0)
      ) AS payload
      FROM public.appointments appointment
      LEFT JOIN public.services service ON service.id = appointment.service_id
      LEFT JOIN public.profiles professional ON professional.id = appointment.professional_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_day IS NULL OR (appointment.date_time AT TIME ZONE target_timezone)::date = target_day)
        AND (target_day_of_week IS NULL OR extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_day_of_week)
        AND (target_hour IS NULL OR extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_hour)
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      ORDER BY appointment.date_time DESC, appointment.id
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*) INTO result_items, fetched_count FROM rows;
  ELSE
    INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata)
    VALUES (actor_id, 'report.clients_identified.viewed', target_establishment_id,
      jsonb_build_object('range_start', target_range_start, 'range_end', target_range_end,
        'professional_filter', target_professional_id IS NOT NULL, 'service_filter', target_service_id IS NOT NULL,
        'status_filter', target_status, 'cursor', cursor_offset));

    WITH client_activity AS (
      SELECT appointment.client_id, max(profile.name) AS full_name,
        max(appointment.date_time) FILTER (WHERE appointment.status = 'completed') AS last_visit,
        count(*) FILTER (WHERE appointment.status = 'completed') AS visit_count,
        min(appointment.date_time) FILTER (WHERE appointment.status IN ('pending', 'confirmed') AND appointment.date_time >= now()) AS next_appointment
      FROM public.appointments appointment
      JOIN public.profiles profile ON profile.id = appointment.client_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.client_id IS NOT NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      GROUP BY appointment.client_id
      HAVING count(*) FILTER (WHERE appointment.status = 'completed') > 0
    ), rows AS (
      SELECT jsonb_build_object(
        'kind', 'client', 'id', client_id,
        'display_name', split_part(full_name, ' ', 1) ||
          CASE WHEN strpos(trim(full_name), ' ') > 0 THEN ' ' || left(regexp_replace(trim(full_name), '^.*\s', ''), 1) || '.' ELSE '' END,
        'last_visit', last_visit, 'visit_count', visit_count, 'next_appointment', next_appointment,
        'operational_status', CASE WHEN next_appointment IS NOT NULL THEN 'scheduled'
          WHEN last_visit >= now() - interval '60 days' THEN 'active' ELSE 'inactive' END
      ) AS payload
      FROM client_activity
      ORDER BY last_visit DESC NULLS LAST, client_id
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*) INTO result_items, fetched_count FROM rows;
  END IF;

  RETURN jsonb_build_object(
    'dimension', target_dimension,
    'items', CASE WHEN fetched_count > safe_limit THEN result_items - safe_limit ELSE result_items END,
    'has_more', fetched_count > safe_limit,
    'next_cursor', CASE WHEN fetched_count > safe_limit THEN (cursor_offset + safe_limit)::text ELSE NULL END
  );
END;
$_$;


ALTER FUNCTION "public"."get_admin_report_details"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_dimension" "text", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text", "target_day" "date", "target_day_of_week" integer, "target_hour" integer, "target_cursor" "text", "target_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_report_v2"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid" DEFAULT NULL::"uuid", "target_service_id" "text" DEFAULT NULL::"text", "target_status" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  range_starts_at timestamptz;
  range_ends_at timestamptz;
  previous_range_start date;
  previous_range_end date;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
  day_count integer;
  available_minutes bigint;
  previous_available_minutes bigint;
  summary jsonb;
  previous_summary jsonb;
  daily_series jsonb;
  hourly_demand jsonb;
  services jsonb;
  professionals jsonb;
  cancellations jsonb;
  clients jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'invalid_report_status';
  END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  day_count := target_range_end - target_range_start + 1;
  previous_range_end := target_range_start - 1;
  previous_range_start := previous_range_end - day_count + 1;
  range_starts_at := target_range_start::timestamp AT TIME ZONE target_timezone;
  range_ends_at := (target_range_end + 1)::timestamp AT TIME ZONE target_timezone;
  previous_starts_at := previous_range_start::timestamp AT TIME ZONE target_timezone;
  previous_ends_at := (previous_range_end + 1)::timestamp AT TIME ZONE target_timezone;

  available_minutes := public.admin_report_available_minutes(
    target_establishment_id, target_range_start, target_range_end, target_professional_id
  );
  previous_available_minutes := public.admin_report_available_minutes(
    target_establishment_id, previous_range_start, previous_range_end, target_professional_id
  );

  WITH filtered AS (
    SELECT appointment.*, service.price
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  )
  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(price) FILTER (WHERE status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(sum(price) FILTER (WHERE status = 'completed') / NULLIF(count(*) FILTER (WHERE status = 'completed'), 0), 0),
    'occupancy_rate', CASE WHEN available_minutes > 0 THEN LEAST(round(COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0) * 100.0 / available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0),
    'available_minutes', available_minutes,
    'idle_minutes', GREATEST(available_minutes - COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0), 0),
    'completed_count', count(*) FILTER (WHERE status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE status = 'confirmed'),
    'active_count', count(*) FILTER (WHERE status IN ('pending', 'confirmed'))
  ) INTO summary FROM filtered;

  WITH filtered AS (
    SELECT appointment.*, service.price
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= previous_starts_at
      AND appointment.date_time < previous_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  )
  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(price) FILTER (WHERE status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(sum(price) FILTER (WHERE status = 'completed') / NULLIF(count(*) FILTER (WHERE status = 'completed'), 0), 0),
    'occupancy_rate', CASE WHEN previous_available_minutes > 0 THEN LEAST(round(COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0) * 100.0 / previous_available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0),
    'available_minutes', previous_available_minutes,
    'idle_minutes', GREATEST(previous_available_minutes - COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0), 0),
    'completed_count', count(*) FILTER (WHERE status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE status = 'confirmed'),
    'active_count', count(*) FILTER (WHERE status IN ('pending', 'confirmed'))
  ) INTO previous_summary FROM filtered;

  WITH days AS (
    SELECT generate_series(target_range_start, target_range_end, interval '1 day')::date AS day
  ), filtered AS (
    SELECT appointment.*, service.price, (appointment.date_time AT TIME ZONE target_timezone)::date AS local_day
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  ), day_rows AS (
    SELECT days.day,
      COALESCE(sum(filtered.price) FILTER (WHERE filtered.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(filtered.price) FILTER (WHERE filtered.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(filtered.duration_minutes) FILTER (WHERE filtered.status <> 'cancelled'), 0) AS occupied_minutes,
      public.admin_report_available_minutes(target_establishment_id, days.day, days.day, target_professional_id) AS day_available_minutes,
      count(filtered.id) FILTER (WHERE filtered.status = 'completed') AS completed_count,
      count(filtered.id) FILTER (WHERE filtered.status = 'cancelled') AS cancelled_count,
      count(filtered.id) FILTER (WHERE filtered.status <> 'cancelled') AS appointment_count
    FROM days LEFT JOIN filtered ON filtered.local_day = days.day
    GROUP BY days.day
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_rows.day,
    'production_realized', day_rows.production_realized,
    'scheduled_value', day_rows.scheduled_value,
    'occupied_minutes', day_rows.occupied_minutes,
    'available_minutes', day_rows.day_available_minutes,
    'occupancy_rate', CASE
      WHEN day_rows.day_available_minutes > 0
      THEN LEAST(round(day_rows.occupied_minutes * 100.0 / day_rows.day_available_minutes, 1), 100)
      ELSE 0 END,
    'completed_count', day_rows.completed_count,
    'cancelled_count', day_rows.cancelled_count,
    'appointment_count', day_rows.appointment_count
  ) ORDER BY day_rows.day), '[]'::jsonb)
  INTO daily_series
  FROM day_rows;

  SELECT COALESCE(jsonb_agg(to_jsonb(hour_report) ORDER BY hour_report.day_of_week, hour_report.hour), '[]'::jsonb)
  INTO hourly_demand
  FROM (
    SELECT extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS day_of_week,
      extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS hour,
      count(*) AS appointment_count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL AND appointment.status <> 'cancelled'
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    GROUP BY 1, 2
  ) hour_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(service_report) ORDER BY service_report.production_realized DESC, service_report.appointment_count DESC), '[]'::jsonb)
  INTO services
  FROM (
    SELECT service.id, service.name,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed') / NULLIF(count(appointment.id) FILTER (WHERE appointment.status = 'completed'), 0), 0) AS average_ticket,
      COALESCE(round(avg(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled')), 0) AS average_duration_minutes,
      COALESCE(round(count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') * 100.0
        / NULLIF(sum(count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled')) OVER (), 0), 1), 0) AS demand_share
    FROM public.services service
    LEFT JOIN public.appointments appointment ON appointment.service_id = service.id
      AND appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    WHERE service.establishment_id = target_establishment_id
      AND (target_service_id IS NULL OR service.id = target_service_id)
    GROUP BY service.id, service.name
  ) service_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(professional_report) ORDER BY professional_report.production_realized DESC, professional_report.name), '[]'::jsonb)
  INTO professionals
  FROM (
    SELECT profile.id, profile.name, membership.commission_rate,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * membership.commission_rate AS commission_amount,
      COALESCE(round(COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * 100.0
        / NULLIF(sum(COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0)) OVER (), 0), 1), 0) AS production_share,
      public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id) AS available_minutes,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) AS occupied_minutes,
      CASE WHEN public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id) > 0
        THEN LEAST(round(COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) * 100.0
          / public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id), 1), 100)
        ELSE 0 END AS occupancy_rate
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id AND profile.deleted_at IS NULL
    LEFT JOIN public.appointments appointment ON appointment.professional_id = profile.id
      AND appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active' AND membership.role IN ('professional', 'admin')
      AND (target_professional_id IS NULL OR profile.id = target_professional_id)
    GROUP BY profile.id, profile.name, membership.commission_rate
  ) professional_report;

  SELECT jsonb_build_object(
    'total', COALESCE(sum(count), 0),
    'by_reason', COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason), '[]'::jsonb),
    'by_role', '[]'::jsonb
  ) INTO cancellations
  FROM (
    SELECT COALESCE(NULLIF(trim(appointment.cancellation_reason), ''), 'Não informado') AS reason, count(*) AS count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.status = 'cancelled'
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    GROUP BY 1
  ) cancellation_report;

  WITH completed_clients AS (
    SELECT DISTINCT appointment.client_id
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.status = 'completed' AND appointment.client_id IS NOT NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  ), classified AS (
    SELECT client_id, EXISTS (
      SELECT 1 FROM public.appointments previous
      WHERE previous.establishment_id = target_establishment_id AND previous.deleted_at IS NULL
        AND previous.status = 'completed' AND previous.client_id = completed_clients.client_id
        AND previous.date_time < range_starts_at
    ) AS is_returning
    FROM completed_clients
  )
  SELECT jsonb_build_object(
    'identified_clients', count(*),
    'new_clients', count(*) FILTER (WHERE NOT is_returning),
    'returning_clients', count(*) FILTER (WHERE is_returning),
    'return_rate', COALESCE(round(count(*) FILTER (WHERE is_returning) * 100.0 / NULLIF(count(*), 0), 1), 0),
    'walk_in_appointments', (
      SELECT count(*) FROM public.appointments walk_in
      WHERE walk_in.establishment_id = target_establishment_id AND walk_in.deleted_at IS NULL
        AND walk_in.status = 'completed' AND walk_in.client_id IS NULL
        AND walk_in.date_time >= range_starts_at AND walk_in.date_time < range_ends_at
        AND (target_professional_id IS NULL OR walk_in.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR walk_in.service_id = target_service_id)
        AND (target_status IS NULL OR walk_in.status = target_status)
    )
  ) INTO clients FROM classified;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', target_range_start, 'end', target_range_end, 'days', day_count,
      'previous_start', previous_range_start, 'previous_end', previous_range_end, 'timezone', target_timezone),
    'summary', summary, 'previous_summary', previous_summary, 'daily_series', daily_series,
    'hourly_demand', hourly_demand, 'services', services, 'professionals', professionals,
    'cancellations', cancellations, 'clients', clients, 'generated_at', now()
  );
END;
$$;


ALTER FUNCTION "public"."get_admin_report_v2"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_appointment_participant_names"("target_appointment_ids" "text"[]) RETURNS TABLE("appointment_id" "text", "client_name" "text", "professional_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT appointment.id,
    COALESCE(NULLIF(appointment.client_name, ''), client_profile.name, 'Cliente'),
    professional_profile.name
  FROM public.appointments appointment
  LEFT JOIN public.profiles client_profile ON client_profile.id = appointment.client_id
  JOIN public.profiles professional_profile ON professional_profile.id = appointment.professional_id
  WHERE appointment.id = ANY(COALESCE(target_appointment_ids, ARRAY[]::text[]))
    AND (
      public.is_superadmin()
      OR appointment.client_id = (SELECT auth.uid())
      OR appointment.professional_id = (SELECT auth.uid())
      OR public.has_active_membership(appointment.establishment_id, ARRAY['admin'])
    );
$$;


ALTER FUNCTION "public"."get_appointment_participant_names"("target_appointment_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "target_appointment_id" "text" DEFAULT NULL::"text") RETURNS TABLE("starts_at" timestamp with time zone, "local_time" "text", "duration_minutes" integer, "available" boolean, "unavailable_reason" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF target_appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.id = target_appointment_id
      AND appointment.deleted_at IS NULL
      AND appointment.establishment_id = target_establishment_id
      AND (
        appointment.client_id = (SELECT auth.uid())
        OR public.is_superadmin()
        OR public.has_active_membership(appointment.establishment_id, ARRAY['admin'])
        OR (
          appointment.professional_id = (SELECT auth.uid())
          AND public.has_active_membership(appointment.establishment_id, ARRAY['professional', 'admin'])
        )
      )
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT slot.starts_at, slot.local_time, slot.duration_minutes, slot.available, slot.unavailable_reason
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_local_date,
    target_appointment_id
  ) slot
  ORDER BY slot.starts_at NULLS FIRST;
END;
$$;


ALTER FUNCTION "public"."get_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "target_appointment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_account_deletion_request"() RETURNS TABLE("id" "uuid", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "processing_started_at" timestamp with time zone, "executed_at" timestamp with time zone, "decision_reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."get_client_account_deletion_request"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_appointment"("target_appointment_id" "text") RETURNS TABLE("appointment_id" "text", "appointment_status" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "duration_minutes" integer, "reschedule_count" integer, "original_starts_at" timestamp with time zone, "cancellation_reason" "text", "cancelled_by_role" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "establishment_id" "uuid", "establishment_name" "text", "establishment_slug" "text", "establishment_address" "text", "establishment_phone" "text", "establishment_timezone" "text", "establishment_currency" "text", "min_cancellation_hours" integer, "instant_booking_enabled" boolean, "service_id" "text", "service_name" "text", "professional_id" "uuid", "professional_name" "text", "professional_avatar_url" "text", "cancellation_deadline" timestamp with time zone, "can_cancel" boolean, "can_reschedule" boolean, "cancel_block_reason" "text", "reschedule_block_reason" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT appointment.*
  FROM public.get_client_appointments() AS appointment
  WHERE appointment.appointment_id = target_appointment_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_client_appointment"("target_appointment_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_appointments"() RETURNS TABLE("appointment_id" "text", "appointment_status" "text", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "duration_minutes" integer, "reschedule_count" integer, "original_starts_at" timestamp with time zone, "cancellation_reason" "text", "cancelled_by_role" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "establishment_id" "uuid", "establishment_name" "text", "establishment_slug" "text", "establishment_address" "text", "establishment_phone" "text", "establishment_timezone" "text", "establishment_currency" "text", "min_cancellation_hours" integer, "instant_booking_enabled" boolean, "service_id" "text", "service_name" "text", "professional_id" "uuid", "professional_name" "text", "professional_avatar_url" "text", "cancellation_deadline" timestamp with time zone, "can_cancel" boolean, "can_reschedule" boolean, "cancel_block_reason" "text", "reschedule_block_reason" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    appointment.id::text,
    appointment.status,
    appointment.date_time,
    appointment.ends_at,
    appointment.duration_minutes,
    appointment.reschedule_count,
    appointment.original_date_time,
    appointment.cancellation_reason,
    appointment.cancelled_by_role,
    appointment.created_at,
    appointment.updated_at,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.address,
    establishment.phone,
    establishment.timezone,
    establishment.currency,
    policy.min_hours,
    establishment.instant_booking_enabled,
    appointment.service_id,
    COALESCE(service.name, 'Serviço indisponível'),
    appointment.professional_id,
    COALESCE(professional.name, 'Profissional indisponível'),
    professional.avatar_url,
    appointment.date_time - make_interval(hours => policy.min_hours),
    appointment.status IN ('pending', 'confirmed')
      AND appointment.date_time > now()
      AND now() <= appointment.date_time - make_interval(hours => policy.min_hours),
    appointment.status IN ('pending', 'confirmed')
      AND appointment.date_time > now()
      AND now() <= appointment.date_time - make_interval(hours => policy.min_hours)
      AND appointment.reschedule_count < 2
      AND establishment.account_status = 'active',
    CASE
      WHEN appointment.status NOT IN ('pending', 'confirmed') THEN 'appointment_status_immutable'
      WHEN appointment.date_time <= now() THEN 'appointment_already_started'
      WHEN now() > appointment.date_time - make_interval(hours => policy.min_hours) THEN 'cancellation_window_closed'
      ELSE NULL
    END,
    CASE
      WHEN appointment.status NOT IN ('pending', 'confirmed') THEN 'appointment_status_immutable'
      WHEN appointment.date_time <= now() THEN 'appointment_already_started'
      WHEN establishment.account_status IS DISTINCT FROM 'active' THEN 'establishment_unavailable'
      WHEN appointment.reschedule_count >= 2 THEN 'reschedule_limit_reached'
      WHEN now() > appointment.date_time - make_interval(hours => policy.min_hours) THEN 'cancellation_window_closed'
      ELSE NULL
    END
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment ON establishment.id = appointment.establishment_id
  LEFT JOIN public.services AS service ON service.id = appointment.service_id
  LEFT JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0 THEN 24
      ELSE establishment.min_cancellation_hours
    END::integer AS min_hours
  ) AS policy
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND appointment.client_id = (SELECT auth.uid())
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.date_time DESC;
$$;


ALTER FUNCTION "public"."get_client_appointments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_appointments_v2"() RETURNS TABLE("appointment_id" "text", "appointment_status" "text", "starts_at" timestamp with time zone, "reschedule_count" integer, "cancellation_reason_code" "text", "cancelled_by_role" "text", "establishment_id" "uuid", "establishment_name" "text", "establishment_slug" "text", "establishment_address" "text", "establishment_phone" "text", "establishment_timezone" "text", "establishment_currency" "text", "min_cancellation_hours" integer, "service_id" "text", "service_name" "text", "service_price" numeric, "service_duration_minutes" integer, "professional_id" "uuid", "professional_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    appointment.id::text,
    appointment.status,
    appointment.date_time,
    appointment.reschedule_count,
    COALESCE(
      appointment.cancellation_reason_code,
      CASE appointment.cancellation_reason
        WHEN 'Imprevisto de trabalho' THEN 'client_work_conflict'
        WHEN 'Questões de saúde' THEN 'client_health'
        WHEN 'Problema de transporte' THEN 'client_transport'
        WHEN 'Vou reagendar' THEN 'client_reschedule'
        WHEN 'Outro' THEN 'client_other'
        ELSE CASE WHEN appointment.cancelled_by_role = 'professional'
          THEN 'professional_cancelled' ELSE 'establishment_cancelled' END
      END
    ),
    appointment.cancelled_by_role,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.address,
    establishment.phone,
    establishment.timezone,
    establishment.currency,
    CASE WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0
      THEN 24 ELSE establishment.min_cancellation_hours END::integer,
    service.id,
    COALESCE(service.name, 'Serviço indisponível'),
    service.price,
    service.duration_minutes,
    appointment.professional_id,
    COALESCE(professional.name, 'Profissional indisponível')
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment ON establishment.id = appointment.establishment_id
  LEFT JOIN public.services AS service ON service.id = appointment.service_id
  LEFT JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND appointment.client_id = (SELECT auth.uid())
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.date_time DESC;
$$;


ALTER FUNCTION "public"."get_client_appointments_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_booking_options"("target_slug" "text") RETURNS TABLE("establishment_id" "uuid", "establishment_slug" "text", "establishment_name" "text", "establishment_address" "text", "establishment_timezone" "text", "establishment_currency" "text", "instant_booking_enabled" boolean, "services" "jsonb", "professionals" "jsonb", "professional_services" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_slug text := lower(btrim(COALESCE(target_slug, '')));
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_slug) NOT BETWEEN 1 AND 120
    OR normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR NOT public.is_safe_client_profile_text(normalized_slug)
  THEN
    RAISE EXCEPTION 'invalid_establishment_slug';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.address,
    establishment.timezone,
    establishment.currency,
    establishment.instant_booking_enabled,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(service_row) ORDER BY service_row.sort_order, service_row.name)
      FROM (
        SELECT service.id, service.name, service.price, service.duration_minutes, service.sort_order
        FROM public.services AS service
        WHERE service.establishment_id = establishment.id
          AND service.is_active
          AND service.deleted_at IS NULL
      ) AS service_row
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(professional_row) ORDER BY professional_row.name)
      FROM (
        SELECT
          profile.id,
          profile.name,
          profile.avatar_url,
          profile.titulo_profissional,
          profile.specialties
        FROM public.memberships AS membership
        JOIN public.profiles AS profile ON profile.id = membership.profile_id
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.role IN ('admin', 'professional')
          AND profile.deleted_at IS NULL
      ) AS professional_row
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(configuration_row))
      FROM (
        SELECT
          configuration.professional_id,
          configuration.service_id,
          configuration.price,
          configuration.duration_minutes,
          configuration.is_active
        FROM public.professional_services AS configuration
        WHERE configuration.establishment_id = establishment.id
          AND EXISTS (
            SELECT 1 FROM public.services AS service
            WHERE service.id = configuration.service_id
              AND service.establishment_id = establishment.id
              AND service.is_active
              AND service.deleted_at IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM public.memberships AS membership
            JOIN public.profiles AS profile ON profile.id = membership.profile_id
            WHERE membership.profile_id = configuration.professional_id
              AND membership.establishment_id = establishment.id
              AND membership.status = 'active'
              AND membership.role IN ('admin', 'professional')
              AND profile.deleted_at IS NULL
          )
      ) AS configuration_row
    ), '[]'::jsonb)
  FROM public.establishments AS establishment
  WHERE establishment.slug = normalized_slug
    AND establishment.account_status = 'active';
END;
$_$;


ALTER FUNCTION "public"."get_client_booking_options"("target_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_client_discovery_establishment"("target_slug" "text") RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "slogan" "text", "description" "text", "address" "text", "logo_url" "text", "banner_url" "text", "primary_color" "text", "timezone" "text", "currency" "text", "opening_hours" "text", "average_rating" numeric, "review_count" integer, "average_price" numeric, "price_level" integer, "instant_booking_enabled" boolean, "services" "jsonb", "professionals" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_slug text := lower(btrim(COALESCE(target_slug, '')));
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_slug) NOT BETWEEN 1 AND 120
    OR normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR NOT public.is_safe_client_profile_text(normalized_slug)
  THEN
    RAISE EXCEPTION 'invalid_establishment_slug';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.slogan,
    establishment.description,
    establishment.address,
    establishment.logo_url,
    establishment.banner_url,
    establishment.primary_color,
    establishment.timezone,
    establishment.currency,
    establishment.opening_hours,
    establishment.average_rating,
    establishment.review_count,
    establishment.average_price,
    establishment.price_level,
    establishment.instant_booking_enabled,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(service_row) ORDER BY service_row.sort_order, service_row.name)
      FROM (
        SELECT service.id, service.name, service.price, service.duration_minutes, service.sort_order
        FROM public.services AS service
        WHERE service.establishment_id = establishment.id
          AND service.is_active
          AND service.deleted_at IS NULL
      ) AS service_row
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(professional_row) ORDER BY professional_row.name)
      FROM (
        SELECT
          profile.id,
          profile.name,
          profile.avatar_url,
          profile.titulo_profissional,
          profile.specialties,
          CASE WHEN public_profile.is_public THEN public_profile.slug ELSE NULL END AS profile_slug
        FROM public.memberships AS membership
        JOIN public.profiles AS profile ON profile.id = membership.profile_id
        LEFT JOIN public.professional_profiles AS public_profile
          ON public_profile.id = membership.professional_profile_id
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.role IN ('admin', 'professional')
          AND profile.deleted_at IS NULL
      ) AS professional_row
    ), '[]'::jsonb)
  FROM public.establishments AS establishment
  WHERE establishment.slug = normalized_slug
    AND establishment.account_status = 'active';
END;
$_$;


ALTER FUNCTION "public"."get_client_discovery_establishment"("target_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_establishment_client_contacts"("target_establishment_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "phone" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."get_establishment_client_contacts"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_establishment_team"("target_establishment_id" "uuid", "include_administrators" boolean DEFAULT true) RETURNS TABLE("id" "uuid", "establishment_id" "uuid", "name" "text", "role" "text", "email" "text", "phone" "text", "avatar_url" "text", "commission_rate" numeric, "work_hours" "text", "specialties" "text", "instagram" "text", "titulo_profissional" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin', 'professional']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, m.establishment_id, p.name, m.role, p.email, p.phone, p.avatar_url,
    m.commission_rate, p.work_hours, p.specialties, p.instagram, p.titulo_profissional
  FROM public.memberships m JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.establishment_id = target_establishment_id AND m.status = 'active'
    AND (include_administrators OR m.role = 'professional') AND p.deleted_at IS NULL
  ORDER BY p.name;
END;
$$;


ALTER FUNCTION "public"."get_establishment_team"("target_establishment_id" "uuid", "include_administrators" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_governance_establishment_detail"("target_establishment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', establishment.id, 'name', establishment.name, 'slug', establishment.slug,
      'address', establishment.address,
      'document_number', COALESCE(
        CASE entity.document_type WHEN 'CPF' THEN '***.***.***-' || entity.document_last4
          WHEN 'CNPJ' THEN '**.***.***/****-' || entity.document_last4 END,
        CASE establishment.document_type WHEN 'CPF' THEN '***.***.***-' || right(regexp_replace(establishment.document_number, '[^0-9]', '', 'g'), 4)
          WHEN 'CNPJ' THEN '**.***.***/****-' || right(upper(regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g')), 4) END
      ),
      'document_type', COALESCE(entity.document_type, establishment.document_type),
      'verification_status', entity.verification_status,
      'verification_level', establishment.verification_level,
      'account_status', establishment.account_status, 'kyc_status', establishment.kyc_status,
      'email_verified', establishment.email_verified,
      'whatsapp_verified', false, 'created_at', establishment.created_at,
      'updated_at', establishment.updated_at
    ),
    'status_history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', audit.id, 'action', audit.action, 'changes', audit.changes,
        'created_at', audit.created_at, 'actor_name', COALESCE(profile.name, 'Sistema')
      ) ORDER BY audit.created_at DESC)
      FROM public.security_audit_logs audit
      LEFT JOIN public.profiles profile ON profile.id = audit.actor_id
      WHERE audit.target_id = establishment.id AND audit.target_type = 'establishment'
        AND audit.action = 'establishment.status_changed'
    ), '[]'::jsonb),
    'recent_events', COALESCE((
      SELECT jsonb_agg(event) FROM (
        SELECT jsonb_build_object(
          'id', audit.id, 'action', audit.action, 'changes', audit.changes,
          'created_at', audit.created_at, 'actor_name', COALESCE(profile.name, 'Sistema')
        ) AS event
        FROM public.security_audit_logs audit
        LEFT JOIN public.profiles profile ON profile.id = audit.actor_id
        WHERE audit.target_id = establishment.id AND audit.target_type = 'establishment'
        ORDER BY audit.created_at DESC LIMIT 20
      ) recent
    ), '[]'::jsonb),
    'upcoming_appointments', COALESCE((
      SELECT jsonb_agg(appointment_payload ORDER BY appointment_payload->>'date_time') FROM (
        SELECT jsonb_build_object(
          'id', appointment.id, 'date_time', appointment.date_time, 'ends_at', appointment.ends_at,
          'status', appointment.status, 'client_name', appointment.client_name
        ) appointment_payload
        FROM public.appointments appointment
        WHERE appointment.establishment_id = establishment.id
          AND appointment.date_time >= now() AND appointment.deleted_at IS NULL
          AND appointment.status NOT IN ('cancelled', 'canceled')
        ORDER BY appointment.date_time LIMIT 5
      ) upcoming
    ), '[]'::jsonb)
  ) INTO result
  FROM public.establishments establishment
  LEFT JOIN public.organization_establishments organization_establishment
    ON organization_establishment.establishment_id = establishment.id
    AND organization_establishment.status = 'active'
  LEFT JOIN public.organization_legal_entities organization_entity
    ON organization_entity.organization_id = organization_establishment.organization_id
    AND organization_entity.status = 'active'
  LEFT JOIN public.legal_entities entity ON entity.id = organization_entity.legal_entity_id
  WHERE establishment.id = target_establishment_id;
  IF result IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_governance_establishment_detail"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_governance_kb_topic"("target_topic_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  can_edit boolean;
  topic_payload jsonb;
BEGIN
  IF NOT public.is_governance_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  can_edit := public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]);

  SELECT jsonb_build_object(
    'id', topic.id,
    'slug', topic.slug,
    'title', topic.title,
    'body_markdown', topic.body_markdown,
    'kind', topic.kind,
    'tags', topic.tags,
    'publication_status', topic.publication_status,
    'resolution_status', topic.resolution_status,
    'accepted_reply_id', topic.accepted_reply_id,
    'is_official', topic.is_official,
    'is_pinned', topic.is_pinned,
    'reviewed_at', topic.reviewed_at,
    'version', topic.version,
    'created_at', topic.created_at,
    'updated_at', topic.updated_at,
    'author_id', topic.author_id,
    'author_name', coalesce(profile.name, 'Equipe CutSync'),
    'category', jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug)
  ) INTO topic_payload
  FROM public.governance_kb_topics topic
  JOIN public.governance_kb_categories category ON category.id = topic.category_id
  LEFT JOIN public.profiles profile ON profile.id = topic.author_id
  WHERE topic.id = target_topic_id
    AND (can_edit OR topic.publication_status = 'published');

  IF topic_payload IS NULL THEN
    RAISE EXCEPTION 'topic_not_found';
  END IF;

  RETURN jsonb_build_object(
    'topic', topic_payload,
    'replies', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', reply.id,
        'topic_id', reply.topic_id,
        'body_markdown', reply.body_markdown,
        'author_id', reply.author_id,
        'author_name', coalesce(profile.name, 'Membro da Governança'),
        'status', reply.status,
        'version', reply.version,
        'created_at', reply.created_at,
        'updated_at', reply.updated_at
      ) ORDER BY reply.created_at)
      FROM public.governance_kb_replies reply
      LEFT JOIN public.profiles profile ON profile.id = reply.author_id
      WHERE reply.topic_id = target_topic_id
        AND (can_edit OR reply.status = 'published')
    ), '[]'::jsonb),
    'attachments', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', attachment.id,
        'topic_id', attachment.topic_id,
        'reply_id', attachment.reply_id,
        'storage_path', attachment.storage_path,
        'original_name', attachment.original_name,
        'mime_type', attachment.mime_type,
        'size_bytes', attachment.size_bytes,
        'width', attachment.width,
        'height', attachment.height,
        'alt_text', attachment.alt_text,
        'upload_status', attachment.upload_status,
        'created_at', attachment.created_at
      ) ORDER BY attachment.created_at)
      FROM public.governance_kb_attachments attachment
      WHERE attachment.topic_id = target_topic_id
        AND attachment.upload_status = 'ready'
        AND (
          attachment.reply_id IS NULL
          OR can_edit
          OR EXISTS (
            SELECT 1 FROM public.governance_kb_replies visible_reply
            WHERE visible_reply.id = attachment.reply_id AND visible_reply.status = 'published'
          )
        )
    ), '[]'::jsonb),
    'revisions', CASE WHEN can_edit THEN coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', revision.id,
        'entity_type', revision.entity_type,
        'entity_id', revision.entity_id,
        'revision_number', revision.revision_number,
        'snapshot', revision.snapshot,
        'changed_by', revision.changed_by,
        'changed_by_name', coalesce(profile.name, 'Equipe CutSync'),
        'change_summary', revision.change_summary,
        'created_at', revision.created_at
      ) ORDER BY revision.created_at DESC)
      FROM public.governance_kb_revisions revision
      LEFT JOIN public.profiles profile ON profile.id = revision.changed_by
      WHERE (revision.entity_type = 'topic' AND revision.entity_id = target_topic_id)
        OR (revision.entity_type = 'reply' AND revision.entity_id IN (
          SELECT id FROM public.governance_kb_replies WHERE topic_id = target_topic_id
        ))
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  );
END;
$$;


ALTER FUNCTION "public"."get_governance_kb_topic"("target_topic_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_client_profile"() RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "phone" "text", "avatar_url" "text", "notification_channels" "text"[], "lgpd_marketing_accepted" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    profile.id,
    profile.name,
    profile.email,
    profile.phone,
    profile.avatar_url,
    COALESCE(profile.notification_channels, ARRAY[]::text[]),
    COALESCE(profile.lgpd_marketing_accepted, false)
  FROM public.profiles AS profile
  WHERE profile.id = (SELECT auth.uid())
    AND profile.deleted_at IS NULL;
$$;


ALTER FUNCTION "public"."get_my_client_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_legal_entity_context"() RETURNS TABLE("legal_entity_id" "uuid", "entity_type" "text", "document_type" "text", "masked_document" "text", "verification_status" "text", "organization_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT entity.id, entity.entity_type, entity.document_type,
    CASE entity.document_type
      WHEN 'CPF' THEN '***.***.***-' || entity.document_last4
      ELSE '**.***.***/****-' || entity.document_last4
    END,
    entity.verification_status, organization_link.organization_id
  FROM public.profile_legal_entities profile_link
  JOIN public.legal_entities entity ON entity.id = profile_link.legal_entity_id
  LEFT JOIN public.organization_legal_entities organization_link
    ON organization_link.legal_entity_id = entity.id AND organization_link.status = 'active'
  WHERE profile_link.profile_id = (SELECT auth.uid())
    AND profile_link.status = 'active';
$$;


ALTER FUNCTION "public"."get_my_legal_entity_context"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_operational_contexts"() RETURNS TABLE("membership_id" "uuid", "establishment_id" "uuid", "establishment_name" "text", "establishment_slug" "text", "membership_role" "text", "membership_status" "text", "commission_rate" numeric, "establishment_status" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."get_my_operational_contexts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_organizations"() RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "organization_status" "text", "member_role" "text", "establishment_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT organization.id, organization.name, organization.status, member.role,
    count(link.id) FILTER (WHERE link.status = 'active' AND link.effective_until IS NULL)
  FROM public.organization_members member
  JOIN public.organizations organization ON organization.id = member.organization_id
  LEFT JOIN public.organization_establishments link ON link.organization_id = organization.id
  WHERE member.profile_id = (SELECT auth.uid())
    AND member.status = 'active' AND member.revoked_at IS NULL
  GROUP BY organization.id, organization.name, organization.status, member.role
  ORDER BY organization.name;
$$;


ALTER FUNCTION "public"."get_my_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_professional_profile"() RETURNS TABLE("id" "uuid", "slug" "text", "bio" "text", "portfolio_url" "text", "instagram_url" "text", "gallery_urls" "jsonb", "is_public" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT public_profile.id, public_profile.slug, public_profile.bio,
    public_profile.portfolio_url, public_profile.instagram_url,
    public_profile.gallery_urls, public_profile.is_public,
    public_profile.created_at, public_profile.updated_at
  FROM public.professional_profiles public_profile
  WHERE public_profile.user_id = (SELECT auth.uid());
$$;


ALTER FUNCTION "public"."get_my_professional_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_profile"() RETURNS TABLE("id" "uuid", "establishment_id" "uuid", "name" "text", "role" "text", "email" "text", "phone" "text", "avatar_url" "text", "commission_rate" numeric, "push_token" "text", "work_hours" "text", "specialties" "text", "instagram" "text", "titulo_profissional" "text", "deleted_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."get_my_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_context"("target_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_organization_role(target_organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'organization', jsonb_build_object('id', organization.id, 'name', organization.name, 'status', organization.status),
    'role', member.role,
    'establishments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', establishment.id, 'name', establishment.name, 'slug', establishment.slug,
        'timezone', establishment.timezone, 'currency', establishment.currency,
        'account_status', establishment.account_status
      ) ORDER BY establishment.name)
      FROM public.organization_establishments link
      JOIN public.establishments establishment ON establishment.id = link.establishment_id
      WHERE link.organization_id = organization.id
        AND link.status = 'active' AND link.effective_until IS NULL
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profile_id', profile.id, 'name', profile.name, 'role', organization_member.role,
        'status', organization_member.status
      ) ORDER BY profile.name)
      FROM public.organization_members organization_member
      JOIN public.profiles profile ON profile.id = organization_member.profile_id
      WHERE organization_member.organization_id = organization.id
        AND organization_member.status = 'active'
    ), '[]'::jsonb)
  ) INTO result
  FROM public.organizations organization
  JOIN public.organization_members member
    ON member.organization_id = organization.id
   AND member.profile_id = (SELECT auth.uid())
   AND member.status = 'active'
  WHERE organization.id = target_organization_id;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_organization_context"("target_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_organization_report"("target_organization_id" "uuid", "range_start" "date", "range_end" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE result jsonb;
BEGIN
  IF range_end < range_start OR range_end - range_start > 366 THEN RAISE EXCEPTION 'invalid_report_range'; END IF;
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner', 'manager', 'finance']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH units AS (
    SELECT establishment.id, establishment.name, establishment.timezone, establishment.currency
    FROM public.organization_establishments link
    JOIN public.establishments establishment ON establishment.id = link.establishment_id
    WHERE link.organization_id = target_organization_id
      AND link.status = 'active' AND link.effective_until IS NULL
  ), unit_metrics AS (
    SELECT unit.id, unit.name, unit.timezone, unit.currency,
      count(appointment.id) AS appointment_count,
      count(*) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed')) AS scheduled_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status IN ('pending', 'confirmed', 'completed')), 0) AS occupied_minutes,
      public.admin_report_available_minutes(unit.id, range_start, range_end, NULL) AS available_minutes,
      count(DISTINCT appointment.client_id) FILTER (WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed') AS identified_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS new_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS returning_clients
    FROM units unit
    LEFT JOIN public.appointments appointment
      ON appointment.establishment_id = unit.id
     AND appointment.deleted_at IS NULL
     AND (appointment.date_time AT TIME ZONE unit.timezone)::date BETWEEN range_start AND range_end
    LEFT JOIN public.services service ON service.id = appointment.service_id
    GROUP BY unit.id, unit.name, unit.timezone, unit.currency
  )
  SELECT jsonb_build_object(
    'organization_id', target_organization_id,
    'range_start', range_start,
    'range_end', range_end,
    'appointment_count', COALESCE(sum(appointment_count), 0),
    'completed_count', COALESCE(sum(completed_count), 0),
    'cancelled_count', COALESCE(sum(cancelled_count), 0),
    'scheduled_count', COALESCE(sum(scheduled_count), 0),
    'production_realized', COALESCE(sum(production_realized), 0),
    'scheduled_value', COALESCE(sum(scheduled_value), 0),
    'average_ticket', CASE WHEN sum(completed_count) > 0
      THEN round(sum(production_realized) / sum(completed_count), 2) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(occupied_minutes), 0),
    'available_minutes', COALESCE(sum(available_minutes), 0),
    'occupancy_rate', CASE WHEN sum(available_minutes) > 0
      THEN round(LEAST(sum(occupied_minutes) * 100.0 / sum(available_minutes), 100), 1) ELSE 0 END,
    'identified_clients', COALESCE(sum(identified_clients), 0),
    'new_clients', COALESCE(sum(new_clients), 0),
    'returning_clients', COALESCE(sum(returning_clients), 0),
    'units', COALESCE(jsonb_agg(to_jsonb(unit_metrics) ORDER BY name), '[]'::jsonb)
  ) INTO result
  FROM unit_metrics;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_organization_report"("target_organization_id" "uuid", "range_start" "date", "range_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_busy_slots"("target_professional_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone) RETURNS TABLE("date_time" timestamp with time zone, "duration_minutes" integer)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF range_end <= range_start OR range_end > range_start + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_availability_range';
  END IF;

  RETURN QUERY
  SELECT appointment.date_time, appointment.duration_minutes
  FROM public.appointments appointment
  WHERE appointment.professional_id = target_professional_id
    AND appointment.status IN ('pending', 'confirmed')
    AND appointment.deleted_at IS NULL
    AND appointment.date_time < range_end
    AND appointment.ends_at > range_start
  ORDER BY appointment.date_time;
END;
$$;


ALTER FUNCTION "public"."get_public_busy_slots"("target_professional_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_professional_profile"("profile_slug" "text") RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "avatar_url" "text", "titulo_profissional" "text", "specialties" "text", "bio" "text", "portfolio_url" "text", "instagram_url" "text", "gallery_urls" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."get_public_professional_profile"("profile_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_team"("target_establishment_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "avatar_url" "text", "titulo_profissional" "text", "specialties" "text", "professional_profile_slug" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."get_public_team"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_schedule_blocks"("target_establishment_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone, "target_professional_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "establishment_id" "uuid", "professional_id" "uuid", "starts_at" timestamp with time zone, "ends_at" timestamp with time zone, "kind" "text", "reason" "text", "created_by" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional boolean;
  can_view_team boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF range_end <= range_start OR range_end > range_start + interval '31 days' THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_professional := public.has_active_membership(
    target_establishment_id,
    ARRAY['professional', 'admin']
  );
  SELECT establishment.share_agendas INTO can_view_team
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF NOT actor_is_admin AND NOT actor_is_professional THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT actor_is_admin
    AND (target_professional_id IS NULL OR target_professional_id <> actor_id)
    AND NOT COALESCE(can_view_team, false)
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT block.id, block.establishment_id, block.professional_id,
    block.starts_at, block.ends_at, block.kind, block.reason,
    block.created_by, block.created_at, block.updated_at
  FROM public.schedule_blocks block
  WHERE block.establishment_id = target_establishment_id
    AND block.deleted_at IS NULL
    AND (target_professional_id IS NULL OR block.professional_id = target_professional_id)
    AND block.starts_at < range_end
    AND block.ends_at > range_start
  ORDER BY block.starts_at, block.professional_id;
END;
$$;


ALTER FUNCTION "public"."get_schedule_blocks"("target_establishment_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone, "target_professional_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_subscription_entitlement_for_establishment"("target_establishment_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE entitlement jsonb;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_establishments link
       WHERE link.establishment_id = target_establishment_id
         AND link.status = 'active' AND link.effective_until IS NULL
         AND public.has_organization_role(link.organization_id, ARRAY['owner', 'finance'])
     )
     AND NOT public.is_governance_user()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'status', subscription.status,
    'grace_ends_at', subscription.grace_ends_at,
    'enforcement_enabled', subscription.enforcement_enabled,
    'can_create_bookings', NOT subscription.enforcement_enabled OR subscription.status IN ('trialing', 'active', 'past_due'),
    'can_mutate_administration', NOT subscription.enforcement_enabled OR subscription.status IN ('trialing', 'active', 'past_due'),
    'can_read_and_export', true,
    'can_manage_existing_appointments', true
  ) INTO entitlement
  FROM public.subscription_units unit
  JOIN public.organization_subscriptions subscription ON subscription.id = unit.subscription_id
  WHERE unit.establishment_id = target_establishment_id
    AND unit.effective_until IS NULL
  ORDER BY unit.effective_from DESC
  LIMIT 1;
  RETURN COALESCE(entitlement, jsonb_build_object(
    'status', 'trialing', 'grace_ends_at', NULL, 'enforcement_enabled', false,
    'can_create_bookings', true, 'can_mutate_administration', true,
    'can_read_and_export', true, 'can_manage_existing_appointments', true
  ));
END;
$$;


ALTER FUNCTION "public"."get_subscription_entitlement_for_establishment"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."governance_kb_audit_reply_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'knowledge.reply_created',
    NEW.id,
    'governance_kb_reply',
    jsonb_build_object('topic_id', NEW.topic_id, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."governance_kb_audit_reply_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."governance_kb_audit_topic_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'knowledge.topic_created',
    NEW.id,
    'governance_kb_topic',
    jsonb_build_object('title', NEW.title, 'publication_status', NEW.publication_status)
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."governance_kb_audit_topic_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."governance_kb_guard_reply_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  content_changed boolean;
BEGIN
  IF NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.topic_id IS DISTINCT FROM OLD.topic_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'immutable_reply_fields';
  END IF;

  IF NEW.status = 'removed'
    AND OLD.status <> 'removed'
    AND NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[])
  THEN
    RAISE EXCEPTION 'owner_permission_required';
  END IF;

  content_changed := NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.status IS DISTINCT FROM OLD.status;

  IF content_changed THEN
    IF OLD.status = 'published'
      AND char_length(btrim(coalesce(NEW.last_change_summary, ''))) < 3
    THEN
      RAISE EXCEPTION 'change_summary_required';
    END IF;

    INSERT INTO public.governance_kb_revisions (
      entity_type,
      entity_id,
      revision_number,
      snapshot,
      changed_by,
      change_summary
    ) VALUES (
      'reply',
      OLD.id,
      OLD.version,
      jsonb_build_object('body_markdown', OLD.body_markdown, 'status', OLD.status),
      (SELECT auth.uid()),
      coalesce(nullif(btrim(NEW.last_change_summary), ''), 'Atualização de rascunho')
    );
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := OLD.version;
  END IF;

  IF NEW.status = 'published' AND OLD.status <> 'published' THEN
    NEW.published_at := timezone('utc', now());
    NEW.removed_at := NULL;
  ELSIF NEW.status = 'removed' AND OLD.status <> 'removed' THEN
    NEW.removed_at := timezone('utc', now());
  END IF;
  NEW.updated_at := timezone('utc', now());

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'knowledge.reply_updated',
    NEW.id,
    'governance_kb_reply',
    jsonb_build_object('topic_id', NEW.topic_id, 'version', NEW.version, 'status', NEW.status)
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."governance_kb_guard_reply_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."governance_kb_guard_topic_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  content_changed boolean;
  owner_request boolean;
BEGIN
  owner_request := public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]);

  IF NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'immutable_topic_fields';
  END IF;

  IF NOT owner_request AND (
    NEW.is_official IS DISTINCT FROM OLD.is_official
    OR NEW.is_pinned IS DISTINCT FROM OLD.is_pinned
    OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
    OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
    OR NEW.publication_status = 'archived' AND OLD.publication_status <> 'archived'
  ) THEN
    RAISE EXCEPTION 'owner_permission_required';
  END IF;

  content_changed :=
    NEW.slug IS DISTINCT FROM OLD.slug
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.body_markdown IS DISTINCT FROM OLD.body_markdown
    OR NEW.category_id IS DISTINCT FROM OLD.category_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.tags IS DISTINCT FROM OLD.tags
    OR NEW.publication_status IS DISTINCT FROM OLD.publication_status
    OR NEW.resolution_status IS DISTINCT FROM OLD.resolution_status
    OR NEW.accepted_reply_id IS DISTINCT FROM OLD.accepted_reply_id;

  IF NEW.accepted_reply_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.governance_kb_replies reply
    WHERE reply.id = NEW.accepted_reply_id
      AND reply.topic_id = NEW.id
      AND reply.status = 'published'
  ) THEN
    RAISE EXCEPTION 'invalid_solution';
  END IF;

  IF content_changed THEN
    IF OLD.publication_status = 'published'
      AND char_length(btrim(coalesce(NEW.last_change_summary, ''))) < 3
    THEN
      RAISE EXCEPTION 'change_summary_required';
    END IF;

    INSERT INTO public.governance_kb_revisions (
      entity_type,
      entity_id,
      revision_number,
      snapshot,
      changed_by,
      change_summary
    ) VALUES (
      'topic',
      OLD.id,
      OLD.version,
      jsonb_build_object(
        'slug', OLD.slug,
        'title', OLD.title,
        'body_markdown', OLD.body_markdown,
        'category_id', OLD.category_id,
        'kind', OLD.kind,
        'tags', OLD.tags,
        'publication_status', OLD.publication_status,
        'resolution_status', OLD.resolution_status,
        'accepted_reply_id', OLD.accepted_reply_id
      ),
      (SELECT auth.uid()),
      coalesce(nullif(btrim(NEW.last_change_summary), ''), 'Atualização de rascunho')
    );

    NEW.version := OLD.version + 1;
    NEW.is_official := false;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
  ELSE
    NEW.version := OLD.version;
  END IF;

  IF NEW.publication_status = 'published' AND OLD.publication_status <> 'published' THEN
    NEW.published_at := timezone('utc', now());
    NEW.archived_at := NULL;
  ELSIF NEW.publication_status = 'archived' AND OLD.publication_status <> 'archived' THEN
    NEW.archived_at := timezone('utc', now());
  END IF;

  NEW.updated_at := timezone('utc', now());

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    CASE WHEN content_changed THEN 'knowledge.topic_updated' ELSE 'knowledge.topic_moderated' END,
    NEW.id,
    'governance_kb_topic',
    jsonb_build_object(
      'title', NEW.title,
      'version', NEW.version,
      'publication_status', NEW.publication_status,
      'is_official', NEW.is_official,
      'is_pinned', NEW.is_pinned
    )
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."governance_kb_guard_topic_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."governance_kb_touch_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."governance_kb_touch_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."governance_kb_validate_attachment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  reply_topic_id uuid;
BEGIN
  IF NEW.reply_id IS NOT NULL THEN
    SELECT topic_id INTO reply_topic_id
      FROM public.governance_kb_replies
      WHERE id = NEW.reply_id;
    IF reply_topic_id IS NULL OR reply_topic_id <> NEW.topic_id THEN
      RAISE EXCEPTION 'attachment_reply_topic_mismatch';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.topic_id IS DISTINCT FROM OLD.topic_id
      OR NEW.reply_id IS DISTINCT FROM OLD.reply_id
      OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
      OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
      OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
      OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by
    THEN
      RAISE EXCEPTION 'attachment_identity_is_immutable';
    END IF;
    NEW.updated_at := timezone('utc', now());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."governance_kb_validate_attachment"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."governance_users" (
    "profile_id" "uuid" NOT NULL,
    "role" "public"."governance_role_enum" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."governance_users" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."grant_governance_role"("target_profile_id" "uuid", "target_role" "public"."governance_role_enum", "reason" "text") RETURNS "public"."governance_users"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."grant_governance_role"("target_profile_id" "uuid", "target_role" "public"."governance_role_enum", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_governance_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND nullif(btrim(current_setting('cutsync.governance_status_reason', true)), '') IS NULL THEN
    RAISE EXCEPTION 'governance_status_change_requires_reason';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_governance_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_governance_user_direct_write"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."guard_governance_user_direct_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_legacy_establishment_document"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.document_number IS NOT NULL OR NEW.document_type IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (
      NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.document_type IS DISTINCT FROM OLD.document_type
    ))
  THEN RAISE EXCEPTION 'legacy_document_read_only'; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_legacy_establishment_document"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_legacy_kyc_url"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NEW.kyc_document_url IS NOT NULL THEN RAISE EXCEPTION 'public_kyc_document_url_forbidden'; END IF;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."guard_legacy_kyc_url"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_sensitive_authenticated_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  -- Service jobs have no end-user auth.uid(); authenticated SECURITY DEFINER RPCs retain it.
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.current_session_is_aal2() THEN
    RAISE EXCEPTION 'aal2_required';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."guard_sensitive_authenticated_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, establishment_id, avatar_url, phone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), 'Usuário'),
    lower(NEW.email),
    'client',
    NULL,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_active_membership"("target_establishment_id" "uuid", "allowed_roles" "text"[] DEFAULT NULL::"text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.profile_id = (SELECT auth.uid())
      AND m.establishment_id = target_establishment_id
      AND m.status = 'active'
      AND (allowed_roles IS NULL OR m.role = ANY(allowed_roles))
  );
$$;


ALTER FUNCTION "public"."has_active_membership"("target_establishment_id" "uuid", "allowed_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_organization_role"("target_organization_id" "uuid", "allowed_roles" "text"[] DEFAULT NULL::"text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members member
    WHERE member.organization_id = target_organization_id
      AND member.profile_id = (SELECT auth.uid())
      AND member.status = 'active'
      AND member.revoked_at IS NULL
      AND (allowed_roles IS NULL OR member.role = ANY(allowed_roles))
  );
$$;


ALTER FUNCTION "public"."has_organization_role"("target_organization_id" "uuid", "allowed_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."immutable_array_to_string"("arr" "text"[], "sep" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT array_to_string(arr, sep);
$$;


ALTER FUNCTION "public"."immutable_array_to_string"("arr" "text"[], "sep" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspect_invitation"("invitation_token" "text") RETURNS TABLE("establishment_name" "text", "invited_email" "text", "invited_role" "text", "invitation_status" "text", "expiration" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."inspect_invitation"("invitation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inspect_invitation_v2"("invitation_token" "text") RETURNS TABLE("establishment_name" "text", "invited_contact" "text", "invited_role" "text", "invitation_status" "text", "expiration" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  current_email TEXT;
  current_phone TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_invitation_token'; END IF;

  SELECT lower(email), phone INTO current_email, current_phone FROM public.profiles WHERE id = (SELECT auth.uid());

  RETURN QUERY
  SELECT 
    e.name,
    i.target_contact,
    i.role,
    CASE 
      WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' 
      ELSE i.status::text 
    END,
    i.expires_at
  FROM public.establishment_invites i
  JOIN public.establishments e ON e.id = i.establishment_id
  WHERE i.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    AND (lower(i.target_contact) = current_email OR i.target_contact = current_phone);
END;
$_$;


ALTER FUNCTION "public"."inspect_invitation_v2"("invitation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_organization_member"("target_organization_id" "uuid", "invited_email" "text", "target_role" "text") RETURNS TABLE("invitation_id" "uuid", "invitation_token" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $_$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_email text := lower(btrim(invited_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  created_invitation public.organization_invitations%ROWTYPE;
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF target_role NOT IN ('manager', 'finance') THEN RAISE EXCEPTION 'invalid_organization_role'; END IF;

  UPDATE public.organization_invitations
  SET status = 'revoked'
  WHERE organization_id = target_organization_id
    AND lower(organization_invitations.invited_email) = normalized_email
    AND status = 'pending';

  INSERT INTO public.organization_invitations(
    organization_id, invited_email, role, token_hash, expires_at, created_by
  ) VALUES (
    target_organization_id, normalized_email, target_role,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    now() + interval '7 days', actor_id
  ) RETURNING * INTO created_invitation;

  INSERT INTO public.organization_audit_log(organization_id, actor_id, action, metadata)
  VALUES (target_organization_id, actor_id, 'organization.member_invited',
    jsonb_build_object('invitation_id', created_invitation.id, 'role', target_role));

  RETURN QUERY SELECT created_invitation.id, raw_token, created_invitation.expires_at;
END;
$_$;


ALTER FUNCTION "public"."invite_organization_member"("target_organization_id" "uuid", "invited_email" "text", "target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_establishment_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.role IN ('professional', 'admin')
      AND membership.status = 'active'
  );
$$;


ALTER FUNCTION "public"."is_active_establishment_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_establishment_service"("target_service_id" "text", "target_establishment_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.services service
    WHERE service.id = target_service_id
      AND service.establishment_id = target_establishment_id
      AND service.is_active = true
      AND service.deleted_at IS NULL
  );
$$;


ALTER FUNCTION "public"."is_active_establishment_service"("target_service_id" "text", "target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_establishment_active"("target_establishment_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.establishments
    WHERE id = target_establishment_id
      AND account_status IN ('active', 'pending_verification')
  );
$$;


ALTER FUNCTION "public"."is_establishment_active"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_governance_user"("allowed_roles" "public"."governance_role_enum"[] DEFAULT NULL::"public"."governance_role_enum"[]) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT public.current_session_is_aal2() AND EXISTS (
    SELECT 1 FROM public.governance_users
    WHERE profile_id = (SELECT auth.uid())
      AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
  );
$$;


ALTER FUNCTION "public"."is_governance_user"("allowed_roles" "public"."governance_role_enum"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_safe_client_profile_text"("target_value" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT target_value IS NOT NULL
    AND target_value !~ '[<>]'
    AND target_value !~* 'data[[:space:]]*:[[:space:]]*image[[:space:]]*/[[:space:]]*svg\+xml'
    AND target_value !~* '\mxmlns[[:space:]]*='
    AND target_value !~* '\msvg[[:space:]]*:'
    AND target_value !~ (
      '['
      || U&'\+01F1E6' || '-' || U&'\+01FAFF'
      || U&'\2600' || '-' || U&'\27BF'
      || U&'\200D' || U&'\FE0F' || U&'\20E3'
      || ']'
    );
$$;


ALTER FUNCTION "public"."is_safe_client_profile_text"("target_value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_safe_public_url"("value" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
  SELECT value IS NULL OR value = '' OR value ~* '^https://[^[:space:]]+$';
$_$;


ALTER FUNCTION "public"."is_safe_public_url"("value" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins s WHERE s.profile_id = (SELECT auth.uid())
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_valid_professional_gallery"("value" "jsonb") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
  SELECT CASE
    WHEN jsonb_typeof(value) <> 'array' THEN false
    ELSE jsonb_array_length(value) <= 20 AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(value) item
      WHERE jsonb_typeof(item) <> 'object'
        OR COALESCE(item->>'url', '') !~* '^https://[^[:space:]]+$'
        OR char_length(trim(COALESCE(item->>'alt', ''))) NOT BETWEEN 3 AND 160
        OR (item ? 'path' AND COALESCE(item->>'path', '') !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$')
    )
  END;
$_$;


ALTER FUNCTION "public"."is_valid_professional_gallery"("value" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_manual_billing_invoice"("target_subscription_id" "uuid", "target_due_date" "date") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  subscription_record record;
  unit_count integer;
  subtotal integer := 0;
  total integer := 0;
  unit_snapshot jsonb := '[]'::jsonb;
  invoice_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT subscription.*, plan.code, plan.name, plan.base_price_cents, plan.currency, plan.is_network
  INTO subscription_record
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_plans plan ON plan.id = subscription.plan_id
  WHERE subscription.id = target_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  IF subscription_record.base_price_cents IS NULL THEN RAISE EXCEPTION 'plan_price_required'; END IF;

  SELECT count(*) INTO unit_count
  FROM public.subscription_units unit
  WHERE unit.subscription_id = target_subscription_id
    AND unit.effective_from <= subscription_record.current_period_end
    AND (unit.effective_until IS NULL OR unit.effective_until >= subscription_record.current_period_start);
  IF unit_count >= 5 AND NOT subscription_record.is_network THEN RAISE EXCEPTION 'network_plan_required'; END IF;

  WITH ranked_units AS (
    SELECT unit.establishment_id, establishment.name,
      row_number() OVER (ORDER BY unit.effective_from, establishment.name, unit.establishment_id) AS position
    FROM public.subscription_units unit
    JOIN public.establishments establishment ON establishment.id = unit.establishment_id
    WHERE unit.subscription_id = target_subscription_id
      AND unit.effective_from <= subscription_record.current_period_end
      AND (unit.effective_until IS NULL OR unit.effective_until >= subscription_record.current_period_start)
  ), priced AS (
    SELECT ranked_units.*,
      COALESCE((
        SELECT tier.percentage_basis_points
        FROM public.plan_unit_tiers tier
        WHERE tier.plan_id = subscription_record.plan_id
          AND ranked_units.position >= tier.unit_from
          AND (tier.unit_to IS NULL OR ranked_units.position <= tier.unit_to)
        ORDER BY tier.unit_from DESC LIMIT 1
      ), 10000) AS percentage_basis_points
    FROM ranked_units
  )
  SELECT
    COALESCE(sum(subscription_record.base_price_cents), 0),
    COALESCE(sum(round(subscription_record.base_price_cents * percentage_basis_points / 10000.0)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'establishment_id', establishment_id, 'establishment_name', name, 'position', position,
      'base_price_cents', subscription_record.base_price_cents,
      'percentage_basis_points', percentage_basis_points,
      'charged_cents', round(subscription_record.base_price_cents * percentage_basis_points / 10000.0)
    ) ORDER BY position), '[]'::jsonb)
  INTO subtotal, total, unit_snapshot
  FROM priced;

  INSERT INTO public.organization_billing_invoices(
    subscription_id, period_start, period_end, due_date, status, currency,
    subtotal_cents, discount_cents, total_cents, unit_snapshot, plan_snapshot, issued_by
  ) VALUES (
    target_subscription_id, subscription_record.current_period_start,
    subscription_record.current_period_end, target_due_date, 'open', subscription_record.currency,
    subtotal, subtotal - total, total, unit_snapshot,
    jsonb_build_object(
      'plan_id', subscription_record.plan_id, 'code', subscription_record.code,
      'name', subscription_record.name, 'base_price_cents', subscription_record.base_price_cents
    ), actor_id
  ) RETURNING id INTO invoice_id;

  INSERT INTO public.organization_billing_events(
    billing_account_id, subscription_id, invoice_id, actor_id, event_type, metadata
  ) VALUES (
    subscription_record.billing_account_id, target_subscription_id, invoice_id, actor_id,
    'invoice.issued', jsonb_build_object('total_cents', total, 'unit_count', unit_count)
  );
  RETURN invoice_id;
END;
$$;


ALTER FUNCTION "public"."issue_manual_billing_invoice"("target_subscription_id" "uuid", "target_due_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_professional_profile_to_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."link_professional_profile_to_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_client_discovery_establishments"("target_query" "text" DEFAULT ''::"text", "result_limit" integer DEFAULT 30) RETURNS TABLE("id" "uuid", "slug" "text", "name" "text", "slogan" "text", "description" "text", "address" "text", "logo_url" "text", "banner_url" "text", "primary_color" "text", "timezone" "text", "currency" "text", "opening_hours" "text", "average_rating" numeric, "review_count" integer, "average_price" numeric, "price_level" integer, "instant_booking_enabled" boolean, "service_count" bigint, "professional_count" bigint, "service_names" "text"[], "professional_names" "text"[])
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_query text := regexp_replace(btrim(COALESCE(target_query, '')), '[[:space:]]+', ' ', 'g');
  normalized_limit integer := LEAST(GREATEST(COALESCE(result_limit, 30), 1), 50);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_query) > 80
    OR NOT public.is_safe_client_profile_text(normalized_query)
  THEN
    RAISE EXCEPTION 'invalid_discovery_query';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.slogan,
    establishment.description,
    establishment.address,
    establishment.logo_url,
    establishment.banner_url,
    establishment.primary_color,
    establishment.timezone,
    establishment.currency,
    establishment.opening_hours,
    establishment.average_rating,
    establishment.review_count,
    establishment.average_price,
    establishment.price_level,
    establishment.instant_booking_enabled,
    (SELECT count(*)
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL),
    (SELECT count(*)
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.role IN ('admin', 'professional')
        AND profile.deleted_at IS NULL),
    ARRAY(
      SELECT service.name
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
      ORDER BY service.sort_order, service.name
      LIMIT 3
    ),
    ARRAY(
      SELECT profile.name
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.role IN ('admin', 'professional')
        AND profile.deleted_at IS NULL
      ORDER BY profile.name
      LIMIT 3
    )
  FROM public.establishments AS establishment
  WHERE establishment.account_status = 'active'
    AND (
      normalized_query = ''
      OR establishment.name ILIKE '%' || normalized_query || '%'
      OR COALESCE(establishment.slogan, '') ILIKE '%' || normalized_query || '%'
      OR COALESCE(establishment.address, '') ILIKE '%' || normalized_query || '%'
      OR EXISTS (
        SELECT 1
        FROM public.services AS service
        WHERE service.establishment_id = establishment.id
          AND service.is_active
          AND service.deleted_at IS NULL
          AND service.name ILIKE '%' || normalized_query || '%'
      )
      OR EXISTS (
        SELECT 1
        FROM public.memberships AS membership
        JOIN public.profiles AS profile ON profile.id = membership.profile_id
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.role IN ('admin', 'professional')
          AND profile.deleted_at IS NULL
          AND (
            profile.name ILIKE '%' || normalized_query || '%'
            OR COALESCE(profile.specialties, '') ILIKE '%' || normalized_query || '%'
            OR COALESCE(profile.titulo_profissional, '') ILIKE '%' || normalized_query || '%'
          )
      )
    )
  ORDER BY
    CASE WHEN normalized_query <> '' AND establishment.name ILIKE normalized_query || '%' THEN 0 ELSE 1 END,
    establishment.average_rating DESC,
    establishment.name
  LIMIT normalized_limit;
END;
$$;


ALTER FUNCTION "public"."list_client_discovery_establishments"("target_query" "text", "result_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_control_billing_accounts"() RETURNS TABLE("billing_account_id" "uuid", "organization_id" "uuid", "organization_name" "text", "subscription_id" "uuid", "plan_code" "text", "subscription_status" "text", "enforcement_enabled" boolean, "active_units" bigint, "current_period_end" "date")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT account.id, organization.id, organization.name, subscription.id, plan.code,
    subscription.status, subscription.enforcement_enabled, count(unit.id) FILTER (
      WHERE unit.effective_from <= subscription.current_period_end
        AND (unit.effective_until IS NULL OR unit.effective_until >= subscription.current_period_start)
    ), subscription.current_period_end
  FROM public.organization_billing_accounts account
  JOIN public.organizations organization ON organization.id = account.organization_id
  LEFT JOIN public.organization_subscriptions subscription ON subscription.billing_account_id = account.id
  LEFT JOIN public.organization_billing_plans plan ON plan.id = subscription.plan_id
  LEFT JOIN public.subscription_units unit ON unit.subscription_id = subscription.id
  GROUP BY account.id, organization.id, organization.name, subscription.id, plan.code,
    subscription.status, subscription.enforcement_enabled, subscription.current_period_end
  ORDER BY organization.name;
END;
$$;


ALTER FUNCTION "public"."list_control_billing_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_establishment_invitations"("target_establishment_id" "uuid") RETURNS TABLE("id" "uuid", "invited_email" "text", "role" "text", "status" "text", "expires_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT i.id, i.invited_email, i.role,
    CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
    i.expires_at, i.created_at
  FROM public.invitations i WHERE i.establishment_id = target_establishment_id ORDER BY i.created_at DESC LIMIT 50;
END;
$$;


ALTER FUNCTION "public"."list_establishment_invitations"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_establishment_invites_v2"("target_establishment_id" "uuid") RETURNS TABLE("id" "uuid", "target_contact" "text", "role" "text", "status" "text", "created_at" timestamp with time zone, "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin()
     AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN
     RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.target_contact,
    i.role,
    CASE 
      WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' 
      ELSE i.status::text 
    END,
    i.created_at,
    i.expires_at
  FROM public.establishment_invites i
  WHERE i.establishment_id = target_establishment_id
  ORDER BY i.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."list_establishment_invites_v2"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_audit_events"("search_term" "text" DEFAULT NULL::"text", "action_filter" "text" DEFAULT NULL::"text", "date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "page_size" integer DEFAULT 40, "page_offset" integer DEFAULT 0) RETURNS TABLE("id" bigint, "action" "text", "target_id" "uuid", "target_type" "text", "changes" "jsonb", "client_ip" "text", "created_at" timestamp with time zone, "actor_name" "text", "target_name" "text", "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."list_governance_audit_events"("search_term" "text", "action_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone, "page_size" integer, "page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_establishment_requests"("search_term" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "page_size" integer DEFAULT 50, "page_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "requester_id" "uuid", "requester_name" "text", "requester_email" "text", "name" "text", "slug" "text", "address" "text", "phone" "text", "document_number" "text", "status" "text", "rejection_reason" "text", "establishment_id" "uuid", "created_at" timestamp with time zone, "reviewed_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT request.id, request.requester_id, request.requester_name,
    request.requester_email, request.name, request.slug, request.address, request.phone,
    CASE request.document_type
      WHEN 'CPF' THEN '***.***.***-' || right(regexp_replace(request.document_number, '[^0-9]', '', 'g'), 4)
      WHEN 'CNPJ' THEN '**.***.***/****-' || right(upper(regexp_replace(request.document_number, '[^A-Za-z0-9]', '', 'g')), 4)
    END,
    request.status, request.rejection_reason, request.establishment_id,
    request.created_at, request.reviewed_at, count(*) OVER ()
  FROM public.establishment_requests request
  WHERE (
    nullif(btrim(search_term), '') IS NULL
    OR request.name ILIKE '%' || btrim(search_term) || '%'
    OR request.slug ILIKE '%' || btrim(search_term) || '%'
    OR request.requester_name ILIKE '%' || btrim(search_term) || '%'
    OR request.requester_email ILIKE '%' || btrim(search_term) || '%'
  )
    AND (status_filter IS NULL OR request.status = status_filter)
  ORDER BY request.created_at DESC
  LIMIT least(greatest(coalesce(page_size, 50), 1), 100)
  OFFSET greatest(coalesce(page_offset, 0), 0);
END;
$$;


ALTER FUNCTION "public"."list_governance_establishment_requests"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_establishments"("search_term" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "page_size" integer DEFAULT 25, "page_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "document_number" "text", "document_type" "text", "verification_level" integer, "account_status" "text", "address" "text", "kyc_status" "text", "email_verified" boolean, "whatsapp_verified" boolean, "recent_status_changed_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT establishment.id, establishment.name, establishment.slug,
    COALESCE(
      CASE entity.document_type
        WHEN 'CPF' THEN '***.***.***-' || entity.document_last4
        WHEN 'CNPJ' THEN '**.***.***/****-' || entity.document_last4
      END,
      CASE establishment.document_type
        WHEN 'CPF' THEN '***.***.***-' || right(regexp_replace(establishment.document_number, '[^0-9]', '', 'g'), 4)
        WHEN 'CNPJ' THEN '**.***.***/****-' || right(upper(regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g')), 4)
      END
    ),
    COALESCE(entity.document_type, establishment.document_type),
    establishment.verification_level, establishment.account_status, establishment.address,
    establishment.kyc_status, establishment.email_verified, establishment.whatsapp_verified,
    max(audit.created_at) FILTER (WHERE audit.action = 'establishment.status_changed'),
    count(*) OVER ()
  FROM public.establishments establishment
  LEFT JOIN public.organization_establishments organization_establishment
    ON organization_establishment.establishment_id = establishment.id
    AND organization_establishment.status = 'active'
  LEFT JOIN public.organization_legal_entities organization_entity
    ON organization_entity.organization_id = organization_establishment.organization_id
    AND organization_entity.status = 'active'
  LEFT JOIN public.legal_entities entity ON entity.id = organization_entity.legal_entity_id
  LEFT JOIN public.security_audit_logs audit
    ON audit.target_id = establishment.id AND audit.target_type = 'establishment'
  WHERE (
    nullif(btrim(search_term), '') IS NULL
    OR establishment.name ILIKE '%' || btrim(search_term) || '%'
    OR establishment.slug ILIKE '%' || btrim(search_term) || '%'
  )
    AND (status_filter IS NULL OR establishment.account_status = status_filter)
  GROUP BY establishment.id, entity.id
  ORDER BY establishment.created_at DESC
  LIMIT least(greatest(coalesce(page_size, 25), 1), 100)
  OFFSET greatest(coalesce(page_offset, 0), 0);
END;
$$;


ALTER FUNCTION "public"."list_governance_establishments"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_invitations"("status_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "establishment_id" "uuid", "establishment_name" "text", "invited_email" "text", "role" "text", "status" "text", "expires_at" timestamp with time zone, "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT i.id, i.establishment_id, e.name, i.invited_email, i.role, i.status, i.expires_at, i.created_at FROM public.invitations i JOIN public.establishments e ON e.id=i.establishment_id WHERE status_filter IS NULL OR i.status=status_filter ORDER BY i.created_at DESC LIMIT 200;
END; $$;


ALTER FUNCTION "public"."list_governance_invitations"("status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_memberships"("status_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "profile_id" "uuid", "profile_name" "text", "profile_email" "text", "establishment_id" "uuid", "establishment_name" "text", "role" "text", "status" "text", "created_at" timestamp with time zone, "revoked_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT m.id, m.profile_id, coalesce(p.name,'Usuário'), p.email, m.establishment_id, e.name, m.role, m.status, m.created_at, m.revoked_at FROM public.memberships m JOIN public.profiles p ON p.id=m.profile_id JOIN public.establishments e ON e.id=m.establishment_id WHERE status_filter IS NULL OR m.status=status_filter ORDER BY m.created_at DESC LIMIT 200;
END; $$;


ALTER FUNCTION "public"."list_governance_memberships"("status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_privacy_requests"("status_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "target_profile_id" "uuid", "target_name" "text", "requested_by" "uuid", "status" "text", "request_reason" "text", "decision_reason" "text", "decided_by" "uuid", "decided_at" timestamp with time zone, "executed_at" timestamp with time zone, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT r.id, r.target_profile_id, coalesce(p.name,'Usuário anonimizado'), r.requested_by, r.status, r.request_reason, r.decision_reason, r.decided_by, r.decided_at, r.executed_at, r.created_at, r.updated_at
  FROM public.governance_privacy_requests r LEFT JOIN public.profiles p ON p.id=r.target_profile_id
  WHERE status_filter IS NULL OR r.status=status_filter ORDER BY r.created_at DESC LIMIT 100;
END; $$;


ALTER FUNCTION "public"."list_governance_privacy_requests"("status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_users"() RETURNS TABLE("profile_id" "uuid", "name" "text", "email" "text", "role" "public"."governance_role_enum", "granted_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT g.profile_id, coalesce(p.name,'Usuário'), p.email, g.role, g.granted_at, g.updated_at FROM public.governance_users g JOIN public.profiles p ON p.id=g.profile_id ORDER BY g.role, p.name;
END; $$;


ALTER FUNCTION "public"."list_governance_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_governance_verification_reviews"("target_establishment_id" "uuid" DEFAULT NULL::"uuid", "status_filter" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "establishment_id" "uuid", "establishment_name" "text", "document_path" "text", "previous_status" "text", "decision" "text", "reason" "text", "reviewer_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT v.id, v.establishment_id, e.name, v.document_path, v.previous_status, v.decision, v.reason, v.reviewer_id, v.created_at
  FROM public.governance_verification_reviews v JOIN public.establishments e ON e.id=v.establishment_id
  WHERE (target_establishment_id IS NULL OR v.establishment_id=target_establishment_id) AND (status_filter IS NULL OR v.decision=status_filter)
  ORDER BY v.created_at DESC LIMIT 100;
END; $$;


ALTER FUNCTION "public"."list_governance_verification_reviews"("target_establishment_id" "uuid", "status_filter" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."list_identity_migration_conflicts"() RETURNS TABLE("conflict_id" "uuid", "legacy_source" "text", "legacy_record_id" "uuid", "legal_entity_id" "uuid", "organization_id" "uuid", "requester_profile_id" "uuid", "document_type" "text", "masked_document" "text", "reason_code" "text", "status" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT conflict.id, conflict.legacy_source, conflict.legacy_record_id,
    conflict.legal_entity_id, conflict.organization_id, conflict.requester_profile_id,
    conflict.document_type,
    CASE
      WHEN conflict.document_last4 IS NULL THEN NULL
      WHEN conflict.document_type = 'CPF' THEN '***.***.***-' || conflict.document_last4
      ELSE '**.***.***/****-' || conflict.document_last4
    END,
    conflict.reason_code, conflict.status, conflict.created_at
  FROM public.identity_migration_conflicts conflict
  ORDER BY conflict.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."list_identity_migration_conflicts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_governance_kb_topic"("target_topic_id" "uuid", "requested_action" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  CASE requested_action
    WHEN 'mark_official' THEN
      UPDATE public.governance_kb_topics
      SET is_official = true,
          reviewed_at = timezone('utc', now()),
          reviewed_by = (SELECT auth.uid()),
          last_change_summary = 'Conteúdo revisado e marcado como oficial'
      WHERE id = target_topic_id AND publication_status = 'published';
    WHEN 'remove_official' THEN
      UPDATE public.governance_kb_topics
      SET is_official = false,
          reviewed_at = NULL,
          reviewed_by = NULL,
          last_change_summary = 'Selo oficial removido'
      WHERE id = target_topic_id;
    WHEN 'pin' THEN
      UPDATE public.governance_kb_topics SET is_pinned = true WHERE id = target_topic_id;
    WHEN 'unpin' THEN
      UPDATE public.governance_kb_topics SET is_pinned = false WHERE id = target_topic_id;
    WHEN 'archive' THEN
      UPDATE public.governance_kb_topics
      SET publication_status = 'archived', last_change_summary = 'Tópico arquivado pela moderação'
      WHERE id = target_topic_id;
    WHEN 'republish' THEN
      UPDATE public.governance_kb_topics
      SET publication_status = 'published', last_change_summary = 'Tópico republicado pela moderação'
      WHERE id = target_topic_id;
    ELSE
      RAISE EXCEPTION 'invalid_moderation_action';
  END CASE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'topic_not_found_or_invalid_state';
  END IF;
END;
$$;


ALTER FUNCTION "public"."moderate_governance_kb_topic"("target_topic_id" "uuid", "requested_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_brazil_phone_e164"("input_phone" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $_$
DECLARE digits text := regexp_replace(COALESCE(input_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF digits = '' THEN RETURN NULL; END IF;
  IF digits LIKE '55%' AND char_length(digits) IN (12, 13) THEN
    digits := substr(digits, 3);
  END IF;
  IF char_length(digits) NOT IN (10, 11)
    OR digits ~ '^([0-9])\1+$'
    OR substr(digits, 1, 2) = '00'
  THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  RETURN '+55' || digits;
END;
$_$;


ALTER FUNCTION "public"."normalize_brazil_phone_e164"("input_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_phone_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  NEW.phone := public.normalize_brazil_phone_e164(NEW.phone);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."normalize_phone_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_authorization_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'authorization_audit_log_is_immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_authorization_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_security_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_logs is read-only';
END;
$$;


ALTER FUNCTION "public"."prevent_security_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_service_history_deletion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.appointments appointment WHERE appointment.service_id = OLD.id) THEN
    RAISE EXCEPTION 'service_has_appointment_history';
  END IF;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_service_history_deletion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_authorization_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."protect_profile_authorization_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pull_changes"("last_pulled_at" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    last_pulled_timestamp timestamp with time zone;
    current_server_timestamp bigint;
    user_id uuid;
    user_role text;
    user_establishment_id uuid;
    
    -- Variáveis para armazenar as mudanças
    establishments_created jsonb := '[]'::jsonb;
    establishments_updated jsonb := '[]'::jsonb;
    establishments_deleted jsonb := '[]'::jsonb;

    profiles_created jsonb := '[]'::jsonb;
    profiles_updated jsonb := '[]'::jsonb;
    profiles_deleted jsonb := '[]'::jsonb;

    services_created jsonb := '[]'::jsonb;
    services_updated jsonb := '[]'::jsonb;
    services_deleted jsonb := '[]'::jsonb;

    appointments_created jsonb := '[]'::jsonb;
    appointments_updated jsonb := '[]'::jsonb;
    appointments_deleted jsonb := '[]'::jsonb;

    professional_services_created jsonb := '[]'::jsonb;
    professional_services_updated jsonb := '[]'::jsonb;
    professional_services_deleted jsonb := '[]'::jsonb;

    profile_establishments_created jsonb := '[]'::jsonb;
    profile_establishments_updated jsonb := '[]'::jsonb;
    profile_establishments_deleted jsonb := '[]'::jsonb;
BEGIN
    -- Obter o ID do usuário autenticado no Supabase
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    -- Obter dados do perfil do usuário logado
    SELECT role, establishment_id INTO user_role, user_establishment_id 
    FROM public.profiles 
    WHERE id = user_id;

    -- Validar se a barbearia ativa selecionada pertence a este usuário
    IF user_establishment_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profile_establishments 
            WHERE profile_id = user_id AND establishment_id = user_establishment_id
        ) THEN
            user_establishment_id := NULL;
        END IF;
    END IF;

    -- Converter last_pulled_at (timestamp Unix em milissegundos) para timestamptz
    IF last_pulled_at IS NULL OR last_pulled_at = 0 THEN
        last_pulled_timestamp := to_timestamp(0);
    ELSE
        last_pulled_timestamp := to_timestamp(last_pulled_at / 1000.0);
    END IF;

    -- Capturar o timestamp atual do servidor em milissegundos
    current_server_timestamp := extract(epoch from now()) * 1000;

    -- ----------------------------------------------------
    -- A. TABELA: establishments
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_created FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE id IN (
                SELECT establishment_id FROM public.profile_establishments WHERE profile_id = user_id
            ) AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_updated FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE id IN (
                SELECT establishment_id FROM public.profile_establishments WHERE profile_id = user_id
            ) AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_created FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_updated FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- B. TABELA: PROFILES
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_created FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
             FROM public.profiles 
            WHERE (establishment_id = user_establishment_id OR id IN (SELECT client_id FROM public.appointments WHERE establishment_id = user_establishment_id)) AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_updated FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
             FROM public.profiles 
            WHERE (establishment_id = user_establishment_id OR id IN (SELECT client_id FROM public.appointments WHERE establishment_id = user_establishment_id)) AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO profiles_deleted FROM (
            SELECT id FROM public.profiles 
            WHERE (establishment_id = user_establishment_id OR id IN (SELECT client_id FROM public.appointments WHERE establishment_id = user_establishment_id)) AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_created FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE (id = user_id OR role = 'professional') AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_updated FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE (id = user_id OR role = 'professional') AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- C. TABELA: SERVICES
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_created FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_updated FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO services_deleted FROM (
            SELECT id FROM public.services 
            WHERE establishment_id = user_establishment_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_created FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE is_active = true AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_updated FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE is_active = true AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- D. TABELA: APPOINTMENTS
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_created FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_updated FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO appointments_deleted FROM (
            SELECT id FROM public.appointments 
            WHERE establishment_id = user_establishment_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_created FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE client_id = user_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_updated FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE client_id = user_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO appointments_deleted FROM (
            SELECT id FROM public.appointments 
            WHERE client_id = user_id AND deleted_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- E. TABELA: professional_services
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_created FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE establishment_id = user_establishment_id AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_updated FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE establishment_id = user_establishment_id AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_created FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_updated FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- F. TABELA: PROFILE_establishments
    -- ----------------------------------------------------
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profile_establishments_created FROM (
        SELECT (profile_id::text || '_' || establishment_id::text) as id, profile_id, establishment_id, role,
               extract(epoch from created_at)*1000 as created_at, 
               extract(epoch from updated_at)*1000 as updated_at
        FROM public.profile_establishments 
        WHERE profile_id = user_id AND created_at > last_pulled_timestamp
    ) x;

    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profile_establishments_updated FROM (
        SELECT (profile_id::text || '_' || establishment_id::text) as id, profile_id, establishment_id, role,
               extract(epoch from created_at)*1000 as created_at, 
               extract(epoch from updated_at)*1000 as updated_at
        FROM public.profile_establishments 
        WHERE profile_id = user_id AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
    ) x;

    -- Retornar as mudanças formatadas para o WatermelonDB
    RETURN jsonb_build_object(
        'changes', jsonb_build_object(
            'establishments', jsonb_build_object('created', establishments_created, 'updated', establishments_updated, 'deleted', establishments_deleted),
            'profiles', jsonb_build_object('created', profiles_created, 'updated', profiles_updated, 'deleted', profiles_deleted),
            'services', jsonb_build_object('created', services_created, 'updated', services_updated, 'deleted', services_deleted),
            'appointments', jsonb_build_object('created', appointments_created, 'updated', appointments_updated, 'deleted', appointments_deleted),
            'professional_services', jsonb_build_object('created', professional_services_created, 'updated', professional_services_updated, 'deleted', professional_services_deleted),
            'profile_establishments', jsonb_build_object('created', profile_establishments_created, 'updated', profile_establishments_updated, 'deleted', profile_establishments_deleted)
        ),
        'timestamp', current_server_timestamp
    );
END;
$$;


ALTER FUNCTION "public"."pull_changes"("last_pulled_at" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_changes"("changes" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    user_id uuid;
    user_role text;
    user_establishment_id uuid;
    
    -- Chaves das tabelas nas alterações
    item RECORD;
    deleted_id text;
BEGIN
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    SELECT role, establishment_id INTO user_role, user_establishment_id 
    FROM public.profiles 
    WHERE id = user_id;

    -- PROCESSAR TABELA: establishments
    IF changes->'establishments' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'establishments'->'updated') AS x(id uuid, name text, logo_url text, banner_url text, slogan text, instagram text, primary_color text, timezone text, currency text, description text, address text, phone text, opening_hours text, share_agendas boolean, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.id AND role = 'admin'
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar dados desta barbearia';
            END IF;

            UPDATE public.establishments 
            SET name = COALESCE(item.name, name),
                logo_url = COALESCE(item.logo_url, logo_url),
                banner_url = COALESCE(item.banner_url, banner_url),
                slogan = COALESCE(item.slogan, slogan),
                instagram = COALESCE(item.instagram, instagram),
                primary_color = COALESCE(item.primary_color, primary_color),
                timezone = COALESCE(item.timezone, timezone),
                currency = COALESCE(item.currency, currency),
                description = COALESCE(item.description, description),
                address = COALESCE(item.address, address),
                phone = COALESCE(item.phone, phone),
                opening_hours = COALESCE(item.opening_hours, opening_hours),
                share_agendas = COALESCE(item.share_agendas, share_agendas),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: SERVICES
    IF changes->'services' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'created') AS x(id text, establishment_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, created_at bigint, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role IN ('admin', 'professional')
            ) THEN
                RAISE EXCEPTION 'Sem permissão para criar serviço nesta barbearia';
            END IF;
            
            INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active, created_at, updated_at)
            VALUES (item.id, item.establishment_id, item.name, item.price, item.duration_minutes, COALESCE(item.is_active, true), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'updated') AS x(id text, establishment_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role IN ('admin', 'professional')
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar serviço nesta barbearia';
            END IF;

            UPDATE public.services 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'services'->'deleted') AS id LOOP
            UPDATE public.services 
            SET deleted_at = now(), updated_at = now()
            WHERE id = deleted_id 
            AND EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = services.establishment_id AND role = 'admin'
            );
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: APPOINTMENTS
    IF changes->'appointments' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'created') AS x(id text, establishment_id uuid, client_id uuid, client_name text, professional_id uuid, service_id text, date_time bigint, status text, cancellation_reason text, cancelled_by_role text, reschedule_count integer, original_date_time bigint, created_at bigint, updated_at bigint) LOOP
            IF (user_role = 'client' AND user_id != item.client_id) OR (user_role IN ('admin', 'professional') AND NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role IN ('admin', 'professional')
            )) THEN
                RAISE EXCEPTION 'Sem permissão para criar este agendamento';
            END IF;

            INSERT INTO public.appointments (id, establishment_id, client_id, client_name, professional_id, service_id, date_time, status, cancellation_reason, cancelled_by_role, reschedule_count, original_date_time, created_at, updated_at)
            VALUES (item.id, item.establishment_id, item.client_id, item.client_name, item.professional_id, item.service_id, to_timestamp(item.date_time/1000.0), COALESCE(item.status, 'pending'), item.cancellation_reason, item.cancelled_by_role, COALESCE(item.reschedule_count, 0), to_timestamp(item.original_date_time/1000.0), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET status = item.status, 
                client_name = item.client_name, 
                date_time = to_timestamp(item.date_time/1000.0), 
                cancellation_reason = item.cancellation_reason, 
                cancelled_by_role = item.cancelled_by_role, 
                reschedule_count = COALESCE(item.reschedule_count, appointments.reschedule_count), 
                original_date_time = to_timestamp(item.original_date_time/1000.0), 
                updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'updated') AS x(id text, establishment_id uuid, client_id uuid, client_name text, professional_id uuid, service_id text, date_time bigint, status text, cancellation_reason text, cancelled_by_role text, reschedule_count integer, original_date_time bigint, updated_at bigint) LOOP
            IF (user_role = 'client' AND user_id != item.client_id) OR 
               (user_role = 'professional' AND (NOT EXISTS (
                   SELECT 1 FROM public.profile_establishments
                   WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'professional'
               ) OR user_id != item.professional_id)) OR
               (user_role = 'admin' AND NOT EXISTS (
                   SELECT 1 FROM public.profile_establishments
                   WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'admin'
               )) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este agendamento';
            END IF;

            UPDATE public.appointments 
            SET status = item.status, 
                client_name = item.client_name, 
                date_time = to_timestamp(item.date_time/1000.0), 
                cancellation_reason = item.cancellation_reason,
                cancelled_by_role = item.cancelled_by_role,
                reschedule_count = COALESCE(item.reschedule_count, reschedule_count),
                original_date_time = to_timestamp(item.original_date_time/1000.0),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'appointments'->'deleted') AS id LOOP
            UPDATE public.appointments 
            SET deleted_at = now(), updated_at = now()
            WHERE id = deleted_id 
            AND (
                client_id = user_id OR 
                (user_role = 'professional' AND professional_id = user_id) OR
                (user_role = 'admin' AND EXISTS (
                    SELECT 1 FROM public.profile_establishments
                    WHERE profile_id = user_id AND establishment_id = appointments.establishment_id AND role = 'admin'
                ))
            );
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: professional_services
    IF changes->'professional_services' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'professional_services'->'created') AS x(id uuid, establishment_id uuid, professional_id uuid, service_id text, price numeric, duration_minutes integer, is_active boolean, created_at bigint, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'admin'
            ) THEN
                RAISE EXCEPTION 'Sem permissão para configurar preços diferenciados nesta barbearia';
            END IF;

            INSERT INTO public.professional_services (id, establishment_id, professional_id, service_id, price, duration_minutes, is_active, created_at, updated_at)
            VALUES (item.id, item.establishment_id, item.professional_id, item.service_id, item.price, item.duration_minutes, COALESCE(item.is_active, true), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (professional_id, service_id) DO UPDATE 
            SET price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'professional_services'->'updated') AS x(id uuid, establishment_id uuid, price numeric, duration_minutes integer, is_active boolean, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'admin'
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar preços diferenciados nesta barbearia';
            END IF;

            UPDATE public.professional_services 
            SET price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'professional_services'->'deleted') AS id LOOP
            DELETE FROM public.professional_services 
            WHERE id = deleted_id::uuid 
            AND EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = professional_services.establishment_id AND role = 'admin'
            );
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: PROFILES
    IF changes->'profiles' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'profiles'->'updated') AS x(id uuid, establishment_id uuid, name text, phone text, avatar_url text, commission_rate numeric, push_token text, work_hours text, specialties text, instagram text, updated_at bigint) LOOP
            IF user_id != item.id AND NOT EXISTS (
                SELECT 1 FROM public.profile_establishments admin_link
                WHERE admin_link.profile_id = user_id 
                AND admin_link.role = 'admin'
                AND (
                    admin_link.establishment_id = (SELECT establishment_id FROM public.profiles WHERE id = item.id)
                    OR (SELECT establishment_id FROM public.profiles WHERE id = item.id) IS NULL
                    OR admin_link.establishment_id = item.establishment_id
                )
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este perfil';
            END IF;

            UPDATE public.profiles 
            SET name = COALESCE(item.name, name), 
                phone = COALESCE(item.phone, phone), 
                avatar_url = COALESCE(item.avatar_url, avatar_url),
                establishment_id = item.establishment_id,
                commission_rate = COALESCE(item.commission_rate, commission_rate),
                push_token = COALESCE(item.push_token, push_token),
                work_hours = COALESCE(item.work_hours, work_hours),
                specialties = COALESCE(item.specialties, specialties),
                instagram = COALESCE(item.instagram, instagram),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;
    END IF;
END;
$$;


ALTER FUNCTION "public"."push_changes"("changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_due_client_appointment_reminders"("target_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.client_push_deliveries (
    event_key,
    event_type,
    profile_id,
    push_device_id,
    appointment_id,
    title,
    body,
    payload
  )
  SELECT
    appointment.id || ':appointment_reminder:24h',
    'appointment_reminder',
    appointment.client_id,
    device.id,
    appointment.id,
    'Lembrete de atendimento',
    'Seu atendimento em ' || establishment.name || ' será amanhã, '
      || to_char(
        appointment.date_time AT TIME ZONE COALESCE(NULLIF(establishment.timezone, ''), 'America/Sao_Paulo'),
        'DD/MM/YYYY "às" HH24:MI'
      ) || '.',
    jsonb_build_object(
      'appointmentId', appointment.id,
      'eventType', 'appointment_reminder',
      'url', '/appointments/' || appointment.id
    )
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment
    ON establishment.id = appointment.establishment_id
  JOIN public.profiles AS profile
    ON profile.id = appointment.client_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  JOIN public.push_devices AS device
    ON device.profile_id = appointment.client_id
    AND device.app_kind = 'client'
    AND device.enabled
  WHERE appointment.deleted_at IS NULL
    AND appointment.status IN ('pending', 'confirmed')
    AND appointment.date_time > target_now + interval '23 hours 45 minutes'
    AND appointment.date_time <= target_now + interval '24 hours'
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;


ALTER FUNCTION "public"."queue_due_client_appointment_reminders"("target_now" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_business_identity_atomic"("actor_profile_id" "uuid", "target_document_type" "text", "target_document_fingerprint" "text", "encrypted_document_value" "text", "encryption_iv_value" "text", "encryption_key_version_value" "text", "target_document_last4" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") RETURNS TABLE("result_status" "text", "establishment_id" "uuid", "organization_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  entity_record public.legal_entities%ROWTYPE;
  target_organization_id uuid;
  new_establishment_id uuid;
  actor_email text;
  conflict_reason text;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF actor_profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = actor_profile_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_document_type NOT IN ('CPF', 'CNPJ')
    OR target_document_fingerprint !~ '^[0-9a-f]{64}$'
    OR (target_document_type = 'CPF' AND target_document_last4 !~ '^[0-9]{4}$')
    OR (target_document_type = 'CNPJ' AND target_document_last4 !~ '^[A-Z0-9]{4}$')
  THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF char_length(btrim(requested_name)) NOT BETWEEN 2 AND 120
    OR lower(btrim(requested_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN RAISE EXCEPTION 'invalid_registration'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_document_fingerprint, 0));
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug) = lower(btrim(requested_slug))) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  SELECT * INTO entity_record FROM public.legal_entities
  WHERE document_fingerprint = target_document_fingerprint
  FOR UPDATE;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profile_legal_entities
      WHERE legal_entity_id = entity_record.id AND profile_id = actor_profile_id AND status = 'active'
    ) THEN
      conflict_reason := 'document_claimed_by_another_profile';
    ELSE
      SELECT link.organization_id INTO target_organization_id
      FROM public.organization_legal_entities link
      JOIN public.organization_members member ON member.organization_id = link.organization_id
      WHERE link.legal_entity_id = entity_record.id AND link.status = 'active'
        AND member.profile_id = actor_profile_id AND member.role = 'owner' AND member.status = 'active'
      LIMIT 1;
      IF target_organization_id IS NULL THEN
        conflict_reason := 'document_claimed_by_another_organization';
      END IF;
    END IF;

    IF conflict_reason IS NOT NULL THEN
      INSERT INTO public.identity_migration_conflicts(
        legacy_source, legal_entity_id, requester_profile_id, document_type,
        document_last4, reason_code
      ) VALUES (
        'manual', entity_record.id, actor_profile_id, target_document_type,
        target_document_last4, conflict_reason
      );
      RETURN QUERY SELECT 'under_review'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.legal_entities(
      entity_type, document_type, document_fingerprint, encrypted_document,
      encryption_iv, encryption_key_version, document_last4, created_by
    ) VALUES (
      CASE WHEN target_document_type = 'CPF' THEN 'person' ELSE 'company' END,
      target_document_type, target_document_fingerprint, encrypted_document_value,
      encryption_iv_value, encryption_key_version_value, target_document_last4, actor_profile_id
    ) RETURNING * INTO entity_record;

    INSERT INTO public.profile_legal_entities(
      profile_id, legal_entity_id, relationship, created_by
    ) VALUES (actor_profile_id, entity_record.id, 'owner', actor_profile_id);

    INSERT INTO public.organizations(name, created_by)
    VALUES (btrim(requested_name), actor_profile_id)
    RETURNING id INTO target_organization_id;
    INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
    VALUES (target_organization_id, actor_profile_id, 'owner', actor_profile_id);
    INSERT INTO public.organization_legal_entities(
      organization_id, legal_entity_id, created_by
    ) VALUES (target_organization_id, entity_record.id, actor_profile_id);
    SELECT email INTO actor_email FROM public.profiles WHERE id = actor_profile_id;
    INSERT INTO public.organization_billing_accounts(organization_id, display_name, billing_email)
    VALUES (target_organization_id, btrim(requested_name), actor_email);
  END IF;

  INSERT INTO public.establishments(
    name, slug, address, phone, primary_color, account_status, verification_level
  ) VALUES (
    btrim(requested_name), lower(btrim(requested_slug)), NULLIF(btrim(requested_address), ''),
    NULLIF(btrim(requested_phone), ''), upper(btrim(requested_primary_color)),
    'pending_verification', 1
  ) RETURNING id INTO new_establishment_id;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, commission_rate, created_by
  ) VALUES (
    actor_profile_id, new_establishment_id, 'admin', 'active', 0.50, actor_profile_id
  ) ON CONFLICT (profile_id, establishment_id) DO UPDATE
    SET role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (target_organization_id, new_establishment_id, actor_profile_id);
  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT subscription.id, new_establishment_id, subscription.current_period_end + 1
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE account.organization_id = target_organization_id AND subscription.status <> 'canceled'
  ON CONFLICT (subscription_id, establishment_id, effective_from)
  DO UPDATE SET effective_until = NULL;
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id,
    metadata
  ) VALUES (
    target_organization_id, actor_profile_id,
    CASE WHEN entity_record.created_by = actor_profile_id
      AND entity_record.created_at >= transaction_timestamp() - interval '1 second'
      THEN 'business_registration.created' ELSE 'business_registration.unit_added' END,
    new_establishment_id, jsonb_build_object('document_type', target_document_type)
  );

  RETURN QUERY SELECT
    CASE WHEN (
      SELECT count(*) FROM public.organization_establishments
      WHERE organization_id = target_organization_id AND status = 'active'
    ) = 1 THEN 'created' ELSE 'unit_added' END,
    new_establishment_id, target_organization_id;
END;
$_$;


ALTER FUNCTION "public"."register_business_identity_atomic"("actor_profile_id" "uuid", "target_document_type" "text", "target_document_fingerprint" "text", "encrypted_document_value" "text", "encryption_iv_value" "text", "encryption_key_version_value" "text", "target_document_last4" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_push_device"("target_app_kind" "text", "target_platform" "text", "target_expo_push_token" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."register_push_device"("target_app_kind" "text", "target_platform" "text", "target_expo_push_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_establishment_request"("target_request_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.establishment_requests
  SET status = 'rejected', rejection_reason = NULLIF(trim(reason), ''),
      reviewed_by = (SELECT auth.uid()), reviewed_at = now(), updated_at = now()
  WHERE id = target_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  INSERT INTO public.authorization_audit_log(actor_id, action, metadata)
  VALUES ((SELECT auth.uid()), 'establishment.rejected', jsonb_build_object('request_id', target_request_id));
END;
$$;


ALTER FUNCTION "public"."reject_establishment_request"("target_request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_governance_establishment_request"("target_request_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
  UPDATE public.establishment_requests SET status='rejected', rejection_reason=btrim(reason), reviewed_by=(SELECT auth.uid()), reviewed_at=now(), updated_at=now() WHERE id=target_request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  INSERT INTO public.authorization_audit_log(actor_id, action, metadata) VALUES ((SELECT auth.uid()), 'governance.request.rejected', jsonb_build_object('request_id', target_request_id, 'reason_provided', true));
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.request.rejected', target_request_id, 'establishment_request', jsonb_build_object('reason_provided', true));
END; $$;


ALTER FUNCTION "public"."reject_governance_establishment_request"("target_request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_governance_privacy_request"("request_id" "uuid", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'privacy_reason_required'; END IF;
  UPDATE public.governance_privacy_requests SET status='rejected', decision_reason=btrim(reason), decided_by=(SELECT auth.uid()), decided_at=now(), updated_at=now() WHERE id=request_id AND status='pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'privacy_request_not_pending'; END IF;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.privacy.rejected', request_id, 'privacy_request', jsonb_build_object('status','rejected','reason_provided',true));
  RETURN jsonb_build_object('id',request_id,'status','rejected');
END; $$;


ALTER FUNCTION "public"."reject_governance_privacy_request"("request_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF (
    SELECT count(*) FROM public.organization_establishments
    WHERE organization_id = target_organization_id
      AND status = 'active' AND effective_until IS NULL
  ) <= 1 THEN RAISE EXCEPTION 'organization_requires_one_establishment'; END IF;

  UPDATE public.organization_establishments
  SET status = 'removed', effective_until = CURRENT_DATE, updated_at = now()
  WHERE organization_id = target_organization_id
    AND establishment_id = target_establishment_id
    AND status = 'active' AND effective_until IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_establishment_not_found'; END IF;

  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id
  ) VALUES (target_organization_id, actor_id, 'organization.establishment_removed', target_establishment_id);

  UPDATE public.subscription_units unit
  SET effective_until = subscription.current_period_end
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE unit.subscription_id = subscription.id
    AND unit.establishment_id = target_establishment_id
    AND unit.effective_until IS NULL
    AND account.organization_id = target_organization_id;
END;
$$;


ALTER FUNCTION "public"."remove_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."remove_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_service"("target_establishment_id" "uuid", "target_service_id" "text", "direction" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  current_service public.services%ROWTYPE;
  neighbor_service public.services%ROWTYPE;
  temporary_position integer;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(
      target_establishment_id,
      ARRAY['admin']
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF direction NOT IN ('up', 'down') THEN
    RAISE EXCEPTION 'invalid_direction';
  END IF;

  SELECT *
  INTO current_service
  FROM public.services service
  WHERE service.id = target_service_id
    AND service.establishment_id = target_establishment_id
    AND service.deleted_at IS NULL
  FOR UPDATE;

  IF current_service.id IS NULL THEN
    RAISE EXCEPTION 'service_not_found';
  END IF;

  IF direction = 'up' THEN
    SELECT *
    INTO neighbor_service
    FROM public.services service
    WHERE service.establishment_id = target_establishment_id
      AND service.deleted_at IS NULL
      AND (
        service.sort_order < current_service.sort_order
        OR (
          service.sort_order = current_service.sort_order
          AND service.name < current_service.name
        )
      )
    ORDER BY service.sort_order DESC, service.name DESC
    LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT *
    INTO neighbor_service
    FROM public.services service
    WHERE service.establishment_id = target_establishment_id
      AND service.deleted_at IS NULL
      AND (
        service.sort_order > current_service.sort_order
        OR (
          service.sort_order = current_service.sort_order
          AND service.name > current_service.name
        )
      )
    ORDER BY service.sort_order, service.name
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF neighbor_service.id IS NULL THEN
    RETURN;
  END IF;

  temporary_position := current_service.sort_order;

  UPDATE public.services
  SET sort_order = neighbor_service.sort_order
  WHERE id = current_service.id;

  UPDATE public.services
  SET sort_order = temporary_position
  WHERE id = neighbor_service.id;
END;
$$;


ALTER FUNCTION "public"."reorder_service"("target_establishment_id" "uuid", "target_service_id" "text", "direction" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_establishment"("requested_name" "text", "requested_slug" "text", "requested_address" "text" DEFAULT NULL::"text", "requested_phone" "text" DEFAULT NULL::"text", "requested_primary_color" "text" DEFAULT '#F5A524'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
DECLARE
  current_profile public.profiles%ROWTYPE;
  normalized_slug text := lower(trim(requested_slug));
  request_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF trim(COALESCE(requested_name, '')) = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF normalized_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' THEN RAISE EXCEPTION 'invalid_slug'; END IF;
  IF requested_primary_color !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'invalid_color'; END IF;

  SELECT * INTO current_profile FROM public.profiles WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.establishments e WHERE lower(e.slug) = normalized_slug) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.establishment_requests r WHERE r.requester_id = current_profile.id AND r.status = 'pending') THEN
    RAISE EXCEPTION 'pending_request_exists';
  END IF;

  INSERT INTO public.establishment_requests (
    requester_id, requester_name, requester_email, name, slug, address, phone, primary_color
  ) VALUES (
    current_profile.id, current_profile.name, current_profile.email, trim(requested_name), normalized_slug,
    NULLIF(trim(requested_address), ''), NULLIF(trim(requested_phone), ''), upper(requested_primary_color)
  ) RETURNING id INTO request_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, metadata)
  VALUES (current_profile.id, 'establishment.requested', jsonb_build_object('request_id', request_id));
  RETURN request_id;
END;
$_$;


ALTER FUNCTION "public"."request_establishment"("requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."require_aal2"() RETURNS "void"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF NOT public.current_session_is_aal2() THEN
    RAISE EXCEPTION 'aal2_required';
  END IF;
END;
$$;


ALTER FUNCTION "public"."require_aal2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reschedule_appointment"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_staff boolean;
  current_appointment public.appointments%ROWTYPE;
  establishment_status text;
  target_timezone text;
  instant_booking boolean;
  effective_min_hours integer;
  selected_slot record;
  next_status text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;

  SELECT * INTO current_appointment
  FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL
  FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;
  IF current_appointment.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;

  actor_is_staff := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin'])
    OR (
      current_appointment.professional_id = actor_id
      AND public.has_active_membership(current_appointment.establishment_id, ARRAY['professional', 'admin'])
    );
  IF current_appointment.client_id <> actor_id AND NOT actor_is_staff THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT
    establishment.account_status,
    establishment.timezone,
    establishment.instant_booking_enabled,
    CASE
      WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0 THEN 24
      ELSE establishment.min_cancellation_hours
    END::integer
  INTO establishment_status, target_timezone, instant_booking, effective_min_hours
  FROM public.establishments AS establishment
  WHERE establishment.id = current_appointment.establishment_id;

  IF actor_is_staff THEN
    IF establishment_status NOT IN ('active', 'pending_verification') THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;
  ELSE
    IF establishment_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;
    IF current_appointment.reschedule_count >= 2 THEN RAISE EXCEPTION 'reschedule_limit_reached'; END IF;
    IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
      RAISE EXCEPTION 'cancellation_window_closed';
    END IF;
  END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = requested_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    current_appointment.establishment_id,
    requested_professional_id,
    requested_service_id,
    (requested_date_time AT TIME ZONE target_timezone)::date,
    target_appointment_id
  ) AS slot
  WHERE slot.starts_at = requested_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'; END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  next_status := CASE
    WHEN actor_is_staff THEN 'confirmed'
    WHEN COALESCE(instant_booking, true) THEN 'confirmed'
    ELSE 'pending'
  END;

  UPDATE public.appointments
  SET
    original_date_time = COALESCE(original_date_time, date_time),
    date_time = requested_date_time,
    professional_id = requested_professional_id,
    service_id = requested_service_id,
    reschedule_count = reschedule_count + 1,
    status = next_status
  WHERE id = target_appointment_id;

  RETURN target_appointment_id;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;


ALTER FUNCTION "public"."reschedule_appointment"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reschedule_appointment_before_schedule_blocks"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_appointment public.appointments%ROWTYPE;
  target_timezone text;
  selected_slot record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;
  SELECT * INTO current_appointment FROM public.appointments WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.client_id <> actor_id
    AND NOT public.is_superadmin()
    AND NOT public.has_active_membership(current_appointment.establishment_id, ARRAY['admin'])
    AND NOT (
      current_appointment.professional_id = actor_id
      AND public.has_active_membership(current_appointment.establishment_id, ARRAY['professional', 'admin'])
    )
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF current_appointment.reschedule_count >= 2 AND current_appointment.client_id = actor_id THEN RAISE EXCEPTION 'reschedule_limit_reached'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment WHERE establishment.id = current_appointment.establishment_id;
  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
      current_appointment.establishment_id,
      requested_professional_id,
      requested_service_id,
      (requested_date_time AT TIME ZONE target_timezone)::date,
      target_appointment_id
    ) slot
  WHERE slot.starts_at = requested_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'; END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  UPDATE public.appointments SET
    original_date_time = COALESCE(original_date_time, date_time),
    date_time = requested_date_time,
    professional_id = requested_professional_id,
    service_id = requested_service_id,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN current_appointment.client_id = actor_id THEN 'pending' ELSE 'confirmed' END
  WHERE id = target_appointment_id;
  RETURN target_appointment_id;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;


ALTER FUNCTION "public"."reschedule_appointment_before_schedule_blocks"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_governance_kb_attachment"("target_topic_id" "uuid", "target_reply_id" "uuid", "requested_original_name" "text", "requested_mime_type" "text", "requested_size_bytes" bigint, "requested_width" integer, "requested_height" integer, "requested_alt_text" "text") RETURNS TABLE("attachment_id" "uuid", "storage_path" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  new_id uuid := gen_random_uuid();
  extension text;
  new_path text;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.governance_kb_topics WHERE id = target_topic_id) THEN
    RAISE EXCEPTION 'topic_not_found';
  END IF;
  IF requested_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'unsupported_image_type';
  END IF;
  IF requested_size_bytes <= 0 OR requested_size_bytes > 5242880 THEN
    RAISE EXCEPTION 'image_size_invalid';
  END IF;
  IF char_length(btrim(coalesce(requested_alt_text, ''))) < 3 THEN
    RAISE EXCEPTION 'alt_text_required';
  END IF;

  extension := CASE requested_mime_type
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
  END;
  new_path := target_topic_id::text || '/' || new_id::text || '.' || extension;

  INSERT INTO public.governance_kb_attachments (
    id, topic_id, reply_id, storage_path, original_name, mime_type,
    size_bytes, width, height, alt_text, uploaded_by
  ) VALUES (
    new_id, target_topic_id, target_reply_id, new_path,
    left(btrim(requested_original_name), 255), requested_mime_type,
    requested_size_bytes, requested_width, requested_height,
    btrim(requested_alt_text), (SELECT auth.uid())
  );

  RETURN QUERY SELECT new_id, new_path;
END;
$$;


ALTER FUNCTION "public"."reserve_governance_kb_attachment"("target_topic_id" "uuid", "target_reply_id" "uuid", "requested_original_name" "text", "requested_mime_type" "text", "requested_size_bytes" bigint, "requested_width" integer, "requested_height" integer, "requested_alt_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_identity_migration_conflict"("actor_profile_id" "uuid", "target_conflict_id" "uuid", "target_action" "text", "target_reason" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE conflict public.identity_migration_conflicts%ROWTYPE;
  resolved_organization_id uuid;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF target_action NOT IN ('link', 'reject', 'request_evidence')
    OR char_length(btrim(target_reason)) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'invalid_resolution'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.governance_users
    WHERE profile_id = actor_profile_id AND role IN ('SaaS_Editor', 'SaaS_Owner')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO conflict FROM public.identity_migration_conflicts
  WHERE id = target_conflict_id FOR UPDATE;
  IF NOT FOUND OR conflict.status <> 'pending' THEN RAISE EXCEPTION 'conflict_not_pending'; END IF;

  IF target_action = 'link' THEN
    IF conflict.legal_entity_id IS NULL OR conflict.requester_profile_id IS NULL THEN
      RAISE EXCEPTION 'secure_backfill_required';
    END IF;
    SELECT organization_id INTO resolved_organization_id
    FROM public.organization_legal_entities
    WHERE legal_entity_id = conflict.legal_entity_id AND status = 'active'
    LIMIT 1;
    IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'legal_entity_without_organization'; END IF;
    INSERT INTO public.profile_legal_entities(
      profile_id, legal_entity_id, relationship, created_by
    ) VALUES (
      conflict.requester_profile_id, conflict.legal_entity_id, 'owner', actor_profile_id
    ) ON CONFLICT (profile_id, legal_entity_id) DO UPDATE
      SET relationship = 'owner', status = 'active', revoked_at = NULL;
    INSERT INTO public.organization_members(
      organization_id, profile_id, role, created_by
    ) VALUES (
      resolved_organization_id, conflict.requester_profile_id, 'owner', actor_profile_id
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE
      SET role = 'owner', status = 'active', revoked_at = NULL, updated_at = now();
  END IF;

  UPDATE public.identity_migration_conflicts SET
    status = CASE target_action
      WHEN 'link' THEN 'linked'
      WHEN 'reject' THEN 'rejected'
      ELSE 'evidence_requested'
    END,
    resolution_reason = btrim(target_reason),
    resolved_by = actor_profile_id,
    resolved_at = now()
  WHERE id = target_conflict_id;
  INSERT INTO public.security_audit_logs(action, actor_id, target_type, target_id, changes)
  VALUES (
    'identity_conflict.' || target_action, actor_profile_id, 'identity_conflict',
    target_conflict_id, jsonb_build_object('reason_provided', true)
  );
  RETURN target_action;
END;
$$;


ALTER FUNCTION "public"."resolve_identity_migration_conflict"("actor_profile_id" "uuid", "target_conflict_id" "uuid", "target_action" "text", "target_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_governance_kb_revision"("target_revision_id" bigint, "requested_change_summary" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  revision_record public.governance_kb_revisions%ROWTYPE;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(btrim(coalesce(requested_change_summary, ''))) < 3 THEN
    RAISE EXCEPTION 'change_summary_required';
  END IF;

  SELECT * INTO revision_record
  FROM public.governance_kb_revisions
  WHERE id = target_revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revision_not_found';
  END IF;

  IF revision_record.entity_type = 'topic' THEN
    UPDATE public.governance_kb_topics
    SET slug = revision_record.snapshot->>'slug',
        title = revision_record.snapshot->>'title',
        body_markdown = revision_record.snapshot->>'body_markdown',
        category_id = (revision_record.snapshot->>'category_id')::uuid,
        kind = revision_record.snapshot->>'kind',
        tags = ARRAY(SELECT jsonb_array_elements_text(revision_record.snapshot->'tags')),
        publication_status = revision_record.snapshot->>'publication_status',
        resolution_status = revision_record.snapshot->>'resolution_status',
        accepted_reply_id = nullif(revision_record.snapshot->>'accepted_reply_id', '')::uuid,
        last_change_summary = btrim(requested_change_summary)
    WHERE id = revision_record.entity_id;
  ELSE
    UPDATE public.governance_kb_replies
    SET body_markdown = revision_record.snapshot->>'body_markdown',
        status = revision_record.snapshot->>'status',
        last_change_summary = btrim(requested_change_summary)
    WHERE id = revision_record.entity_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."restore_governance_kb_revision"("target_revision_id" bigint, "requested_change_summary" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_governance_verification"("target_review_id" "uuid", "target_decision" "text", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."review_governance_verification"("target_review_id" "uuid", "target_decision" "text", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_governance_invitation"("target_invitation_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE i public.invitations%ROWTYPE;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'revocation_reason_required'; END IF;
  SELECT * INTO i FROM public.invitations WHERE id=target_invitation_id AND status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invitation_not_pending'; END IF;
  UPDATE public.invitations SET status='revoked', revoked_at=now(), revocation_reason=btrim(reason) WHERE id=target_invitation_id;
  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata) VALUES ((SELECT auth.uid()), 'governance.invitation.revoked', i.establishment_id, jsonb_build_object('invitation_id',i.id,'role',i.role,'reason_provided',true));
END; $$;


ALTER FUNCTION "public"."revoke_governance_invitation"("target_invitation_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_governance_membership"("target_membership_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."revoke_governance_membership"("target_membership_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_governance_role"("target_profile_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
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


ALTER FUNCTION "public"."revoke_governance_role"("target_profile_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_invitation"("target_invitation_id" "uuid", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."revoke_invitation"("target_invitation_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_organization_member"("target_organization_id" "uuid", "target_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id AND role = 'owner' AND status = 'active'
  ) THEN RAISE EXCEPTION 'owner_cannot_be_revoked'; END IF;
  UPDATE public.organization_members
  SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_member_not_found'; END IF;
  INSERT INTO public.organization_audit_log(organization_id, actor_id, action, target_profile_id)
  VALUES (target_organization_id, actor_id, 'organization.member_revoked', target_profile_id);
END;
$$;


ALTER FUNCTION "public"."revoke_organization_member"("target_organization_id" "uuid", "target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_governance_kb_topics"("search_query" "text" DEFAULT NULL::"text", "filter_category" "uuid" DEFAULT NULL::"uuid", "filter_kind" "text" DEFAULT NULL::"text", "filter_status" "text" DEFAULT NULL::"text", "page_number" integer DEFAULT 1, "page_size" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "slug" "text", "title" "text", "excerpt" "text", "kind" "text", "tags" "text"[], "publication_status" "text", "resolution_status" "text", "is_official" boolean, "is_pinned" boolean, "reviewed_at" timestamp with time zone, "author_name" "text", "category_id" "uuid", "category_name" "text", "category_slug" "text", "reply_count" bigint, "version" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "total_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  can_edit boolean;
BEGIN
  IF NOT public.is_governance_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  can_edit := public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      topic.id,
      topic.slug,
      topic.title,
      left(regexp_replace(topic.body_markdown, '[#*_>`~\[\]()]', '', 'g'), 220) AS excerpt,
      topic.kind,
      topic.tags,
      topic.publication_status,
      topic.resolution_status,
      topic.is_official,
      topic.is_pinned,
      topic.reviewed_at,
      coalesce(profile.name, 'Equipe CutSync') AS author_name,
      category.id AS category_id,
      category.name AS category_name,
      category.slug AS category_slug,
      (SELECT count(*) FROM public.governance_kb_replies reply
        WHERE reply.topic_id = topic.id AND reply.status = 'published') AS reply_count,
      topic.version,
      topic.created_at,
      topic.updated_at
    FROM public.governance_kb_topics topic
    JOIN public.governance_kb_categories category ON category.id = topic.category_id
    LEFT JOIN public.profiles profile ON profile.id = topic.author_id
    WHERE (can_edit OR topic.publication_status = 'published')
      AND (filter_status IS NULL OR topic.publication_status = filter_status)
      AND (filter_category IS NULL OR topic.category_id = filter_category)
      AND (filter_kind IS NULL OR topic.kind = filter_kind)
      AND (
        search_query IS NULL
        OR btrim(search_query) = ''
        OR topic.search_document @@ websearch_to_tsquery('portuguese', btrim(search_query))
      )
  )
  SELECT filtered.*, count(*) OVER () AS total_count
  FROM filtered
  ORDER BY is_pinned DESC, is_official DESC, updated_at DESC
  LIMIT LEAST(GREATEST(page_size, 1), 50)
  OFFSET (GREATEST(page_number, 1) - 1) * LEAST(GREATEST(page_size, 1), 50);
END;
$$;


ALTER FUNCTION "public"."search_governance_kb_topics"("search_query" "text", "filter_category" "uuid", "filter_kind" "text", "filter_status" "text", "page_number" integer, "page_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_appointment_duration_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  resolved_duration integer;
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.duration_minutes IS NULL
  THEN
    SELECT COALESCE(professional_service.duration_minutes, service.duration_minutes)
    INTO resolved_duration
    FROM public.services service
    LEFT JOIN public.professional_services professional_service
      ON professional_service.professional_id = NEW.professional_id
      AND professional_service.service_id = service.id
      AND professional_service.establishment_id = NEW.establishment_id
      AND professional_service.is_active = true
    WHERE service.id = NEW.service_id
      AND service.establishment_id = NEW.establishment_id
      AND service.deleted_at IS NULL
      AND service.is_active = true;

    IF resolved_duration IS NULL THEN
      RAISE EXCEPTION 'service_unavailable';
    END IF;

    NEW.duration_minutes := resolved_duration;
  END IF;

  NEW.ends_at := NEW.date_time + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_appointment_duration_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_control_subscription_enforcement"("target_subscription_id" "uuid", "enabled" boolean, "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE account_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(btrim(reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  UPDATE public.organization_subscriptions
  SET enforcement_enabled = enabled, updated_at = now()
  WHERE id = target_subscription_id
  RETURNING billing_account_id INTO account_id;
  IF account_id IS NULL THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  INSERT INTO public.organization_billing_events(billing_account_id, subscription_id, actor_id, event_type, metadata)
  VALUES (account_id, target_subscription_id, (SELECT auth.uid()), 'subscription.enforcement_changed',
    jsonb_build_object('enabled', enabled, 'reason', btrim(reason)));
END;
$$;


ALTER FUNCTION "public"."set_control_subscription_enforcement"("target_subscription_id" "uuid", "enabled" boolean, "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_control_subscription_status"("target_subscription_id" "uuid", "target_status" "text", "reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  account_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_status NOT IN ('trialing', 'active', 'past_due', 'suspended', 'canceled') THEN
    RAISE EXCEPTION 'invalid_subscription_status';
  END IF;
  IF char_length(btrim(reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'invalid_reason'; END IF;

  UPDATE public.organization_subscriptions SET
    status = target_status,
    grace_ends_at = CASE WHEN target_status = 'past_due' THEN now() + interval '7 days' ELSE NULL END,
    canceled_at = CASE WHEN target_status = 'canceled' THEN now() ELSE canceled_at END,
    updated_at = now()
  WHERE id = target_subscription_id
  RETURNING billing_account_id INTO account_id;
  IF account_id IS NULL THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  INSERT INTO public.organization_billing_events(
    billing_account_id, subscription_id, actor_id, event_type, metadata
  ) VALUES (
    account_id, target_subscription_id, actor_id, 'subscription.status_changed',
    jsonb_build_object('status', target_status, 'reason', btrim(reason))
  );

  UPDATE public.establishments establishment
  SET account_status = CASE
    WHEN target_status = 'suspended' THEN 'blocked'
    WHEN target_status IN ('active', 'trialing') AND establishment.account_status IN ('blocked', 'delinquent') THEN 'active'
    ELSE establishment.account_status
  END,
  updated_at = CASE
    WHEN target_status = 'suspended'
      OR (target_status IN ('active', 'trialing') AND establishment.account_status IN ('blocked', 'delinquent'))
    THEN now() ELSE establishment.updated_at END
  FROM public.subscription_units unit
  JOIN public.organization_subscriptions subscription ON subscription.id = unit.subscription_id
  WHERE subscription.id = target_subscription_id
    AND subscription.enforcement_enabled
    AND establishment.id = unit.establishment_id
    AND unit.effective_until IS NULL;
END;
$$;


ALTER FUNCTION "public"."set_control_subscription_status"("target_subscription_id" "uuid", "target_status" "text", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_client_account_deletion_request"() RETURNS TABLE("id" "uuid", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."submit_client_account_deletion_request"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_privacy_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "target_profile_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "request_reason" "text" NOT NULL,
    "decision_reason" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "processing_started_at" timestamp with time zone,
    "profile_anonymized_at" timestamp with time zone,
    "auth_deleted_at" timestamp with time zone,
    "last_error_code" "text",
    CONSTRAINT "governance_privacy_requests_attempt_count_check" CHECK (("attempt_count" >= 0)),
    CONSTRAINT "governance_privacy_requests_request_reason_check" CHECK ((("char_length"("btrim"("request_reason")) >= 10) AND ("char_length"("btrim"("request_reason")) <= 500))),
    CONSTRAINT "governance_privacy_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'executed'::"text", 'rejected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."governance_privacy_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_governance_privacy_request"("target_profile_id" "uuid", "reason" "text") RETURNS "public"."governance_privacy_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE result public.governance_privacy_requests;
BEGIN
  IF (SELECT auth.uid()) <> target_profile_id AND NOT public.is_governance_user(ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF char_length(btrim(coalesce(reason,''))) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'privacy_reason_required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=target_profile_id) THEN RAISE EXCEPTION 'user_not_found'; END IF;
  INSERT INTO public.governance_privacy_requests(target_profile_id,requested_by,request_reason) VALUES (target_profile_id,(SELECT auth.uid()),btrim(reason)) RETURNING * INTO result;
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes) VALUES ((SELECT auth.uid()), 'governance.privacy.submitted', result.id, 'privacy_request', jsonb_build_object('target_profile_id',target_profile_id));
  RETURN result;
END; $$;


ALTER FUNCTION "public"."submit_governance_privacy_request"("target_profile_id" "uuid", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_governance_verification"("target_establishment_id" "uuid", "document_path" "text", "reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
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
END; $_$;


ALTER FUNCTION "public"."submit_governance_verification"("target_establishment_id" "uuid", "document_path" "text", "reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_active_establishment"("target_establishment_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE membership_role text;
BEGIN
  SELECT role INTO membership_role FROM public.memberships
  WHERE profile_id = (SELECT auth.uid()) AND establishment_id = target_establishment_id AND status = 'active';
  IF membership_role IS NULL THEN RAISE EXCEPTION 'membership_required'; END IF;
  UPDATE public.profiles
  SET establishment_id = target_establishment_id, role = membership_role,
      commission_rate = (SELECT commission_rate FROM public.memberships
        WHERE profile_id = (SELECT auth.uid()) AND establishment_id = target_establishment_id),
      updated_at = now()
  WHERE id = (SELECT auth.uid());
  RETURN membership_role;
END;
$$;


ALTER FUNCTION "public"."switch_active_establishment"("target_establishment_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."text_array_has_duplicates"("target_values" "text"[]) RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT count(*) <> count(DISTINCT value)
  FROM unnest(COALESCE(target_values, ARRAY[]::text[])) AS value;
$$;


ALTER FUNCTION "public"."text_array_has_duplicates"("target_values" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_organization_ownership"("target_organization_id" "uuid", "target_profile_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF target_profile_id = actor_id THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'organization_member_not_found'; END IF;

  UPDATE public.organization_members SET role = 'manager', updated_at = now()
  WHERE organization_id = target_organization_id AND profile_id = actor_id;
  UPDATE public.organization_members SET role = 'owner', updated_at = now()
  WHERE organization_id = target_organization_id AND profile_id = target_profile_id;
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, target_profile_id
  ) VALUES (target_organization_id, actor_id, 'organization.ownership_transferred', target_profile_id);
END;
$$;


ALTER FUNCTION "public"."transfer_organization_ownership"("target_organization_id" "uuid", "target_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unregister_push_device"("target_expo_push_token" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."unregister_push_device"("target_expo_push_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_appointment_status"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional_member boolean;
  actor_is_owner_client boolean;
  effective_cancelled_by_role text;
  effective_reason text;
  effective_min_hours integer;
  current_appointment public.appointments%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF new_status NOT IN ('confirmed', 'cancelled', 'completed') THEN RAISE EXCEPTION 'invalid_status_value'; END IF;

  SELECT * INTO current_appointment
  FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL
  FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.status IN ('cancelled', 'completed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin']);
  actor_is_professional_member := public.has_active_membership(
    current_appointment.establishment_id,
    ARRAY['professional', 'admin']
  );
  actor_is_owner_client := current_appointment.client_id = actor_id;

  IF new_status = 'confirmed' THEN
    IF current_appointment.status <> 'pending' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF new_status = 'completed' THEN
    IF current_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF current_appointment.date_time > now() THEN RAISE EXCEPTION 'appointment_not_yet_finished'; END IF;
  ELSE
    IF current_appointment.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT (actor_is_owner_client OR actor_is_professional_member) THEN RAISE EXCEPTION 'forbidden'; END IF;

    effective_reason := NULLIF(trim(COALESCE(new_cancellation_reason, '')), '');
    IF actor_is_owner_client AND NOT actor_is_professional_member THEN
      SELECT CASE
        WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0 THEN 24
        ELSE establishment.min_cancellation_hours
      END::integer
      INTO effective_min_hours
      FROM public.establishments AS establishment
      WHERE establishment.id = current_appointment.establishment_id;

      IF current_appointment.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;
      IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
        RAISE EXCEPTION 'cancellation_window_closed';
      END IF;
      IF effective_reason IS NULL OR effective_reason NOT IN (
        'Imprevisto de trabalho',
        'Questões de saúde',
        'Problema de transporte',
        'Vou reagendar',
        'Outro'
      ) THEN
        RAISE EXCEPTION 'invalid_cancellation_reason';
      END IF;
    END IF;

    IF actor_is_admin THEN effective_cancelled_by_role := 'admin';
    ELSIF actor_is_professional_member THEN effective_cancelled_by_role := 'professional';
    ELSE effective_cancelled_by_role := 'client';
    END IF;
  END IF;

  UPDATE public.appointments AS appointment
  SET
    status = new_status,
    cancellation_reason = CASE WHEN new_status = 'cancelled' THEN effective_reason ELSE appointment.cancellation_reason END,
    cancelled_by_role = CASE WHEN new_status = 'cancelled' THEN effective_cancelled_by_role ELSE appointment.cancelled_by_role END
  WHERE appointment.id = target_appointment_id;

  RETURN target_appointment_id;
END;
$$;


ALTER FUNCTION "public"."update_appointment_status"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_appointment_status_v2"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason_code" "text" DEFAULT NULL::"text", "new_cancellation_note_internal" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional_member boolean;
  actor_is_owner_client boolean;
  effective_cancelled_by_role text;
  effective_reason_code text;
  effective_min_hours integer;
  current_appointment public.appointments%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF new_status NOT IN ('confirmed', 'cancelled', 'completed') THEN RAISE EXCEPTION 'invalid_status_value'; END IF;

  SELECT * INTO current_appointment FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.status IN ('cancelled', 'completed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin']);
  actor_is_professional_member := public.has_active_membership(
    current_appointment.establishment_id, ARRAY['professional', 'admin']
  );
  actor_is_owner_client := current_appointment.client_id = actor_id;

  IF new_status = 'confirmed' THEN
    IF current_appointment.status <> 'pending' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF new_status = 'completed' THEN
    IF current_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF current_appointment.date_time > now() THEN RAISE EXCEPTION 'appointment_not_yet_finished'; END IF;
  ELSE
    IF current_appointment.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT (actor_is_owner_client OR actor_is_professional_member) THEN RAISE EXCEPTION 'forbidden'; END IF;

    IF actor_is_owner_client AND NOT actor_is_professional_member THEN
      IF new_cancellation_reason_code NOT IN (
        'client_work_conflict', 'client_health', 'client_transport', 'client_reschedule', 'client_other'
      ) THEN RAISE EXCEPTION 'invalid_cancellation_reason'; END IF;
      IF NULLIF(trim(COALESCE(new_cancellation_note_internal, '')), '') IS NOT NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
      SELECT CASE WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0
        THEN 24 ELSE establishment.min_cancellation_hours END::integer
      INTO effective_min_hours
      FROM public.establishments AS establishment
      WHERE establishment.id = current_appointment.establishment_id;
      IF current_appointment.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;
      IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
        RAISE EXCEPTION 'cancellation_window_closed';
      END IF;
      effective_reason_code := new_cancellation_reason_code;
    ELSE
      effective_reason_code := CASE WHEN actor_is_admin THEN 'establishment_cancelled' ELSE 'professional_cancelled' END;
    END IF;

    IF actor_is_admin THEN effective_cancelled_by_role := 'admin';
    ELSIF actor_is_professional_member THEN effective_cancelled_by_role := 'professional';
    ELSE effective_cancelled_by_role := 'client';
    END IF;
  END IF;

  UPDATE public.appointments AS appointment SET
    status = new_status,
    cancellation_reason_code = CASE WHEN new_status = 'cancelled' THEN effective_reason_code ELSE appointment.cancellation_reason_code END,
    cancellation_note_internal = CASE
      WHEN new_status = 'cancelled' AND (actor_is_admin OR actor_is_professional_member)
        THEN NULLIF(trim(COALESCE(new_cancellation_note_internal, '')), '')
      ELSE appointment.cancellation_note_internal
    END,
    cancellation_reason = CASE WHEN new_status = 'cancelled' THEN effective_reason_code ELSE appointment.cancellation_reason END,
    cancelled_by_role = CASE WHEN new_status = 'cancelled' THEN effective_cancelled_by_role ELSE appointment.cancelled_by_role END
  WHERE appointment.id = target_appointment_id;

  RETURN target_appointment_id;
END;
$$;


ALTER FUNCTION "public"."update_appointment_status_v2"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason_code" "text", "new_cancellation_note_internal" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_establishment_price_level"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  avg_price numeric(10,2);
  p_level integer;
  target_est_id uuid;
BEGIN
  target_est_id := COALESCE(NEW.establishment_id, OLD.establishment_id);

  SELECT COALESCE(AVG(price), 0)::numeric(10,2)
  INTO avg_price
  FROM public.services
  WHERE establishment_id = target_est_id
    AND is_active = true
    AND deleted_at IS NULL;

  IF avg_price < 40.00 THEN
    p_level := 1;
  ELSIF avg_price >= 40.00 AND avg_price <= 80.00 THEN
    p_level := 2;
  ELSE
    p_level := 3;
  END IF;

  UPDATE public.establishments
  SET average_price = avg_price,
      price_level = p_level
  WHERE id = target_est_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_establishment_price_level"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_establishment_ratings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  avg_rating numeric(3,2);
  cnt_reviews integer;
  target_est_id uuid;
BEGIN
  target_est_id := COALESCE(NEW.establishment_id, OLD.establishment_id);

  SELECT COALESCE(AVG(rating), 0)::numeric(3,2), COUNT(*)
  INTO avg_rating, cnt_reviews
  FROM public.establishment_reviews
  WHERE establishment_id = target_est_id;

  UPDATE public.establishments
  SET average_rating = avg_rating,
      review_count = cnt_reviews
  WHERE id = target_est_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_establishment_ratings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_governance_establishment_status"("target_establishment_id" "uuid", "target_status" "text", "target_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."update_governance_establishment_status"("target_establishment_id" "uuid", "target_status" "text", "target_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_client_avatar"("target_avatar_url" "text") RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "phone" "text", "avatar_url" "text", "notification_channels" "text"[], "lgpd_marketing_accepted" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'storage'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_url text := NULLIF(btrim(COALESCE(target_avatar_url, '')), '');
  expected_path text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  expected_path := '/storage/v1/object/public/client-avatars/' || actor_id::text || '/avatar';

  IF normalized_url IS NOT NULL THEN
    IF char_length(normalized_url) > 2048
      OR normalized_url !~ '^https://'
      OR position(expected_path IN normalized_url) = 0
      OR NOT public.is_safe_client_profile_text(normalized_url)
      OR NOT EXISTS (
        SELECT 1
        FROM storage.objects AS object
        WHERE object.bucket_id = 'client-avatars'
          AND object.name = actor_id::text || '/avatar'
      )
    THEN
      RAISE EXCEPTION 'invalid_avatar_url';
    END IF;
  END IF;

  UPDATE public.profiles AS profile
  SET avatar_url = normalized_url,
      updated_at = now()
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN QUERY SELECT * FROM public.get_my_client_profile();
END;
$$;


ALTER FUNCTION "public"."update_my_client_avatar"("target_avatar_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_client_preferences"("target_notification_channels" "text"[], "target_lgpd_marketing_accepted" boolean) RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "phone" "text", "avatar_url" "text", "notification_channels" "text"[], "lgpd_marketing_accepted" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_channels text[];
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(target_notification_channels, ARRAY[]::text[])) AS channel
    WHERE channel NOT IN ('email', 'whatsapp', 'push')
  ) THEN
    RAISE EXCEPTION 'invalid_notification_channel';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT channel ORDER BY channel), ARRAY[]::text[])
  INTO normalized_channels
  FROM unnest(COALESCE(target_notification_channels, ARRAY[]::text[])) AS channel;

  UPDATE public.profiles AS profile
  SET notification_channels = normalized_channels,
      lgpd_marketing_accepted = COALESCE(target_lgpd_marketing_accepted, false),
      updated_at = now()
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN QUERY SELECT * FROM public.get_my_client_profile();
END;
$$;


ALTER FUNCTION "public"."update_my_client_preferences"("target_notification_channels" "text"[], "target_lgpd_marketing_accepted" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_my_client_profile"("target_name" "text", "target_phone" "text") RETURNS TABLE("id" "uuid", "name" "text", "email" "text", "phone" "text", "avatar_url" "text", "notification_channels" "text"[], "lgpd_marketing_accepted" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_name text := btrim(COALESCE(target_name, ''));
  normalized_phone text := regexp_replace(COALESCE(target_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 80
    OR NOT public.is_safe_client_profile_text(normalized_name)
  THEN
    RAISE EXCEPTION 'invalid_profile_name';
  END IF;
  IF NOT public.is_safe_client_profile_text(COALESCE(target_phone, ''))
    OR (normalized_phone <> '' AND char_length(normalized_phone) NOT BETWEEN 10 AND 13)
  THEN
    RAISE EXCEPTION 'invalid_profile_phone';
  END IF;

  UPDATE public.profiles AS profile
  SET name = normalized_name,
      phone = NULLIF(normalized_phone, ''),
      updated_at = now()
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  RETURN QUERY SELECT * FROM public.get_my_client_profile();
END;
$$;


ALTER FUNCTION "public"."update_my_client_profile"("target_name" "text", "target_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_organization_member_role"("target_organization_id" "uuid", "target_profile_id" "uuid", "target_role" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF target_role NOT IN ('manager', 'finance') THEN RAISE EXCEPTION 'invalid_organization_role'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id AND role = 'owner' AND status = 'active'
  ) THEN RAISE EXCEPTION 'owner_role_requires_transfer'; END IF;

  UPDATE public.organization_members
  SET role = target_role, updated_at = now()
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_member_not_found'; END IF;

  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, target_profile_id, metadata
  ) VALUES (
    target_organization_id, actor_id, 'organization.member_role_updated',
    target_profile_id, jsonb_build_object('role', target_role)
  );
END;
$$;


ALTER FUNCTION "public"."update_organization_member_role"("target_organization_id" "uuid", "target_profile_id" "uuid", "target_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_my_professional_profile"("requested_slug" "text", "requested_bio" "text" DEFAULT NULL::"text", "requested_portfolio_url" "text" DEFAULT NULL::"text", "requested_instagram_url" "text" DEFAULT NULL::"text", "requested_gallery_urls" "jsonb" DEFAULT '[]'::"jsonb", "requested_is_public" boolean DEFAULT false) RETURNS TABLE("profile_id" "uuid", "profile_slug" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $_$
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

  UPDATE public.memberships AS membership
  SET professional_profile_id = generated_id, updated_at = now()
  WHERE membership.profile_id = (SELECT auth.uid())
    AND membership.role IN ('professional', 'admin')
    AND membership.status = 'active';

  INSERT INTO public.authorization_audit_log(actor_id, action, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'professional_profile.updated', (SELECT auth.uid()),
    jsonb_build_object('slug', normalized_slug, 'is_public', requested_is_public));

  RETURN QUERY SELECT generated_id, normalized_slug;
END;
$_$;


ALTER FUNCTION "public"."upsert_my_professional_profile"("requested_slug" "text", "requested_bio" "text", "requested_portfolio_url" "text", "requested_instagram_url" "text", "requested_gallery_urls" "jsonb", "requested_is_public" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."establishment_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "target_contact" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "public"."invite_status_enum" DEFAULT 'pending'::"public"."invite_status_enum",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "lgpd_accepted" boolean DEFAULT false,
    CONSTRAINT "establishment_invites_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'professional'::"text"])))
);


ALTER TABLE "public"."establishment_invites" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."active_establishment_invites" WITH ("security_invoker"='on') AS
 SELECT "id",
    "establishment_id",
    "target_contact",
    "role",
    "token_hash",
    "status",
    "created_by",
    "created_at",
    "expires_at",
    "accepted_by",
    "accepted_at",
    "revoked_at",
    "lgpd_accepted"
   FROM "public"."establishment_invites"
  WHERE (("status" = 'pending'::"public"."invite_status_enum") AND ("expires_at" > "now"()));


ALTER VIEW "public"."active_establishment_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."appointments" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "professional_id" "uuid" NOT NULL,
    "service_id" "text" NOT NULL,
    "date_time" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "deleted_at" timestamp with time zone,
    "client_name" "text",
    "cancellation_reason" "text",
    "cancelled_by_role" "text",
    "reschedule_count" integer DEFAULT 0 NOT NULL,
    "original_date_time" timestamp with time zone,
    "duration_minutes" integer DEFAULT 30 NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "cancellation_reason_code" "text",
    "cancellation_note_internal" "text",
    CONSTRAINT "appointments_cancellation_reason_code_check" CHECK ((("cancellation_reason_code" IS NULL) OR ("cancellation_reason_code" = ANY (ARRAY['client_work_conflict'::"text", 'client_health'::"text", 'client_transport'::"text", 'client_reschedule'::"text", 'client_other'::"text", 'establishment_cancelled'::"text", 'professional_cancelled'::"text"])))),
    CONSTRAINT "appointments_cancelled_by_role_check" CHECK (("cancelled_by_role" = ANY (ARRAY['client'::"text", 'professional'::"text", 'admin'::"text", 'barber'::"text"]))),
    CONSTRAINT "appointments_duration_minutes_check" CHECK ((("duration_minutes" >= 1) AND ("duration_minutes" <= 1440))),
    CONSTRAINT "appointments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'cancelled'::"text", 'completed'::"text"]))),
    CONSTRAINT "appointments_valid_time_range_check" CHECK (("ends_at" > "date_time"))
);

ALTER TABLE ONLY "public"."appointments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."appointments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."appointments"."cancellation_reason_code" IS 'Controlled public cancellation reason. Safe for role-appropriate presentation.';



COMMENT ON COLUMN "public"."appointments"."cancellation_note_internal" IS 'Internal administrative note. Never expose through client-facing RPCs or UI.';



CREATE TABLE IF NOT EXISTS "public"."authorization_audit_log" (
    "id" bigint NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "establishment_id" "uuid",
    "target_profile_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."authorization_audit_log" OWNER TO "postgres";


ALTER TABLE "public"."authorization_audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."authorization_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."client_push_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "push_device_id" "uuid" NOT NULL,
    "appointment_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "available_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_at" timestamp with time zone,
    "expo_ticket_id" "text",
    "ticketed_at" timestamp with time zone,
    "receipt_checked_at" timestamp with time zone,
    "sent_at" timestamp with time zone,
    "last_error_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "client_push_deliveries_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 5))),
    CONSTRAINT "client_push_deliveries_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 500))),
    CONSTRAINT "client_push_deliveries_event_type_check" CHECK (("event_type" = ANY (ARRAY['appointment_received'::"text", 'appointment_confirmed'::"text", 'appointment_rescheduled'::"text", 'appointment_cancelled'::"text", 'appointment_reminder'::"text"]))),
    CONSTRAINT "client_push_deliveries_payload_check" CHECK (("jsonb_typeof"("payload") = 'object'::"text")),
    CONSTRAINT "client_push_deliveries_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'ticketed'::"text", 'sent'::"text", 'failed'::"text", 'skipped'::"text"]))),
    CONSTRAINT "client_push_deliveries_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120)))
);


ALTER TABLE "public"."client_push_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."establishment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "requester_name" "text" NOT NULL,
    "requester_email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "primary_color" "text" DEFAULT '#F5A524'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "rejection_reason" "text",
    "establishment_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "document_number" "text",
    "document_type" "text",
    CONSTRAINT "establishment_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."establishment_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."establishment_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "appointment_id" "text" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "establishment_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."establishment_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."establishments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#D4AF37'::"text",
    "timezone" "text" DEFAULT 'America/Sao_Paulo'::"text" NOT NULL,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "description" "text",
    "address" "text",
    "phone" "text",
    "opening_hours" "text",
    "banner_url" "text",
    "slogan" "text",
    "instagram" "text",
    "share_agendas" boolean DEFAULT true,
    "gallery_urls" "text",
    "document_number" "text",
    "document_type" "text",
    "verification_level" integer DEFAULT 1,
    "account_status" "text" DEFAULT 'pending_verification'::"text",
    "whatsapp_verified" boolean DEFAULT false,
    "email_verified" boolean DEFAULT false,
    "kyc_status" "text" DEFAULT 'unsubmitted'::"text",
    "kyc_document_url" "text",
    "average_rating" numeric(3,2) DEFAULT 0.00 NOT NULL,
    "review_count" integer DEFAULT 0 NOT NULL,
    "average_price" numeric(10,2) DEFAULT 0.00 NOT NULL,
    "price_level" integer DEFAULT 1 NOT NULL,
    "instant_booking_enabled" boolean DEFAULT true NOT NULL,
    "min_cancellation_hours" integer DEFAULT 24,
    "no_show_fee_percent" numeric DEFAULT 0.00,
    "latitude" double precision,
    "longitude" double precision,
    "professional_pix_allowed" boolean DEFAULT true NOT NULL,
    "kyc_document_path" "text",
    CONSTRAINT "establishments_account_status_check" CHECK (("account_status" = ANY (ARRAY['pending_verification'::"text", 'active'::"text", 'delinquent'::"text", 'blocked'::"text"]))),
    CONSTRAINT "establishments_document_type_check" CHECK (("document_type" = ANY (ARRAY['CPF'::"text", 'CNPJ'::"text"]))),
    CONSTRAINT "establishments_kyc_status_check" CHECK (("kyc_status" = ANY (ARRAY['unsubmitted'::"text", 'pending'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "establishments_verification_level_check" CHECK ((("verification_level" >= 1) AND ("verification_level" <= 3)))
);

ALTER TABLE ONLY "public"."establishments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."establishments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_kb_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "reply_id" "uuid",
    "storage_path" "text" NOT NULL,
    "original_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "size_bytes" bigint NOT NULL,
    "width" integer,
    "height" integer,
    "alt_text" "text" NOT NULL,
    "upload_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "governance_kb_attachments_alt_text_check" CHECK ((("char_length"("btrim"("alt_text")) >= 3) AND ("char_length"("btrim"("alt_text")) <= 240))),
    CONSTRAINT "governance_kb_attachments_height_check" CHECK ((("height" IS NULL) OR ("height" > 0))),
    CONSTRAINT "governance_kb_attachments_mime_type_check" CHECK (("mime_type" = ANY (ARRAY['image/jpeg'::"text", 'image/png'::"text", 'image/webp'::"text"]))),
    CONSTRAINT "governance_kb_attachments_original_name_check" CHECK ((("char_length"("btrim"("original_name")) >= 1) AND ("char_length"("btrim"("original_name")) <= 255))),
    CONSTRAINT "governance_kb_attachments_size_bytes_check" CHECK ((("size_bytes" > 0) AND ("size_bytes" <= 5242880))),
    CONSTRAINT "governance_kb_attachments_upload_status_check" CHECK (("upload_status" = ANY (ARRAY['pending'::"text", 'ready'::"text", 'failed'::"text"]))),
    CONSTRAINT "governance_kb_attachments_width_check" CHECK ((("width" IS NULL) OR ("width" > 0)))
);


ALTER TABLE "public"."governance_kb_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_kb_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "governance_kb_categories_name_check" CHECK ((("char_length"("btrim"("name")) >= 2) AND ("char_length"("btrim"("name")) <= 80))),
    CONSTRAINT "governance_kb_categories_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text"))
);


ALTER TABLE "public"."governance_kb_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_kb_replies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "topic_id" "uuid" NOT NULL,
    "body_markdown" "text" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "last_change_summary" "text",
    "published_at" timestamp with time zone,
    "removed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "governance_kb_replies_body_markdown_check" CHECK ((("char_length"("btrim"("body_markdown")) >= 1) AND ("char_length"("btrim"("body_markdown")) <= 30000))),
    CONSTRAINT "governance_kb_replies_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'removed'::"text"]))),
    CONSTRAINT "governance_kb_replies_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."governance_kb_replies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_kb_revisions" (
    "id" bigint NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "revision_number" integer NOT NULL,
    "snapshot" "jsonb" NOT NULL,
    "changed_by" "uuid",
    "change_summary" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "governance_kb_revisions_change_summary_check" CHECK ((("char_length"("btrim"("change_summary")) >= 3) AND ("char_length"("btrim"("change_summary")) <= 240))),
    CONSTRAINT "governance_kb_revisions_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['topic'::"text", 'reply'::"text"]))),
    CONSTRAINT "governance_kb_revisions_revision_number_check" CHECK (("revision_number" > 0))
);


ALTER TABLE "public"."governance_kb_revisions" OWNER TO "postgres";


ALTER TABLE "public"."governance_kb_revisions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."governance_kb_revisions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."governance_kb_topics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body_markdown" "text" DEFAULT ''::"text" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "publication_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "resolution_status" "text",
    "author_id" "uuid",
    "accepted_reply_id" "uuid",
    "is_official" boolean DEFAULT false NOT NULL,
    "is_pinned" boolean DEFAULT false NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "version" integer DEFAULT 1 NOT NULL,
    "last_change_summary" "text",
    "published_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "search_document" "tsvector" GENERATED ALWAYS AS ((("setweight"("to_tsvector"('"portuguese"'::"regconfig", COALESCE("title", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"portuguese"'::"regconfig", COALESCE("body_markdown", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"portuguese"'::"regconfig", COALESCE("public"."immutable_array_to_string"("tags", ' '::"text"), ''::"text")), 'C'::"char"))) STORED,
    CONSTRAINT "governance_kb_topics_body_markdown_check" CHECK (("char_length"("body_markdown") <= 50000)),
    CONSTRAINT "governance_kb_topics_kind_check" CHECK (("kind" = ANY (ARRAY['question'::"text", 'guide'::"text", 'procedure'::"text", 'decision'::"text", 'incident'::"text"]))),
    CONSTRAINT "governance_kb_topics_publication_status_check" CHECK (("publication_status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"]))),
    CONSTRAINT "governance_kb_topics_resolution_check" CHECK (((("kind" = ANY (ARRAY['question'::"text", 'incident'::"text"])) AND ("resolution_status" = ANY (ARRAY['open'::"text", 'resolved'::"text"]))) OR (("kind" <> ALL (ARRAY['question'::"text", 'incident'::"text"])) AND ("resolution_status" IS NULL)))),
    CONSTRAINT "governance_kb_topics_resolution_status_check" CHECK (("resolution_status" = ANY (ARRAY['open'::"text", 'resolved'::"text"]))),
    CONSTRAINT "governance_kb_topics_slug_check" CHECK (("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::"text")),
    CONSTRAINT "governance_kb_topics_title_check" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 160))),
    CONSTRAINT "governance_kb_topics_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."governance_kb_topics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."governance_verification_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "reviewer_id" "uuid",
    "document_path" "text",
    "previous_status" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "governance_verification_reviews_decision_check" CHECK (("decision" = ANY (ARRAY['submitted'::"text", 'approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "governance_verification_reviews_reason_check" CHECK ((("char_length"("btrim"("reason")) >= 10) AND ("char_length"("btrim"("reason")) <= 500)))
);


ALTER TABLE "public"."governance_verification_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."identity_migration_conflicts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "legacy_source" "text" NOT NULL,
    "legacy_record_id" "uuid",
    "legal_entity_id" "uuid",
    "organization_id" "uuid",
    "requester_profile_id" "uuid",
    "document_type" "text",
    "document_last4" "text",
    "reason_code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolution_reason" "text",
    "resolved_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "identity_migration_conflicts_document_last4_check" CHECK ((("document_last4" IS NULL) OR ("document_last4" ~ '^[A-Z0-9]{4}$'::"text"))),
    CONSTRAINT "identity_migration_conflicts_document_type_check" CHECK (("document_type" = ANY (ARRAY['CPF'::"text", 'CNPJ'::"text"]))),
    CONSTRAINT "identity_migration_conflicts_legacy_source_check" CHECK (("legacy_source" = ANY (ARRAY['establishment'::"text", 'establishment_request'::"text", 'manual'::"text"]))),
    CONSTRAINT "identity_migration_conflicts_reason_code_check" CHECK (("reason_code" = ANY (ARRAY['secure_backfill_required'::"text", 'invalid_legacy_document'::"text", 'ambiguous_owner'::"text", 'document_claimed_by_another_profile'::"text", 'document_claimed_by_another_organization'::"text"]))),
    CONSTRAINT "identity_migration_conflicts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'linked'::"text", 'rejected'::"text", 'evidence_requested'::"text"])))
);


ALTER TABLE "public"."identity_migration_conflicts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revocation_reason" "text",
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'professional'::"text"]))),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."legal_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "document_type" "text" NOT NULL,
    "document_fingerprint" "text" NOT NULL,
    "encrypted_document" "text" NOT NULL,
    "encryption_iv" "text" NOT NULL,
    "encryption_key_version" "text" NOT NULL,
    "document_last4" "text" NOT NULL,
    "verification_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "legal_entities_check" CHECK (((("entity_type" = 'person'::"text") AND ("document_type" = 'CPF'::"text")) OR (("entity_type" = 'company'::"text") AND ("document_type" = 'CNPJ'::"text")))),
    CONSTRAINT "legal_entities_document_fingerprint_check" CHECK (("document_fingerprint" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "legal_entities_document_last4_check" CHECK (("document_last4" ~ '^[A-Z0-9]{4}$'::"text")),
    CONSTRAINT "legal_entities_document_type_check" CHECK (("document_type" = ANY (ARRAY['CPF'::"text", 'CNPJ'::"text"]))),
    CONSTRAINT "legal_entities_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['person'::"text", 'company'::"text"]))),
    CONSTRAINT "legal_entities_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'disputed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."legal_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "commission_rate" numeric DEFAULT 0.50 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "revocation_reason" "text",
    "professional_profile_id" "uuid",
    CONSTRAINT "memberships_commission_rate_check" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric))),
    CONSTRAINT "memberships_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'professional'::"text"]))),
    CONSTRAINT "memberships_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_audit_log" (
    "id" bigint NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "establishment_id" "uuid",
    "target_profile_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organization_audit_log" OWNER TO "postgres";


ALTER TABLE "public"."organization_audit_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."organization_audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."organization_billing_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "billing_email" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legal_entity_id" "uuid",
    CONSTRAINT "organization_billing_accounts_display_name_check" CHECK ((("char_length"("btrim"("display_name")) >= 2) AND ("char_length"("btrim"("display_name")) <= 120))),
    CONSTRAINT "organization_billing_accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."organization_billing_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_billing_events" (
    "id" bigint NOT NULL,
    "billing_account_id" "uuid" NOT NULL,
    "subscription_id" "uuid",
    "invoice_id" "uuid",
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."organization_billing_events" OWNER TO "postgres";


ALTER TABLE "public"."organization_billing_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."organization_billing_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."organization_billing_invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "due_date" "date" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "currency" "text" NOT NULL,
    "subtotal_cents" integer NOT NULL,
    "discount_cents" integer NOT NULL,
    "total_cents" integer NOT NULL,
    "unit_snapshot" "jsonb" NOT NULL,
    "plan_snapshot" "jsonb" NOT NULL,
    "issued_by" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_billing_invoices_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text")),
    CONSTRAINT "organization_billing_invoices_discount_cents_check" CHECK (("discount_cents" >= 0)),
    CONSTRAINT "organization_billing_invoices_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'open'::"text", 'paid'::"text", 'void'::"text", 'overdue'::"text"]))),
    CONSTRAINT "organization_billing_invoices_subtotal_cents_check" CHECK (("subtotal_cents" >= 0)),
    CONSTRAINT "organization_billing_invoices_total_cents_check" CHECK (("total_cents" >= 0))
);


ALTER TABLE "public"."organization_billing_invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_billing_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "base_price_cents" integer,
    "currency" "text" DEFAULT 'BRL'::"text" NOT NULL,
    "is_network" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_billing_plans_base_price_cents_check" CHECK ((("base_price_cents" IS NULL) OR ("base_price_cents" >= 0))),
    CONSTRAINT "organization_billing_plans_code_check" CHECK (("code" ~ '^[a-z0-9_]+$'::"text")),
    CONSTRAINT "organization_billing_plans_currency_check" CHECK (("currency" ~ '^[A-Z]{3}$'::"text"))
);


ALTER TABLE "public"."organization_billing_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_establishments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "effective_from" "date" DEFAULT CURRENT_DATE NOT NULL,
    "effective_until" "date",
    "linked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_establishments_check" CHECK ((("effective_until" IS NULL) OR ("effective_until" >= "effective_from"))),
    CONSTRAINT "organization_establishments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."organization_establishments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "invited_email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token_hash" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_by" "uuid" NOT NULL,
    "accepted_by" "uuid",
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_invitations_role_check" CHECK (("role" = ANY (ARRAY['manager'::"text", 'finance'::"text"]))),
    CONSTRAINT "organization_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'revoked'::"text", 'expired'::"text"]))),
    CONSTRAINT "organization_invitations_token_hash_check" CHECK (("token_hash" ~ '^[0-9a-f]{64}$'::"text"))
);


ALTER TABLE "public"."organization_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_legal_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "legal_entity_id" "uuid" NOT NULL,
    "relationship" "text" DEFAULT 'primary_holder'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "organization_legal_entities_relationship_check" CHECK (("relationship" = 'primary_holder'::"text")),
    CONSTRAINT "organization_legal_entities_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."organization_legal_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "organization_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'manager'::"text", 'finance'::"text"]))),
    CONSTRAINT "organization_members_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "billing_account_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "enforcement_enabled" boolean DEFAULT false NOT NULL,
    "current_period_start" "date" DEFAULT CURRENT_DATE NOT NULL,
    "current_period_end" "date" DEFAULT (CURRENT_DATE + 30) NOT NULL,
    "grace_ends_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_subscriptions_check" CHECK (("current_period_end" >= "current_period_start")),
    CONSTRAINT "organization_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'suspended'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."organization_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organizations_name_check" CHECK ((("char_length"("btrim"("name")) >= 2) AND ("char_length"("btrim"("name")) <= 120))),
    CONSTRAINT "organizations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_unit_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "unit_from" integer NOT NULL,
    "unit_to" integer,
    "percentage_basis_points" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_unit_tiers_check" CHECK ((("unit_to" IS NULL) OR ("unit_to" >= "unit_from"))),
    CONSTRAINT "plan_unit_tiers_percentage_basis_points_check" CHECK ((("percentage_basis_points" >= 0) AND ("percentage_basis_points" <= 10000))),
    CONSTRAINT "plan_unit_tiers_unit_from_check" CHECK (("unit_from" > 0))
);


ALTER TABLE "public"."plan_unit_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "bio" "text",
    "portfolio_url" "text",
    "instagram_url" "text",
    "gallery_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "professional_profiles_bio_check" CHECK (("char_length"(COALESCE("bio", ''::"text")) <= 1000)),
    CONSTRAINT "professional_profiles_gallery_check" CHECK ("public"."is_valid_professional_gallery"("gallery_urls")),
    CONSTRAINT "professional_profiles_safe_urls_check" CHECK (("public"."is_safe_public_url"("portfolio_url") AND "public"."is_safe_public_url"("instagram_url"))),
    CONSTRAINT "professional_profiles_slug_check" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]{2,62}$'::"text"))
);


ALTER TABLE "public"."professional_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."professional_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "service_id" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "duration_minutes" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

ALTER TABLE ONLY "public"."professional_services" REPLICA IDENTITY FULL;


ALTER TABLE "public"."professional_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_establishments" (
    "profile_id" "uuid" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "profile_establishments_role_check" CHECK (("role" = ANY (ARRAY['client'::"text", 'professional'::"text", 'admin'::"text", 'barber'::"text"])))
);

ALTER TABLE ONLY "public"."profile_establishments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profile_establishments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_legal_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "legal_entity_id" "uuid" NOT NULL,
    "relationship" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "profile_legal_entities_relationship_check" CHECK (("relationship" = ANY (ARRAY['owner'::"text", 'representative'::"text"]))),
    CONSTRAINT "profile_legal_entities_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."profile_legal_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "establishment_id" "uuid",
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "email" "text" NOT NULL,
    "phone" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "deleted_at" timestamp with time zone,
    "instagram" "text",
    "specialties" "text",
    "work_hours" "text",
    "commission_rate" numeric DEFAULT 0.50,
    "push_token" "text",
    "titulo_profissional" "text",
    "lgpd_terms_accepted" boolean DEFAULT false,
    "lgpd_marketing_accepted" boolean DEFAULT false,
    "lgpd_accepted_at" timestamp with time zone,
    "notification_channels" "text"[] DEFAULT ARRAY['whatsapp'::"text"] NOT NULL,
    "pix_key" "text",
    CONSTRAINT "profiles_notification_channels_allowed" CHECK ((("notification_channels" <@ ARRAY['email'::"text", 'whatsapp'::"text", 'push'::"text"]) AND ("array_position"("notification_channels", NULL::"text") IS NULL) AND (NOT "public"."text_array_has_duplicates"("notification_channels")))),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['client'::"text", 'professional'::"text", 'admin'::"text", 'barber'::"text"])))
);

ALTER TABLE ONLY "public"."profiles" REPLICA IDENTITY FULL;


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "app_kind" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_devices_app_kind_check" CHECK (("app_kind" = ANY (ARRAY['client'::"text", 'business'::"text"]))),
    CONSTRAINT "push_devices_platform_check" CHECK (("platform" = ANY (ARRAY['android'::"text", 'ios'::"text"])))
);


ALTER TABLE "public"."push_devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_blocks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "professional_id" "uuid" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "kind" "text" NOT NULL,
    "reason" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "schedule_blocks_kind_check" CHECK (("kind" = ANY (ARRAY['break'::"text", 'time_off'::"text", 'blocked'::"text"]))),
    CONSTRAINT "schedule_blocks_max_period" CHECK (("ends_at" <= ("starts_at" + '31 days'::interval))),
    CONSTRAINT "schedule_blocks_reason_check" CHECK ((("reason" IS NULL) OR ("char_length"("reason") <= 160))),
    CONSTRAINT "schedule_blocks_valid_period" CHECK (("ends_at" > "starts_at"))
);


ALTER TABLE "public"."schedule_blocks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."security_audit_logs" (
    "id" bigint NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "changes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "client_ip" "text" DEFAULT COALESCE((("current_setting"('request.headers'::"text", true))::"jsonb" ->> 'x-forwarded-for'::"text"), 'unknown'::"text") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."security_audit_logs" OWNER TO "postgres";


ALTER TABLE "public"."security_audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."security_audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "duration_minutes" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "deleted_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY "public"."services" REPLICA IDENTITY FULL;


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "establishment_id" "uuid" NOT NULL,
    "effective_from" "date" NOT NULL,
    "effective_until" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscription_units_check" CHECK ((("effective_until" IS NULL) OR ("effective_until" >= "effective_from")))
);


ALTER TABLE "public"."subscription_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."superadmins" (
    "profile_id" "uuid" NOT NULL,
    "granted_by" "uuid",
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."superadmins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_shifts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_shifts_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."work_shifts" OWNER TO "postgres";


ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_no_professional_overlap" EXCLUDE USING "gist" ("professional_id" WITH =, "tstzrange"("date_time", "ends_at", '[)'::"text") WITH &&) WHERE ((("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text"])) AND ("deleted_at" IS NULL))) DEFERRABLE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."authorization_audit_log"
    ADD CONSTRAINT "authorization_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_services"
    ADD CONSTRAINT "barber_services_barber_id_service_id_key" UNIQUE ("professional_id", "service_id");



ALTER TABLE ONLY "public"."professional_services"
    ADD CONSTRAINT "barber_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."establishments"
    ADD CONSTRAINT "barbershops_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."establishments"
    ADD CONSTRAINT "barbershops_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."client_push_deliveries"
    ADD CONSTRAINT "client_push_deliveries_event_key_push_device_id_key" UNIQUE ("event_key", "push_device_id");



ALTER TABLE ONLY "public"."client_push_deliveries"
    ADD CONSTRAINT "client_push_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."establishment_invites"
    ADD CONSTRAINT "establishment_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."establishment_invites"
    ADD CONSTRAINT "establishment_invites_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."establishment_requests"
    ADD CONSTRAINT "establishment_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."establishment_reviews"
    ADD CONSTRAINT "establishment_reviews_appointment_id_key" UNIQUE ("appointment_id");



ALTER TABLE ONLY "public"."establishment_reviews"
    ADD CONSTRAINT "establishment_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_kb_attachments"
    ADD CONSTRAINT "governance_kb_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_kb_attachments"
    ADD CONSTRAINT "governance_kb_attachments_storage_path_key" UNIQUE ("storage_path");



ALTER TABLE ONLY "public"."governance_kb_categories"
    ADD CONSTRAINT "governance_kb_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_kb_categories"
    ADD CONSTRAINT "governance_kb_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."governance_kb_replies"
    ADD CONSTRAINT "governance_kb_replies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_kb_revisions"
    ADD CONSTRAINT "governance_kb_revisions_entity_type_entity_id_revision_numb_key" UNIQUE ("entity_type", "entity_id", "revision_number");



ALTER TABLE ONLY "public"."governance_kb_revisions"
    ADD CONSTRAINT "governance_kb_revisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_kb_topics"
    ADD CONSTRAINT "governance_kb_topics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_kb_topics"
    ADD CONSTRAINT "governance_kb_topics_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."governance_privacy_requests"
    ADD CONSTRAINT "governance_privacy_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."governance_users"
    ADD CONSTRAINT "governance_users_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."governance_verification_reviews"
    ADD CONSTRAINT "governance_verification_reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."identity_migration_conflicts"
    ADD CONSTRAINT "identity_migration_conflicts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_document_fingerprint_key" UNIQUE ("document_fingerprint");



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_profile_id_establishment_id_key" UNIQUE ("profile_id", "establishment_id");



ALTER TABLE ONLY "public"."organization_audit_log"
    ADD CONSTRAINT "organization_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_billing_accounts"
    ADD CONSTRAINT "organization_billing_accounts_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_billing_accounts"
    ADD CONSTRAINT "organization_billing_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_billing_events"
    ADD CONSTRAINT "organization_billing_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_billing_invoices"
    ADD CONSTRAINT "organization_billing_invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_billing_invoices"
    ADD CONSTRAINT "organization_billing_invoices_subscription_id_period_start__key" UNIQUE ("subscription_id", "period_start", "period_end");



ALTER TABLE ONLY "public"."organization_billing_plans"
    ADD CONSTRAINT "organization_billing_plans_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."organization_billing_plans"
    ADD CONSTRAINT "organization_billing_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_establishments"
    ADD CONSTRAINT "organization_establishments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_token_hash_key" UNIQUE ("token_hash");



ALTER TABLE ONLY "public"."organization_legal_entities"
    ADD CONSTRAINT "organization_legal_entities_organization_id_legal_entity_id_key" UNIQUE ("organization_id", "legal_entity_id");



ALTER TABLE ONLY "public"."organization_legal_entities"
    ADD CONSTRAINT "organization_legal_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_profile_id_key" UNIQUE ("organization_id", "profile_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_billing_account_id_key" UNIQUE ("billing_account_id");



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_unit_tiers"
    ADD CONSTRAINT "plan_unit_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_unit_tiers"
    ADD CONSTRAINT "plan_unit_tiers_plan_id_unit_from_key" UNIQUE ("plan_id", "unit_from");



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."profile_establishments"
    ADD CONSTRAINT "profile_barbershops_pkey" PRIMARY KEY ("profile_id", "establishment_id");



ALTER TABLE ONLY "public"."profile_legal_entities"
    ADD CONSTRAINT "profile_legal_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_legal_entities"
    ADD CONSTRAINT "profile_legal_entities_profile_id_legal_entity_id_key" UNIQUE ("profile_id", "legal_entity_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_units"
    ADD CONSTRAINT "subscription_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_units"
    ADD CONSTRAINT "subscription_units_subscription_id_establishment_id_effecti_key" UNIQUE ("subscription_id", "establishment_id", "effective_from");



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."work_shifts"
    ADD CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."work_shifts"
    ADD CONSTRAINT "work_shifts_profile_id_day_of_week_key" UNIQUE ("profile_id", "day_of_week");



CREATE INDEX "client_push_deliveries_pending_idx" ON "public"."client_push_deliveries" USING "btree" ("available_at", "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "client_push_deliveries_receipts_idx" ON "public"."client_push_deliveries" USING "btree" ("ticketed_at", "receipt_checked_at") WHERE ("status" = 'ticketed'::"text");



CREATE INDEX "establishment_invites_contact_idx" ON "public"."establishment_invites" USING "btree" ("lower"("target_contact"), "status");



CREATE INDEX "establishment_invites_establishment_idx" ON "public"."establishment_invites" USING "btree" ("establishment_id", "status");



CREATE UNIQUE INDEX "establishment_requests_pending_slug_idx" ON "public"."establishment_requests" USING "btree" ("lower"("slug")) WHERE ("status" = 'pending'::"text");



CREATE INDEX "governance_kb_attachments_topic_idx" ON "public"."governance_kb_attachments" USING "btree" ("topic_id", "upload_status", "created_at");



CREATE INDEX "governance_kb_replies_topic_idx" ON "public"."governance_kb_replies" USING "btree" ("topic_id", "status", "created_at");



CREATE INDEX "governance_kb_revisions_entity_idx" ON "public"."governance_kb_revisions" USING "btree" ("entity_type", "entity_id", "revision_number" DESC);



CREATE INDEX "governance_kb_topics_category_idx" ON "public"."governance_kb_topics" USING "btree" ("category_id", "updated_at" DESC);



CREATE INDEX "governance_kb_topics_listing_idx" ON "public"."governance_kb_topics" USING "btree" ("publication_status", "is_pinned" DESC, "updated_at" DESC);



CREATE INDEX "governance_kb_topics_search_idx" ON "public"."governance_kb_topics" USING "gin" ("search_document");



CREATE UNIQUE INDEX "governance_privacy_requests_active_profile_idx" ON "public"."governance_privacy_requests" USING "btree" ("target_profile_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'failed'::"text"]));



CREATE INDEX "governance_privacy_requests_status_idx" ON "public"."governance_privacy_requests" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "governance_verification_reviews_establishment_idx" ON "public"."governance_verification_reviews" USING "btree" ("establishment_id", "created_at" DESC);



CREATE UNIQUE INDEX "identity_migration_conflicts_legacy_pending_idx" ON "public"."identity_migration_conflicts" USING "btree" ("legacy_source", "legacy_record_id") WHERE (("status" = 'pending'::"text") AND ("legacy_record_id" IS NOT NULL));



CREATE INDEX "idx_appointments_barber" ON "public"."appointments" USING "btree" ("professional_id");



CREATE INDEX "idx_appointments_barbershop" ON "public"."appointments" USING "btree" ("establishment_id");



CREATE INDEX "idx_appointments_client" ON "public"."appointments" USING "btree" ("client_id");



CREATE INDEX "idx_appointments_date" ON "public"."appointments" USING "btree" ("date_time");



CREATE INDEX "idx_profiles_barbershop" ON "public"."profiles" USING "btree" ("establishment_id");



CREATE INDEX "idx_services_barbershop" ON "public"."services" USING "btree" ("establishment_id");



CREATE INDEX "invitations_email_idx" ON "public"."invitations" USING "btree" ("lower"("invited_email"), "status");



CREATE INDEX "invitations_establishment_idx" ON "public"."invitations" USING "btree" ("establishment_id", "status");



CREATE INDEX "memberships_establishment_idx" ON "public"."memberships" USING "btree" ("establishment_id", "role", "status");



CREATE INDEX "memberships_professional_profile_idx" ON "public"."memberships" USING "btree" ("professional_profile_id") WHERE ("professional_profile_id" IS NOT NULL);



CREATE INDEX "memberships_profile_idx" ON "public"."memberships" USING "btree" ("profile_id", "status");



CREATE INDEX "organization_audit_org_created_idx" ON "public"."organization_audit_log" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "organization_billing_accounts_legal_entity_idx" ON "public"."organization_billing_accounts" USING "btree" ("legal_entity_id") WHERE ("legal_entity_id" IS NOT NULL);



CREATE INDEX "organization_billing_events_account_created_idx" ON "public"."organization_billing_events" USING "btree" ("billing_account_id", "created_at" DESC);



CREATE UNIQUE INDEX "organization_establishments_one_active_group_idx" ON "public"."organization_establishments" USING "btree" ("establishment_id") WHERE (("status" = 'active'::"text") AND ("effective_until" IS NULL));



CREATE INDEX "organization_establishments_org_idx" ON "public"."organization_establishments" USING "btree" ("organization_id", "status");



CREATE UNIQUE INDEX "organization_invitations_pending_email_idx" ON "public"."organization_invitations" USING "btree" ("organization_id", "lower"("invited_email")) WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "organization_legal_entities_entity_one_active_org_idx" ON "public"."organization_legal_entities" USING "btree" ("legal_entity_id") WHERE (("relationship" = 'primary_holder'::"text") AND ("status" = 'active'::"text"));



CREATE UNIQUE INDEX "organization_legal_entities_one_active_holder_idx" ON "public"."organization_legal_entities" USING "btree" ("organization_id") WHERE (("relationship" = 'primary_holder'::"text") AND ("status" = 'active'::"text"));



CREATE INDEX "organization_members_profile_idx" ON "public"."organization_members" USING "btree" ("profile_id", "status");



CREATE INDEX "professional_profiles_slug_idx" ON "public"."professional_profiles" USING "btree" ("slug") WHERE ("is_public" = true);



CREATE INDEX "push_devices_profile_app_idx" ON "public"."push_devices" USING "btree" ("profile_id", "app_kind", "enabled");



CREATE INDEX "schedule_blocks_establishment_period_idx" ON "public"."schedule_blocks" USING "btree" ("establishment_id", "starts_at", "ends_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "schedule_blocks_professional_period_idx" ON "public"."schedule_blocks" USING "btree" ("professional_id", "starts_at", "ends_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "services_establishment_sort_idx" ON "public"."services" USING "btree" ("establishment_id", "sort_order", "name") WHERE ("deleted_at" IS NULL);



CREATE OR REPLACE TRIGGER "audit_establishments_status" AFTER UPDATE OF "account_status" ON "public"."establishments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_governance_actions"();



CREATE OR REPLACE TRIGGER "audit_governance_users" AFTER INSERT OR DELETE OR UPDATE ON "public"."governance_users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_governance_actions"();



CREATE OR REPLACE TRIGGER "audit_membership_changes" AFTER INSERT OR UPDATE OF "role", "commission_rate", "status" ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."audit_membership_change"();



CREATE OR REPLACE TRIGGER "authorization_audit_log_immutable" BEFORE DELETE OR UPDATE ON "public"."authorization_audit_log" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_authorization_audit_mutation"();



CREATE OR REPLACE TRIGGER "enqueue_client_appointment_push_trigger" AFTER INSERT OR UPDATE OF "status", "date_time", "professional_id", "service_id", "reschedule_count", "deleted_at" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_client_appointment_push"();



CREATE OR REPLACE TRIGGER "governance_kb_audit_reply_insert_trigger" AFTER INSERT ON "public"."governance_kb_replies" FOR EACH ROW EXECUTE FUNCTION "public"."governance_kb_audit_reply_insert"();



CREATE OR REPLACE TRIGGER "governance_kb_audit_topic_insert_trigger" AFTER INSERT ON "public"."governance_kb_topics" FOR EACH ROW EXECUTE FUNCTION "public"."governance_kb_audit_topic_insert"();



CREATE OR REPLACE TRIGGER "governance_kb_guard_reply_update_trigger" BEFORE UPDATE ON "public"."governance_kb_replies" FOR EACH ROW EXECUTE FUNCTION "public"."governance_kb_guard_reply_update"();



CREATE OR REPLACE TRIGGER "governance_kb_guard_topic_update_trigger" BEFORE UPDATE ON "public"."governance_kb_topics" FOR EACH ROW EXECUTE FUNCTION "public"."governance_kb_guard_topic_update"();



CREATE OR REPLACE TRIGGER "governance_kb_touch_category_trigger" BEFORE UPDATE ON "public"."governance_kb_categories" FOR EACH ROW EXECUTE FUNCTION "public"."governance_kb_touch_category"();



CREATE OR REPLACE TRIGGER "governance_kb_validate_attachment_trigger" BEFORE INSERT OR UPDATE ON "public"."governance_kb_attachments" FOR EACH ROW EXECUTE FUNCTION "public"."governance_kb_validate_attachment"();



CREATE OR REPLACE TRIGGER "guard_governance_status_change" BEFORE UPDATE OF "account_status" ON "public"."establishments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_governance_status_change"();



CREATE OR REPLACE TRIGGER "guard_governance_user_direct_write" BEFORE INSERT OR DELETE OR UPDATE ON "public"."governance_users" FOR EACH ROW EXECUTE FUNCTION "public"."guard_governance_user_direct_write"();



CREATE OR REPLACE TRIGGER "guard_legacy_kyc_url" BEFORE INSERT OR UPDATE OF "kyc_document_url" ON "public"."establishments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_legacy_kyc_url"();



CREATE OR REPLACE TRIGGER "legacy_establishment_document_read_only" BEFORE INSERT OR UPDATE OF "document_number", "document_type" ON "public"."establishments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_legacy_establishment_document"();



CREATE OR REPLACE TRIGGER "legacy_establishment_request_document_read_only" BEFORE INSERT OR UPDATE OF "document_number", "document_type" ON "public"."establishment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."guard_legacy_establishment_document"();



CREATE OR REPLACE TRIGGER "link_professional_profile_membership" BEFORE INSERT OR UPDATE OF "role", "status" ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."link_professional_profile_to_membership"();



CREATE OR REPLACE TRIGGER "normalize_establishment_phone_e164" BEFORE INSERT OR UPDATE OF "phone" ON "public"."establishments" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_phone_column"();



CREATE OR REPLACE TRIGGER "normalize_profile_phone_e164" BEFORE INSERT OR UPDATE OF "phone" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_phone_column"();



CREATE OR REPLACE TRIGGER "prevent_service_history_deletion" BEFORE DELETE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_service_history_deletion"();



CREATE OR REPLACE TRIGGER "protect_profile_authorization_fields" BEFORE UPDATE OF "role", "establishment_id", "commission_rate" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_authorization_fields"();



CREATE OR REPLACE TRIGGER "require_aal2_organization_billing_accounts" BEFORE INSERT OR DELETE OR UPDATE ON "public"."organization_billing_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sensitive_authenticated_mutation"();



CREATE OR REPLACE TRIGGER "require_aal2_organization_billing_invoices" BEFORE INSERT OR DELETE OR UPDATE ON "public"."organization_billing_invoices" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sensitive_authenticated_mutation"();



CREATE OR REPLACE TRIGGER "require_aal2_organization_establishments" BEFORE INSERT OR DELETE OR UPDATE ON "public"."organization_establishments" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sensitive_authenticated_mutation"();



CREATE OR REPLACE TRIGGER "require_aal2_organization_invitations" BEFORE INSERT OR DELETE OR UPDATE ON "public"."organization_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sensitive_authenticated_mutation"();



CREATE OR REPLACE TRIGGER "require_aal2_organization_members" BEFORE INSERT OR DELETE OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sensitive_authenticated_mutation"();



CREATE OR REPLACE TRIGGER "require_aal2_organization_subscriptions" BEFORE INSERT OR DELETE OR UPDATE ON "public"."organization_subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."guard_sensitive_authenticated_mutation"();



CREATE OR REPLACE TRIGGER "security_audit_log_immutable" BEFORE DELETE OR UPDATE ON "public"."security_audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_security_audit_mutation"();



CREATE OR REPLACE TRIGGER "set_appointment_duration_snapshot" BEFORE INSERT OR UPDATE OF "service_id", "professional_id", "establishment_id", "date_time" ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."set_appointment_duration_snapshot"();



CREATE OR REPLACE TRIGGER "update_appointments_updated_at" BEFORE UPDATE ON "public"."appointments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_barber_services_updated_at" BEFORE UPDATE ON "public"."professional_services" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_barbershops_updated_at" BEFORE UPDATE ON "public"."establishments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_establishment_price_level_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_establishment_price_level"();



CREATE OR REPLACE TRIGGER "update_establishment_ratings_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."establishment_reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_establishment_ratings"();



CREATE OR REPLACE TRIGGER "update_profile_barbershops_updated_at" BEFORE UPDATE ON "public"."profile_establishments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_barber_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_barbershop_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."authorization_audit_log"
    ADD CONSTRAINT "authorization_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."authorization_audit_log"
    ADD CONSTRAINT "authorization_audit_log_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."authorization_audit_log"
    ADD CONSTRAINT "authorization_audit_log_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."professional_services"
    ADD CONSTRAINT "barber_services_barber_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_services"
    ADD CONSTRAINT "barber_services_barbershop_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_services"
    ADD CONSTRAINT "barber_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_push_deliveries"
    ADD CONSTRAINT "client_push_deliveries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_push_deliveries"
    ADD CONSTRAINT "client_push_deliveries_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_push_deliveries"
    ADD CONSTRAINT "client_push_deliveries_push_device_id_fkey" FOREIGN KEY ("push_device_id") REFERENCES "public"."push_devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."establishment_invites"
    ADD CONSTRAINT "establishment_invites_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."establishment_invites"
    ADD CONSTRAINT "establishment_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."establishment_invites"
    ADD CONSTRAINT "establishment_invites_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."establishment_requests"
    ADD CONSTRAINT "establishment_requests_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."establishment_requests"
    ADD CONSTRAINT "establishment_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."establishment_requests"
    ADD CONSTRAINT "establishment_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."establishment_reviews"
    ADD CONSTRAINT "establishment_reviews_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."establishment_reviews"
    ADD CONSTRAINT "establishment_reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."establishment_reviews"
    ADD CONSTRAINT "establishment_reviews_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_kb_attachments"
    ADD CONSTRAINT "governance_kb_attachments_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "public"."governance_kb_replies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_kb_attachments"
    ADD CONSTRAINT "governance_kb_attachments_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."governance_kb_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_kb_attachments"
    ADD CONSTRAINT "governance_kb_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_kb_categories"
    ADD CONSTRAINT "governance_kb_categories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_kb_replies"
    ADD CONSTRAINT "governance_kb_replies_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_kb_replies"
    ADD CONSTRAINT "governance_kb_replies_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "public"."governance_kb_topics"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_kb_revisions"
    ADD CONSTRAINT "governance_kb_revisions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_kb_topics"
    ADD CONSTRAINT "governance_kb_topics_accepted_reply_fkey" FOREIGN KEY ("accepted_reply_id") REFERENCES "public"."governance_kb_replies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_kb_topics"
    ADD CONSTRAINT "governance_kb_topics_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_kb_topics"
    ADD CONSTRAINT "governance_kb_topics_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."governance_kb_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_kb_topics"
    ADD CONSTRAINT "governance_kb_topics_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_privacy_requests"
    ADD CONSTRAINT "governance_privacy_requests_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_privacy_requests"
    ADD CONSTRAINT "governance_privacy_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."governance_privacy_requests"
    ADD CONSTRAINT "governance_privacy_requests_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_users"
    ADD CONSTRAINT "governance_users_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."governance_users"
    ADD CONSTRAINT "governance_users_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_verification_reviews"
    ADD CONSTRAINT "governance_verification_reviews_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."governance_verification_reviews"
    ADD CONSTRAINT "governance_verification_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_migration_conflicts"
    ADD CONSTRAINT "identity_migration_conflicts_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_migration_conflicts"
    ADD CONSTRAINT "identity_migration_conflicts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_migration_conflicts"
    ADD CONSTRAINT "identity_migration_conflicts_requester_profile_id_fkey" FOREIGN KEY ("requester_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."identity_migration_conflicts"
    ADD CONSTRAINT "identity_migration_conflicts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."legal_entities"
    ADD CONSTRAINT "legal_entities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_professional_profile_id_fkey" FOREIGN KEY ("professional_profile_id") REFERENCES "public"."professional_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_audit_log"
    ADD CONSTRAINT "organization_audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_audit_log"
    ADD CONSTRAINT "organization_audit_log_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_audit_log"
    ADD CONSTRAINT "organization_audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_audit_log"
    ADD CONSTRAINT "organization_audit_log_target_profile_id_fkey" FOREIGN KEY ("target_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_billing_accounts"
    ADD CONSTRAINT "organization_billing_accounts_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_billing_accounts"
    ADD CONSTRAINT "organization_billing_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_billing_events"
    ADD CONSTRAINT "organization_billing_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_billing_events"
    ADD CONSTRAINT "organization_billing_events_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "public"."organization_billing_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_billing_events"
    ADD CONSTRAINT "organization_billing_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."organization_billing_invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_billing_events"
    ADD CONSTRAINT "organization_billing_events_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."organization_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_billing_invoices"
    ADD CONSTRAINT "organization_billing_invoices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_billing_invoices"
    ADD CONSTRAINT "organization_billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."organization_subscriptions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_establishments"
    ADD CONSTRAINT "organization_establishments_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_establishments"
    ADD CONSTRAINT "organization_establishments_linked_by_fkey" FOREIGN KEY ("linked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_establishments"
    ADD CONSTRAINT "organization_establishments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_legal_entities"
    ADD CONSTRAINT "organization_legal_entities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_legal_entities"
    ADD CONSTRAINT "organization_legal_entities_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_legal_entities"
    ADD CONSTRAINT "organization_legal_entities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "public"."organization_billing_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organization_subscriptions"
    ADD CONSTRAINT "organization_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."organization_billing_plans"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."plan_unit_tiers"
    ADD CONSTRAINT "plan_unit_tiers_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."organization_billing_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."professional_profiles"
    ADD CONSTRAINT "professional_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_establishments"
    ADD CONSTRAINT "profile_barbershops_barbershop_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_establishments"
    ADD CONSTRAINT "profile_barbershops_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profile_legal_entities"
    ADD CONSTRAINT "profile_legal_entities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profile_legal_entities"
    ADD CONSTRAINT "profile_legal_entities_legal_entity_id_fkey" FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profile_legal_entities"
    ADD CONSTRAINT "profile_legal_entities_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_barbershop_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_devices"
    ADD CONSTRAINT "push_devices_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_blocks"
    ADD CONSTRAINT "schedule_blocks_professional_id_fkey" FOREIGN KEY ("professional_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."security_audit_logs"
    ADD CONSTRAINT "security_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_barbershop_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscription_units"
    ADD CONSTRAINT "subscription_units_establishment_id_fkey" FOREIGN KEY ("establishment_id") REFERENCES "public"."establishments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."subscription_units"
    ADD CONSTRAINT "subscription_units_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."organization_subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."superadmins"
    ADD CONSTRAINT "superadmins_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_shifts"
    ADD CONSTRAINT "work_shifts_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Active organization plans are readable" ON "public"."organization_billing_plans" FOR SELECT TO "authenticated" USING (("active" OR "public"."is_governance_user"()));



CREATE POLICY "Active plan tiers are readable" ON "public"."plan_unit_tiers" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."organization_billing_plans" "plan"
  WHERE (("plan"."id" = "plan_unit_tiers"."plan_id") AND "plan"."active"))) OR "public"."is_governance_user"()));



CREATE POLICY "Admins create confirmed walk ins" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]) AND ("client_id" IS NULL) AND (("char_length"(TRIM(BOTH FROM COALESCE("client_name", ''::"text"))) >= 2) AND ("char_length"(TRIM(BOTH FROM COALESCE("client_name", ''::"text"))) <= 160)) AND ("status" = 'confirmed'::"text") AND ("cancelled_by_role" IS NULL) AND ("cancellation_reason" IS NULL) AND ("reschedule_count" = 0) AND ("date_time" > "now"()) AND "public"."is_active_establishment_professional"("professional_id", "establishment_id") AND "public"."is_active_establishment_service"("service_id", "establishment_id")));



CREATE POLICY "Admins delete unused establishment services" ON "public"."services" FOR DELETE TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins gerenciam barber_services" ON "public"."professional_services" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."establishment_id" = "professional_services"."establishment_id") AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins insert establishment services" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins insert invites of establishment" ON "public"."establishment_invites" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins manage professional services" ON "public"."professional_services" TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]))) WITH CHECK (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins read all establishment services" ON "public"."services" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins read invites of establishment" ON "public"."establishment_invites" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins read tenant audit trail" ON "public"."authorization_audit_log" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"() OR (("establishment_id" IS NOT NULL) AND "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]))));



CREATE POLICY "Admins update establishment services" ON "public"."services" FOR UPDATE TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]))) WITH CHECK (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Admins update invites of establishment" ON "public"."establishment_invites" FOR UPDATE TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]))) WITH CHECK (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Allow authenticated read work_shifts" ON "public"."work_shifts" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow profiles to manage own work_shifts" ON "public"."work_shifts" TO "authenticated" USING (("profile_id" = "auth"."uid"())) WITH CHECK (("profile_id" = "auth"."uid"()));



CREATE POLICY "Allow superadmin all work_shifts" ON "public"."work_shifts" TO "authenticated" USING ("public"."is_superadmin"());



CREATE POLICY "Anyone can read reviews" ON "public"."establishment_reviews" FOR SELECT USING (true);



CREATE POLICY "Appointments cannot be deleted" ON "public"."appointments" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Appointments cannot be directly updated" ON "public"."appointments" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Appointments selected by authorized participants" ON "public"."appointments" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"() OR ("client_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]) OR ("public"."has_active_membership"("establishment_id", ARRAY['professional'::"text"]) AND (("professional_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."establishments" "establishment"
  WHERE (("establishment"."id" = "appointments"."establishment_id") AND (COALESCE("establishment"."share_agendas", true) = true))))))));



CREATE POLICY "Authors and owners update knowledge replies" ON "public"."governance_kb_replies" FOR UPDATE TO "authenticated" USING (("public"."is_governance_user"(ARRAY['SaaS_Owner'::"public"."governance_role_enum"]) OR (("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum"])))) WITH CHECK (("public"."is_governance_user"(ARRAY['SaaS_Owner'::"public"."governance_role_enum"]) OR (("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND "public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum"]))));



CREATE POLICY "Clientes gerenciam seus agendamentos" ON "public"."appointments" TO "authenticated" USING (("client_id" = "auth"."uid"())) WITH CHECK ((("client_id" = "auth"."uid"()) AND (( SELECT "establishments"."account_status"
   FROM "public"."establishments"
  WHERE ("establishments"."id" = "appointments"."establishment_id")) = 'active'::"text")));



CREATE POLICY "Clients can delete their own reviews" ON "public"."establishment_reviews" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients can insert their own reviews for past or completed appo" ON "public"."establishment_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "client_id") AND (EXISTS ( SELECT 1
   FROM "public"."appointments" "appt"
  WHERE (("appt"."id" = "establishment_reviews"."appointment_id") AND ("appt"."client_id" = "auth"."uid"()) AND (("appt"."status" = 'completed'::"text") OR (("appt"."status" = 'confirmed'::"text") AND ("appt"."date_time" < "now"()))))))));



CREATE POLICY "Clients can update their own reviews" ON "public"."establishment_reviews" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "client_id")) WITH CHECK (("auth"."uid"() = "client_id"));



CREATE POLICY "Clients create pending appointments" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK ((("client_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = 'pending'::"text") AND ("cancelled_by_role" IS NULL) AND ("cancellation_reason" IS NULL) AND ("reschedule_count" = 0) AND ("date_time" > "now"()) AND "public"."is_active_establishment_professional"("professional_id", "establishment_id") AND "public"."is_active_establishment_service"("service_id", "establishment_id")));



CREATE POLICY "Corporate finance views organization billing accounts" ON "public"."organization_billing_accounts" FOR SELECT TO "authenticated" USING (("public"."has_organization_role"("organization_id", ARRAY['owner'::"text", 'finance'::"text"]) OR "public"."is_governance_user"()));



CREATE POLICY "Corporate finance views organization invoices" ON "public"."organization_billing_invoices" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."organization_subscriptions" "subscription"
     JOIN "public"."organization_billing_accounts" "account" ON (("account"."id" = "subscription"."billing_account_id")))
  WHERE (("subscription"."id" = "organization_billing_invoices"."subscription_id") AND "public"."has_organization_role"("account"."organization_id", ARRAY['owner'::"text", 'finance'::"text"])))) OR "public"."is_governance_user"()));



CREATE POLICY "Corporate finance views organization subscriptions" ON "public"."organization_subscriptions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."organization_billing_accounts" "account"
  WHERE (("account"."id" = "organization_subscriptions"."billing_account_id") AND "public"."has_organization_role"("account"."organization_id", ARRAY['owner'::"text", 'finance'::"text"])))) OR "public"."is_governance_user"()));



CREATE POLICY "Corporate finance views subscription units" ON "public"."subscription_units" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."organization_subscriptions" "subscription"
     JOIN "public"."organization_billing_accounts" "account" ON (("account"."id" = "subscription"."billing_account_id")))
  WHERE (("subscription"."id" = "subscription_units"."subscription_id") AND "public"."has_organization_role"("account"."organization_id", ARRAY['owner'::"text", 'finance'::"text"])))) OR "public"."is_governance_user"()));



CREATE POLICY "Editors create knowledge attachments" ON "public"."governance_kb_attachments" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]) AND ("uploaded_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Editors create knowledge replies" ON "public"."governance_kb_replies" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]) AND ("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("status" = ANY (ARRAY['draft'::"text", 'published'::"text"]))));



CREATE POLICY "Editors create knowledge topics" ON "public"."governance_kb_topics" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]) AND ("author_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("is_official" = false) AND ("is_pinned" = false) AND ("reviewed_at" IS NULL) AND ("reviewed_by" IS NULL) AND ("publication_status" = ANY (ARRAY['draft'::"text", 'published'::"text"]))));



CREATE POLICY "Editors update knowledge attachments" ON "public"."governance_kb_attachments" FOR UPDATE TO "authenticated" USING ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"])) WITH CHECK ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]));



CREATE POLICY "Editors update knowledge topics" ON "public"."governance_kb_topics" FOR UPDATE TO "authenticated" USING ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"])) WITH CHECK ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]));



CREATE POLICY "Governance editors update establishments" ON "public"."establishments" FOR UPDATE TO "authenticated" USING ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"])) WITH CHECK ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]));



CREATE POLICY "Governance reads knowledge attachments" ON "public"."governance_kb_attachments" FOR SELECT TO "authenticated" USING (("public"."is_governance_user"() AND ("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]) OR (EXISTS ( SELECT 1
   FROM "public"."governance_kb_topics" "topic"
  WHERE (("topic"."id" = "governance_kb_attachments"."topic_id") AND ("topic"."publication_status" = 'published'::"text"))))) AND (("reply_id" IS NULL) OR "public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]) OR (EXISTS ( SELECT 1
   FROM "public"."governance_kb_replies" "reply"
  WHERE (("reply"."id" = "governance_kb_attachments"."reply_id") AND ("reply"."status" = 'published'::"text")))))));



CREATE POLICY "Governance reads knowledge categories" ON "public"."governance_kb_categories" FOR SELECT TO "authenticated" USING ("public"."is_governance_user"());



CREATE POLICY "Governance reads knowledge replies" ON "public"."governance_kb_replies" FOR SELECT TO "authenticated" USING (("public"."is_governance_user"() AND (("status" = 'published'::"text") OR "public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]))));



CREATE POLICY "Governance reads knowledge revisions" ON "public"."governance_kb_revisions" FOR SELECT TO "authenticated" USING (("public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]) OR ("public"."is_governance_user"() AND ((("entity_type" = 'topic'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."governance_kb_topics" "topic"
  WHERE (("topic"."id" = "governance_kb_revisions"."entity_id") AND ("topic"."publication_status" = 'published'::"text"))))) OR (("entity_type" = 'reply'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."governance_kb_replies" "reply"
     JOIN "public"."governance_kb_topics" "topic" ON (("topic"."id" = "reply"."topic_id")))
  WHERE (("reply"."id" = "governance_kb_revisions"."entity_id") AND ("reply"."status" = 'published'::"text") AND ("topic"."publication_status" = 'published'::"text")))))))));



CREATE POLICY "Governance reads knowledge topics" ON "public"."governance_kb_topics" FOR SELECT TO "authenticated" USING (("public"."is_governance_user"() AND (("publication_status" = 'published'::"text") OR "public"."is_governance_user"(ARRAY['SaaS_Editor'::"public"."governance_role_enum", 'SaaS_Owner'::"public"."governance_role_enum"]))));



CREATE POLICY "Governance users view audit log" ON "public"."security_audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_governance_user"());



CREATE POLICY "Governance users view themselves" ON "public"."governance_users" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_governance_user"()));



CREATE POLICY "Governance views organization billing events" ON "public"."organization_billing_events" FOR SELECT TO "authenticated" USING ("public"."is_governance_user"());



CREATE POLICY "Legacy links are readable by owner" ON "public"."profile_establishments" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_superadmin"()));



CREATE POLICY "Leitura pública de barbearias" ON "public"."establishments" FOR SELECT USING (true);



CREATE POLICY "Leitura pública de configurações de barbeiro" ON "public"."professional_services" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Members manage establishment appointments" ON "public"."appointments" TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text", 'professional'::"text"]))) WITH CHECK ((("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text", 'professional'::"text"])) AND "public"."is_establishment_active"("establishment_id")));



CREATE POLICY "Members view organization audit" ON "public"."organization_audit_log" FOR SELECT TO "authenticated" USING (("public"."has_organization_role"("organization_id") OR "public"."is_governance_user"()));



CREATE POLICY "Members view organization establishments" ON "public"."organization_establishments" FOR SELECT TO "authenticated" USING (("public"."has_organization_role"("organization_id") OR "public"."is_governance_user"()));



CREATE POLICY "Members view organization members" ON "public"."organization_members" FOR SELECT TO "authenticated" USING (("public"."has_organization_role"("organization_id") OR "public"."is_governance_user"()));



CREATE POLICY "Membership admins update establishments" ON "public"."establishments" FOR UPDATE TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("id", ARRAY['admin'::"text"]))) WITH CHECK (("public"."is_superadmin"() OR "public"."has_active_membership"("id", ARRAY['admin'::"text"])));



CREATE POLICY "Memberships visible to authorized users" ON "public"."memberships" FOR SELECT TO "authenticated" USING ((("profile_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"])));



CREATE POLICY "Operational members read schedule blocks" ON "public"."schedule_blocks" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"() OR "public"."has_active_membership"("establishment_id", ARRAY['admin'::"text"]) OR ("public"."has_active_membership"("establishment_id", ARRAY['professional'::"text", 'admin'::"text"]) AND (("professional_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."establishments" "establishment"
  WHERE (("establishment"."id" = "schedule_blocks"."establishment_id") AND ("establishment"."share_agendas" = true))))))));



CREATE POLICY "Organization members view organizations" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("public"."has_organization_role"("id") OR "public"."is_governance_user"()));



CREATE POLICY "Owner manages knowledge categories" ON "public"."governance_kb_categories" TO "authenticated" USING ("public"."is_governance_user"(ARRAY['SaaS_Owner'::"public"."governance_role_enum"])) WITH CHECK ("public"."is_governance_user"(ARRAY['SaaS_Owner'::"public"."governance_role_enum"]));



CREATE POLICY "Owners view organization invitations" ON "public"."organization_invitations" FOR SELECT TO "authenticated" USING (("public"."has_organization_role"("organization_id", ARRAY['owner'::"text"]) OR ("lower"("invited_email") = "lower"(COALESCE(( SELECT "profiles"."email"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = ( SELECT "auth"."uid"() AS "uid"))), ''::"text"))) OR "public"."is_governance_user"()));



CREATE POLICY "Private profiles visible only to owner and managers" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."can_view_private_profile"("id"));



CREATE POLICY "Professionals create own confirmed walk ins" ON "public"."appointments" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_active_membership"("establishment_id", ARRAY['professional'::"text"]) AND ("professional_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("client_id" IS NULL) AND (("char_length"(TRIM(BOTH FROM COALESCE("client_name", ''::"text"))) >= 2) AND ("char_length"(TRIM(BOTH FROM COALESCE("client_name", ''::"text"))) <= 160)) AND ("status" = 'confirmed'::"text") AND ("cancelled_by_role" IS NULL) AND ("cancellation_reason" IS NULL) AND ("reschedule_count" = 0) AND ("date_time" > "now"()) AND "public"."is_active_establishment_service"("service_id", "establishment_id")));



CREATE POLICY "Professionals read own public profile" ON "public"."professional_profiles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Public reads active services" ON "public"."services" FOR SELECT TO "authenticated", "anon" USING ((("deleted_at" IS NULL) AND ("is_active" = true)));



CREATE POLICY "Public reads published professional profiles" ON "public"."professional_profiles" FOR SELECT TO "authenticated", "anon" USING (("is_public" = true));



CREATE POLICY "SaaS_Owner manages governance users" ON "public"."governance_users" TO "authenticated" USING ("public"."is_governance_user"(ARRAY['SaaS_Owner'::"public"."governance_role_enum"])) WITH CHECK ("public"."is_governance_user"(ARRAY['SaaS_Owner'::"public"."governance_role_enum"]));



CREATE POLICY "Superadmin marker visible to owner" ON "public"."superadmins" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users read own establishment requests" ON "public"."establishment_requests" FOR SELECT TO "authenticated" USING ((("requester_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_superadmin"()));



CREATE POLICY "Users read own push devices" ON "public"."push_devices" FOR SELECT TO "authenticated" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users update own safe profile fields" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."authorization_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_push_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."establishment_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."establishment_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."establishment_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."establishments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_kb_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_kb_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_kb_replies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_kb_revisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_kb_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_privacy_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "governance_privacy_requests_read" ON "public"."governance_privacy_requests" FOR SELECT TO "authenticated" USING (("public"."is_governance_user"() OR ("requested_by" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."governance_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."governance_verification_reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "governance_verification_reviews_read" ON "public"."governance_verification_reviews" FOR SELECT TO "authenticated" USING ("public"."is_governance_user"());



ALTER TABLE "public"."identity_migration_conflicts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."legal_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_audit_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_billing_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_billing_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_billing_invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_billing_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_establishments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_legal_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_unit_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."professional_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_establishments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_legal_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_blocks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."security_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."superadmins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_shifts" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_governance_kb_solution"("target_topic_id" "uuid", "target_reply_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_governance_kb_solution"("target_topic_id" "uuid", "target_reply_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_governance_kb_solution"("target_topic_id" "uuid", "target_reply_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_governance_kb_solution"("target_topic_id" "uuid", "target_reply_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_invitation"("invitation_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation"("invitation_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invitation"("invitation_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation"("invitation_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_invitation_v2"("invitation_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invitation_v2"("invitation_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invitation_v2"("invitation_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invitation_v2"("invitation_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_my_lgpd_terms"("target_marketing_accepted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_my_lgpd_terms"("target_marketing_accepted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."accept_my_lgpd_terms"("target_marketing_accepted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_my_lgpd_terms"("target_marketing_accepted" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_organization_invitation"("invitation_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_organization_invitation"("invitation_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_organization_invitation"("invitation_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."activate_control_subscription"("target_organization_id" "uuid", "target_plan_code" "text", "target_period_start" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activate_control_subscription"("target_organization_id" "uuid", "target_plan_code" "text", "target_period_start" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_control_subscription"("target_organization_id" "uuid", "target_plan_code" "text", "target_period_start" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_report_available_minutes"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_report_available_minutes"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "updates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "updates" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."anonymize_client_account_deletion"("target_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."anonymize_client_account_deletion"("target_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."anonymize_user_profile"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."anonymize_user_profile"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."anonymize_user_profile"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."anonymize_user_profile"("target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_establishment_request"("target_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_establishment_request"("target_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_establishment_request"("target_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_governance_establishment_request"("target_request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_governance_establishment_request"("target_request_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_governance_establishment_request"("target_request_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_governance_actions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_governance_actions"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_governance_actions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_governance_actions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."audit_membership_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."audit_membership_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_membership_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_membership_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."begin_client_account_deletion_execution"("target_request_id" "uuid", "execution_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."begin_client_account_deletion_execution"("target_request_id" "uuid", "execution_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."begin_client_account_deletion_execution"("target_request_id" "uuid", "execution_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bootstrap_superadmins_from_config"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_superadmins_from_config"() TO "anon";
GRANT ALL ON FUNCTION "public"."bootstrap_superadmins_from_config"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bootstrap_superadmins_from_config"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_upload_professional_gallery_image"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_upload_professional_gallery_image"() TO "anon";
GRANT ALL ON FUNCTION "public"."can_upload_professional_gallery_image"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_upload_professional_gallery_image"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_private_profile"("target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_private_profile"("target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_private_profile"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_private_profile"("target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_view_profile"("target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_view_profile"("target_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_profile"("target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_profile"("target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_appointment"("target_appointment_id" "text", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_appointment"("target_appointment_id" "text", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_appointment"("target_appointment_id" "text", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_appointment"("target_appointment_id" "text", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_client_push_deliveries"("target_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_client_push_deliveries"("target_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_client_push_receipts"("target_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_client_push_receipts"("target_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_appointment"("target_appointment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_appointment"("target_appointment_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_appointment"("target_appointment_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_appointment"("target_appointment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_client_account_deletion"("target_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_client_account_deletion"("target_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_client_push_delivery"("target_delivery_id" "uuid", "target_success" boolean, "target_ticket_id" "text", "target_error_code" "text", "target_retryable" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_client_push_delivery"("target_delivery_id" "uuid", "target_success" boolean, "target_ticket_id" "text", "target_error_code" "text", "target_retryable" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_client_push_receipt"("target_delivery_id" "uuid", "target_success" boolean, "target_error_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_client_push_receipt"("target_delivery_id" "uuid", "target_success" boolean, "target_error_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."compute_available_slots_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compute_available_slots_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "ignored_appointment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."configure_control_plan"("target_plan_code" "text", "target_base_price_cents" integer, "target_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."configure_control_plan"("target_plan_code" "text", "target_base_price_cents" integer, "target_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."configure_control_plan"("target_plan_code" "text", "target_base_price_cents" integer, "target_currency" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_appointment"("target_appointment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_appointment"("target_appointment_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_appointment"("target_appointment_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_appointment"("target_appointment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_appointment_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_appointment_before_schedule_blocks"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone, "target_client_name" "text", "target_client_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_client_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_client_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_client_appointment"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_date_time" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_establishment_and_promote_owner"("target_user_id" "uuid", "target_cnpj" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_establishment_and_promote_owner"("target_user_id" "uuid", "target_cnpj" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_establishment_and_promote_owner"("target_user_id" "uuid", "target_cnpj" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_establishment_cpf"("target_user_id" "uuid", "target_cpf" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_establishment_cpf"("target_user_id" "uuid", "target_cpf" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."create_establishment_cpf"("target_user_id" "uuid", "target_cpf" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_establishment_invite_v2"("target_establishment_id" "uuid", "target_contact" "text", "target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_establishment_invite_v2"("target_establishment_id" "uuid", "target_contact" "text", "target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_establishment_invite_v2"("target_establishment_id" "uuid", "target_contact" "text", "target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_establishment_invite_v2"("target_establishment_id" "uuid", "target_contact" "text", "target_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_invitation"("target_establishment_id" "uuid", "target_email" "text", "target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_invitation"("target_establishment_id" "uuid", "target_email" "text", "target_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_invitation"("target_establishment_id" "uuid", "target_email" "text", "target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_invitation"("target_establishment_id" "uuid", "target_email" "text", "target_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_organization"("initial_establishment_id" "uuid", "organization_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_organization"("initial_establishment_id" "uuid", "organization_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("initial_establishment_id" "uuid", "organization_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_schedule_block"("target_establishment_id" "uuid", "target_professional_id" "uuid", "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_kind" "text", "requested_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_schedule_block"("target_establishment_id" "uuid", "target_professional_id" "uuid", "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_kind" "text", "requested_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_schedule_block"("target_establishment_id" "uuid", "target_professional_id" "uuid", "requested_start" timestamp with time zone, "requested_end" timestamp with time zone, "requested_kind" "text", "requested_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_session_is_aal2"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_session_is_aal2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_session_is_aal2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_schedule_block"("target_block_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_schedule_block"("target_block_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_schedule_block"("target_block_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_client_appointment_push"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_client_appointment_push"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_governance_privacy_request"("request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_governance_privacy_request"("request_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."fail_client_account_deletion"("target_request_id" "uuid", "target_error_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fail_client_account_deletion"("target_request_id" "uuid", "target_error_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_establishment_onboarding"("target_establishment_id" "uuid", "opening_hours" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_establishment_onboarding"("target_establishment_id" "uuid", "opening_hours" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_establishment_onboarding"("target_establishment_id" "uuid", "opening_hours" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_governance_kb_attachment"("target_attachment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_governance_kb_attachment"("target_attachment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_governance_kb_attachment"("target_attachment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_governance_kb_attachment"("target_attachment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_report"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_report"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_report"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_report_details"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_dimension" "text", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text", "target_day" "date", "target_day_of_week" integer, "target_hour" integer, "target_cursor" "text", "target_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_report_details"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_dimension" "text", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text", "target_day" "date", "target_day_of_week" integer, "target_hour" integer, "target_cursor" "text", "target_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_report_details"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_dimension" "text", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text", "target_day" "date", "target_day_of_week" integer, "target_hour" integer, "target_cursor" "text", "target_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_report_v2"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_report_v2"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_report_v2"("target_establishment_id" "uuid", "target_range_start" "date", "target_range_end" "date", "target_professional_id" "uuid", "target_service_id" "text", "target_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_appointment_participant_names"("target_appointment_ids" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_appointment_participant_names"("target_appointment_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_appointment_participant_names"("target_appointment_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_appointment_participant_names"("target_appointment_ids" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "target_appointment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "target_appointment_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "target_appointment_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_available_slots"("target_establishment_id" "uuid", "target_professional_id" "uuid", "target_service_id" "text", "target_local_date" "date", "target_appointment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_client_account_deletion_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_account_deletion_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_account_deletion_request"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_client_appointment"("target_appointment_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_appointment"("target_appointment_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_appointment"("target_appointment_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_client_appointments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_appointments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_appointments"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_client_appointments_v2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_appointments_v2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_appointments_v2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_client_booking_options"("target_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_booking_options"("target_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_booking_options"("target_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_client_discovery_establishment"("target_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_client_discovery_establishment"("target_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_discovery_establishment"("target_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_establishment_client_contacts"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_establishment_client_contacts"("target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_establishment_client_contacts"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_establishment_client_contacts"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_establishment_team"("target_establishment_id" "uuid", "include_administrators" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_establishment_team"("target_establishment_id" "uuid", "include_administrators" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."get_establishment_team"("target_establishment_id" "uuid", "include_administrators" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_establishment_team"("target_establishment_id" "uuid", "include_administrators" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_governance_establishment_detail"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_governance_establishment_detail"("target_establishment_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_governance_establishment_detail"("target_establishment_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_governance_kb_topic"("target_topic_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_governance_kb_topic"("target_topic_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_governance_kb_topic"("target_topic_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_governance_kb_topic"("target_topic_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_client_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_client_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_client_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_client_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_legal_entity_context"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_legal_entity_context"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_legal_entity_context"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_operational_contexts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_operational_contexts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_operational_contexts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_organizations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_organizations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_organizations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_professional_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_professional_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_professional_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_professional_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_organization_context"("target_organization_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_organization_context"("target_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_context"("target_organization_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_organization_report"("target_organization_id" "uuid", "range_start" "date", "range_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_organization_report"("target_organization_id" "uuid", "range_start" "date", "range_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_organization_report"("target_organization_id" "uuid", "range_start" "date", "range_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_busy_slots"("target_professional_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_busy_slots"("target_professional_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_busy_slots"("target_professional_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_busy_slots"("target_professional_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_professional_profile"("profile_slug" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_professional_profile"("profile_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_professional_profile"("profile_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_professional_profile"("profile_slug" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_team"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_team"("target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_team"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_team"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_schedule_blocks"("target_establishment_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone, "target_professional_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_schedule_blocks"("target_establishment_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone, "target_professional_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_schedule_blocks"("target_establishment_id" "uuid", "range_start" timestamp with time zone, "range_end" timestamp with time zone, "target_professional_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_subscription_entitlement_for_establishment"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_subscription_entitlement_for_establishment"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_entitlement_for_establishment"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."governance_kb_audit_reply_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."governance_kb_audit_reply_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."governance_kb_audit_reply_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."governance_kb_audit_reply_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."governance_kb_audit_topic_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."governance_kb_audit_topic_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."governance_kb_audit_topic_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."governance_kb_audit_topic_insert"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."governance_kb_guard_reply_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."governance_kb_guard_reply_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."governance_kb_guard_reply_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."governance_kb_guard_reply_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."governance_kb_guard_topic_update"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."governance_kb_guard_topic_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."governance_kb_guard_topic_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."governance_kb_guard_topic_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."governance_kb_touch_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."governance_kb_touch_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."governance_kb_touch_category"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."governance_kb_validate_attachment"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."governance_kb_validate_attachment"() TO "anon";
GRANT ALL ON FUNCTION "public"."governance_kb_validate_attachment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."governance_kb_validate_attachment"() TO "service_role";



GRANT ALL ON TABLE "public"."governance_users" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."governance_users" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_users" TO "service_role";



REVOKE ALL ON FUNCTION "public"."grant_governance_role"("target_profile_id" "uuid", "target_role" "public"."governance_role_enum", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."grant_governance_role"("target_profile_id" "uuid", "target_role" "public"."governance_role_enum", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."grant_governance_role"("target_profile_id" "uuid", "target_role" "public"."governance_role_enum", "reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_governance_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_governance_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_governance_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_governance_user_direct_write"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_governance_user_direct_write"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_governance_user_direct_write"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_legacy_establishment_document"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_legacy_establishment_document"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_legacy_establishment_document"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_legacy_kyc_url"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_legacy_kyc_url"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_legacy_kyc_url"() TO "service_role";



GRANT ALL ON FUNCTION "public"."guard_sensitive_authenticated_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."guard_sensitive_authenticated_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."guard_sensitive_authenticated_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_active_membership"("target_establishment_id" "uuid", "allowed_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_active_membership"("target_establishment_id" "uuid", "allowed_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_membership"("target_establishment_id" "uuid", "allowed_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_membership"("target_establishment_id" "uuid", "allowed_roles" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_organization_role"("target_organization_id" "uuid", "allowed_roles" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_organization_role"("target_organization_id" "uuid", "allowed_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_organization_role"("target_organization_id" "uuid", "allowed_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."immutable_array_to_string"("arr" "text"[], "sep" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."immutable_array_to_string"("arr" "text"[], "sep" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."immutable_array_to_string"("arr" "text"[], "sep" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inspect_invitation"("invitation_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inspect_invitation"("invitation_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inspect_invitation"("invitation_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspect_invitation"("invitation_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."inspect_invitation_v2"("invitation_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inspect_invitation_v2"("invitation_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."inspect_invitation_v2"("invitation_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inspect_invitation_v2"("invitation_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."invite_organization_member"("target_organization_id" "uuid", "invited_email" "text", "target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invite_organization_member"("target_organization_id" "uuid", "invited_email" "text", "target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_organization_member"("target_organization_id" "uuid", "invited_email" "text", "target_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_establishment_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_establishment_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_establishment_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_establishment_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_establishment_service"("target_service_id" "text", "target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_establishment_service"("target_service_id" "text", "target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_active_establishment_service"("target_service_id" "text", "target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_establishment_service"("target_service_id" "text", "target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_establishment_active"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_establishment_active"("target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_establishment_active"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_establishment_active"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_governance_user"("allowed_roles" "public"."governance_role_enum"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_governance_user"("allowed_roles" "public"."governance_role_enum"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."is_governance_user"("allowed_roles" "public"."governance_role_enum"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_governance_user"("allowed_roles" "public"."governance_role_enum"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_safe_client_profile_text"("target_value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_safe_client_profile_text"("target_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_safe_client_profile_text"("target_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_safe_client_profile_text"("target_value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_safe_public_url"("value" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_safe_public_url"("value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_safe_public_url"("value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_safe_public_url"("value" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_valid_professional_gallery"("value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_valid_professional_gallery"("value" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."is_valid_professional_gallery"("value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_valid_professional_gallery"("value" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_manual_billing_invoice"("target_subscription_id" "uuid", "target_due_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_manual_billing_invoice"("target_subscription_id" "uuid", "target_due_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_manual_billing_invoice"("target_subscription_id" "uuid", "target_due_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_professional_profile_to_membership"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_professional_profile_to_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."link_professional_profile_to_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_professional_profile_to_membership"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_client_discovery_establishments"("target_query" "text", "result_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_client_discovery_establishments"("target_query" "text", "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_client_discovery_establishments"("target_query" "text", "result_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_control_billing_accounts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_control_billing_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_control_billing_accounts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_establishment_invitations"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_establishment_invitations"("target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_establishment_invitations"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_establishment_invitations"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_establishment_invites_v2"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_establishment_invites_v2"("target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."list_establishment_invites_v2"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_establishment_invites_v2"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_governance_audit_events"("search_term" "text", "action_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone, "page_size" integer, "page_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_audit_events"("search_term" "text", "action_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone, "page_size" integer, "page_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."list_governance_audit_events"("search_term" "text", "action_filter" "text", "date_from" timestamp with time zone, "date_to" timestamp with time zone, "page_size" integer, "page_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_governance_establishment_requests"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_establishment_requests"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_governance_establishment_requests"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_governance_establishments"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_establishments"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."list_governance_establishments"("search_term" "text", "status_filter" "text", "page_size" integer, "page_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."list_governance_invitations"("status_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_invitations"("status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_governance_invitations"("status_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_governance_memberships"("status_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_memberships"("status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_governance_memberships"("status_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_governance_privacy_requests"("status_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_privacy_requests"("status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_governance_privacy_requests"("status_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_governance_users"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_governance_users"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_governance_verification_reviews"("target_establishment_id" "uuid", "status_filter" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_governance_verification_reviews"("target_establishment_id" "uuid", "status_filter" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_governance_verification_reviews"("target_establishment_id" "uuid", "status_filter" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."list_identity_migration_conflicts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."list_identity_migration_conflicts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."list_identity_migration_conflicts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_governance_kb_topic"("target_topic_id" "uuid", "requested_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_governance_kb_topic"("target_topic_id" "uuid", "requested_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."moderate_governance_kb_topic"("target_topic_id" "uuid", "requested_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."moderate_governance_kb_topic"("target_topic_id" "uuid", "requested_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_brazil_phone_e164"("input_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_brazil_phone_e164"("input_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_brazil_phone_e164"("input_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_phone_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_phone_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_phone_column"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_authorization_audit_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_authorization_audit_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_authorization_audit_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_authorization_audit_mutation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_security_audit_mutation"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_security_audit_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_security_audit_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_service_history_deletion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_service_history_deletion"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_service_history_deletion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_service_history_deletion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_authorization_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_authorization_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_authorization_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_authorization_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."pull_changes"("last_pulled_at" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."pull_changes"("last_pulled_at" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."pull_changes"("last_pulled_at" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."pull_changes"("last_pulled_at" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_changes"("changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_changes"("changes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."push_changes"("changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_changes"("changes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_due_client_appointment_reminders"("target_now" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_due_client_appointment_reminders"("target_now" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_business_identity_atomic"("actor_profile_id" "uuid", "target_document_type" "text", "target_document_fingerprint" "text", "encrypted_document_value" "text", "encryption_iv_value" "text", "encryption_key_version_value" "text", "target_document_last4" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_business_identity_atomic"("actor_profile_id" "uuid", "target_document_type" "text", "target_document_fingerprint" "text", "encrypted_document_value" "text", "encryption_iv_value" "text", "encryption_key_version_value" "text", "target_document_last4" "text", "requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_push_device"("target_app_kind" "text", "target_platform" "text", "target_expo_push_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_push_device"("target_app_kind" "text", "target_platform" "text", "target_expo_push_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_push_device"("target_app_kind" "text", "target_platform" "text", "target_expo_push_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_establishment_request"("target_request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_establishment_request"("target_request_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reject_establishment_request"("target_request_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_governance_establishment_request"("target_request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_governance_establishment_request"("target_request_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_governance_establishment_request"("target_request_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_governance_privacy_request"("request_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_governance_privacy_request"("request_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_governance_privacy_request"("request_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_organization_establishment"("target_organization_id" "uuid", "target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_professional"("target_profile_id" "uuid", "target_establishment_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_service"("target_establishment_id" "uuid", "target_service_id" "text", "direction" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_service"("target_establishment_id" "uuid", "target_service_id" "text", "direction" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_service"("target_establishment_id" "uuid", "target_service_id" "text", "direction" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_establishment"("requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_establishment"("requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_establishment"("requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_establishment"("requested_name" "text", "requested_slug" "text", "requested_address" "text", "requested_phone" "text", "requested_primary_color" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."require_aal2"() TO "anon";
GRANT ALL ON FUNCTION "public"."require_aal2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."require_aal2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reschedule_appointment"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_appointment"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reschedule_appointment"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reschedule_appointment_before_schedule_blocks"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_appointment_before_schedule_blocks"("target_appointment_id" "text", "requested_date_time" timestamp with time zone, "requested_professional_id" "uuid", "requested_service_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_governance_kb_attachment"("target_topic_id" "uuid", "target_reply_id" "uuid", "requested_original_name" "text", "requested_mime_type" "text", "requested_size_bytes" bigint, "requested_width" integer, "requested_height" integer, "requested_alt_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_governance_kb_attachment"("target_topic_id" "uuid", "target_reply_id" "uuid", "requested_original_name" "text", "requested_mime_type" "text", "requested_size_bytes" bigint, "requested_width" integer, "requested_height" integer, "requested_alt_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reserve_governance_kb_attachment"("target_topic_id" "uuid", "target_reply_id" "uuid", "requested_original_name" "text", "requested_mime_type" "text", "requested_size_bytes" bigint, "requested_width" integer, "requested_height" integer, "requested_alt_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reserve_governance_kb_attachment"("target_topic_id" "uuid", "target_reply_id" "uuid", "requested_original_name" "text", "requested_mime_type" "text", "requested_size_bytes" bigint, "requested_width" integer, "requested_height" integer, "requested_alt_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_identity_migration_conflict"("actor_profile_id" "uuid", "target_conflict_id" "uuid", "target_action" "text", "target_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_identity_migration_conflict"("actor_profile_id" "uuid", "target_conflict_id" "uuid", "target_action" "text", "target_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_governance_kb_revision"("target_revision_id" bigint, "requested_change_summary" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_governance_kb_revision"("target_revision_id" bigint, "requested_change_summary" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."restore_governance_kb_revision"("target_revision_id" bigint, "requested_change_summary" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_governance_kb_revision"("target_revision_id" bigint, "requested_change_summary" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_governance_verification"("target_review_id" "uuid", "target_decision" "text", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_governance_verification"("target_review_id" "uuid", "target_decision" "text", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_governance_verification"("target_review_id" "uuid", "target_decision" "text", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_governance_invitation"("target_invitation_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_governance_invitation"("target_invitation_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_governance_invitation"("target_invitation_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_governance_membership"("target_membership_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_governance_membership"("target_membership_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_governance_membership"("target_membership_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_governance_role"("target_profile_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_governance_role"("target_profile_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_governance_role"("target_profile_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_invitation"("target_invitation_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_invitation"("target_invitation_id" "uuid", "reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_invitation"("target_invitation_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_invitation"("target_invitation_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_organization_member"("target_organization_id" "uuid", "target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_organization_member"("target_organization_id" "uuid", "target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_organization_member"("target_organization_id" "uuid", "target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_governance_kb_topics"("search_query" "text", "filter_category" "uuid", "filter_kind" "text", "filter_status" "text", "page_number" integer, "page_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_governance_kb_topics"("search_query" "text", "filter_category" "uuid", "filter_kind" "text", "filter_status" "text", "page_number" integer, "page_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_governance_kb_topics"("search_query" "text", "filter_category" "uuid", "filter_kind" "text", "filter_status" "text", "page_number" integer, "page_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_governance_kb_topics"("search_query" "text", "filter_category" "uuid", "filter_kind" "text", "filter_status" "text", "page_number" integer, "page_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_appointment_duration_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_appointment_duration_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_appointment_duration_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_appointment_duration_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_control_subscription_enforcement"("target_subscription_id" "uuid", "enabled" boolean, "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_control_subscription_enforcement"("target_subscription_id" "uuid", "enabled" boolean, "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_control_subscription_enforcement"("target_subscription_id" "uuid", "enabled" boolean, "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_control_subscription_status"("target_subscription_id" "uuid", "target_status" "text", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_control_subscription_status"("target_subscription_id" "uuid", "target_status" "text", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_control_subscription_status"("target_subscription_id" "uuid", "target_status" "text", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_client_account_deletion_request"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_client_account_deletion_request"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_client_account_deletion_request"() TO "service_role";



GRANT ALL ON TABLE "public"."governance_privacy_requests" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."governance_privacy_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_privacy_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_governance_privacy_request"("target_profile_id" "uuid", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_governance_privacy_request"("target_profile_id" "uuid", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_governance_privacy_request"("target_profile_id" "uuid", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_governance_verification"("target_establishment_id" "uuid", "document_path" "text", "reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_governance_verification"("target_establishment_id" "uuid", "document_path" "text", "reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_governance_verification"("target_establishment_id" "uuid", "document_path" "text", "reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."switch_active_establishment"("target_establishment_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."switch_active_establishment"("target_establishment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."switch_active_establishment"("target_establishment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_active_establishment"("target_establishment_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."text_array_has_duplicates"("target_values" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."text_array_has_duplicates"("target_values" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."text_array_has_duplicates"("target_values" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."text_array_has_duplicates"("target_values" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_organization_ownership"("target_organization_id" "uuid", "target_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_organization_ownership"("target_organization_id" "uuid", "target_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_organization_ownership"("target_organization_id" "uuid", "target_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."unregister_push_device"("target_expo_push_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unregister_push_device"("target_expo_push_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unregister_push_device"("target_expo_push_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_appointment_status"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_appointment_status"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_appointment_status"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_appointment_status_v2"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason_code" "text", "new_cancellation_note_internal" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_appointment_status_v2"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason_code" "text", "new_cancellation_note_internal" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_appointment_status_v2"("target_appointment_id" "text", "new_status" "text", "new_cancellation_reason_code" "text", "new_cancellation_note_internal" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_establishment_price_level"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_establishment_price_level"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_establishment_price_level"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_establishment_price_level"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_establishment_ratings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_establishment_ratings"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_establishment_ratings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_establishment_ratings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_governance_establishment_status"("target_establishment_id" "uuid", "target_status" "text", "target_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_governance_establishment_status"("target_establishment_id" "uuid", "target_status" "text", "target_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."update_governance_establishment_status"("target_establishment_id" "uuid", "target_status" "text", "target_reason" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_my_client_avatar"("target_avatar_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_client_avatar"("target_avatar_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_my_client_avatar"("target_avatar_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_client_avatar"("target_avatar_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_client_preferences"("target_notification_channels" "text"[], "target_lgpd_marketing_accepted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_client_preferences"("target_notification_channels" "text"[], "target_lgpd_marketing_accepted" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_my_client_preferences"("target_notification_channels" "text"[], "target_lgpd_marketing_accepted" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_client_preferences"("target_notification_channels" "text"[], "target_lgpd_marketing_accepted" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_my_client_profile"("target_name" "text", "target_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_my_client_profile"("target_name" "text", "target_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_my_client_profile"("target_name" "text", "target_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_my_client_profile"("target_name" "text", "target_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_organization_member_role"("target_organization_id" "uuid", "target_profile_id" "uuid", "target_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_organization_member_role"("target_organization_id" "uuid", "target_profile_id" "uuid", "target_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_organization_member_role"("target_organization_id" "uuid", "target_profile_id" "uuid", "target_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_my_professional_profile"("requested_slug" "text", "requested_bio" "text", "requested_portfolio_url" "text", "requested_instagram_url" "text", "requested_gallery_urls" "jsonb", "requested_is_public" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_my_professional_profile"("requested_slug" "text", "requested_bio" "text", "requested_portfolio_url" "text", "requested_instagram_url" "text", "requested_gallery_urls" "jsonb", "requested_is_public" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_my_professional_profile"("requested_slug" "text", "requested_bio" "text", "requested_portfolio_url" "text", "requested_instagram_url" "text", "requested_gallery_urls" "jsonb", "requested_is_public" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_my_professional_profile"("requested_slug" "text", "requested_bio" "text", "requested_portfolio_url" "text", "requested_instagram_url" "text", "requested_gallery_urls" "jsonb", "requested_is_public" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."establishment_invites" TO "anon";
GRANT ALL ON TABLE "public"."establishment_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."establishment_invites" TO "service_role";



GRANT ALL ON TABLE "public"."active_establishment_invites" TO "anon";
GRANT ALL ON TABLE "public"."active_establishment_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."active_establishment_invites" TO "service_role";



GRANT ALL ON TABLE "public"."appointments" TO "service_role";
GRANT SELECT ON TABLE "public"."appointments" TO "authenticated";



GRANT ALL ON TABLE "public"."authorization_audit_log" TO "service_role";
GRANT SELECT ON TABLE "public"."authorization_audit_log" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."authorization_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."authorization_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."authorization_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."client_push_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."establishment_requests" TO "anon";
GRANT ALL ON TABLE "public"."establishment_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."establishment_requests" TO "service_role";



GRANT ALL ON TABLE "public"."establishment_reviews" TO "anon";
GRANT ALL ON TABLE "public"."establishment_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."establishment_reviews" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."establishments" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."establishments" TO "authenticated";
GRANT ALL ON TABLE "public"."establishments" TO "service_role";



GRANT ALL ON TABLE "public"."governance_kb_attachments" TO "anon";
GRANT ALL ON TABLE "public"."governance_kb_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_kb_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."governance_kb_categories" TO "anon";
GRANT ALL ON TABLE "public"."governance_kb_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_kb_categories" TO "service_role";



GRANT ALL ON TABLE "public"."governance_kb_replies" TO "anon";
GRANT ALL ON TABLE "public"."governance_kb_replies" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_kb_replies" TO "service_role";



GRANT ALL ON TABLE "public"."governance_kb_revisions" TO "anon";
GRANT ALL ON TABLE "public"."governance_kb_revisions" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_kb_revisions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."governance_kb_revisions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."governance_kb_revisions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."governance_kb_revisions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."governance_kb_topics" TO "anon";
GRANT ALL ON TABLE "public"."governance_kb_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_kb_topics" TO "service_role";



GRANT ALL ON TABLE "public"."governance_verification_reviews" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."governance_verification_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."governance_verification_reviews" TO "service_role";



GRANT ALL ON TABLE "public"."identity_migration_conflicts" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."legal_entities" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."organization_audit_log" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."organization_audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."organization_audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."organization_audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization_billing_accounts" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_billing_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_billing_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."organization_billing_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_billing_events" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_billing_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."organization_billing_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."organization_billing_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."organization_billing_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization_billing_invoices" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_billing_invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_billing_invoices" TO "service_role";



GRANT ALL ON TABLE "public"."organization_billing_plans" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_billing_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_billing_plans" TO "service_role";



GRANT ALL ON TABLE "public"."organization_establishments" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_establishments" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_establishments" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invitations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."organization_legal_entities" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."organization_subscriptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organization_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."plan_unit_tiers" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."plan_unit_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_unit_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."professional_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."professional_services" TO "anon";
GRANT ALL ON TABLE "public"."professional_services" TO "authenticated";
GRANT ALL ON TABLE "public"."professional_services" TO "service_role";



GRANT ALL ON TABLE "public"."profile_establishments" TO "anon";
GRANT ALL ON TABLE "public"."profile_establishments" TO "authenticated";
GRANT ALL ON TABLE "public"."profile_establishments" TO "service_role";



GRANT ALL ON TABLE "public"."profile_legal_entities" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "anon";
GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("name"),UPDATE("name") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("phone") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("avatar_url"),UPDATE("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("instagram") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("specialties") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("work_hours") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("push_token") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("titulo_profissional") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("lgpd_marketing_accepted") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("notification_channels") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("pix_key") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."push_devices" TO "service_role";
GRANT SELECT ON TABLE "public"."push_devices" TO "authenticated";



GRANT ALL ON TABLE "public"."schedule_blocks" TO "service_role";
GRANT SELECT ON TABLE "public"."schedule_blocks" TO "authenticated";



GRANT ALL ON TABLE "public"."security_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."security_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."security_audit_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."security_audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."security_audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."security_audit_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "service_role";
GRANT SELECT ON TABLE "public"."services" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."services" TO "authenticated";



GRANT ALL ON TABLE "public"."subscription_units" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."subscription_units" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_units" TO "service_role";



GRANT ALL ON TABLE "public"."superadmins" TO "anon";
GRANT ALL ON TABLE "public"."superadmins" TO "authenticated";
GRANT ALL ON TABLE "public"."superadmins" TO "service_role";



GRANT ALL ON TABLE "public"."work_shifts" TO "anon";
GRANT ALL ON TABLE "public"."work_shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."work_shifts" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







