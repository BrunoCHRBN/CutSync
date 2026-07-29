BEGIN;

-- CutSync Support Center.
-- Jira Service Management remains authoritative for the external workflow.
-- These tables contain the secure product projection, routing and durable outboxes.

CREATE TABLE public.support_runtime_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  allow_new_tickets boolean NOT NULL DEFAULT false,
  sync_enabled boolean NOT NULL DEFAULT false,
  maintenance_message text CHECK (
    maintenance_message IS NULL
    OR char_length(btrim(maintenance_message)) BETWEEN 3 AND 500
  ),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_runtime_consistent CHECK (
    enabled
    OR (NOT allow_new_tickets AND NOT sync_enabled)
  ),
  CONSTRAINT support_sync_requires_runtime CHECK (
    NOT sync_enabled OR enabled
  )
);

INSERT INTO public.support_runtime_settings (
  id,
  enabled,
  allow_new_tickets,
  sync_enabled,
  maintenance_message
)
VALUES (
  true,
  false,
  false,
  false,
  'A Central de Suporte está em implantação.'
);

CREATE TABLE public.support_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9_]{3,60}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  level integer NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 3),
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX support_teams_single_default_idx
  ON public.support_teams (is_default)
  WHERE is_default;

INSERT INTO public.support_teams (
  id,
  code,
  name,
  level,
  active,
  is_default
)
VALUES (
  'b3000000-0000-4000-8000-000000000001',
  'SUPORTE_GERAL',
  'Suporte Geral',
  0,
  true,
  true
);

CREATE TABLE public.support_team_members (
  team_id uuid NOT NULL REFERENCES public.support_teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_role text NOT NULL CHECK (member_role IN ('agent', 'lead')),
  jira_account_id text CHECK (
    jira_account_id IS NULL
    OR char_length(btrim(jira_account_id)) BETWEEN 1 AND 255
  ),
  is_active boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, profile_id),
  CONSTRAINT active_support_member_has_jira_account CHECK (
    NOT is_active OR jira_account_id IS NOT NULL
  )
);

CREATE INDEX support_team_members_profile_idx
  ON public.support_team_members (profile_id, is_active);

CREATE UNIQUE INDEX support_team_members_jira_account_idx
  ON public.support_team_members (jira_account_id)
  WHERE jira_account_id IS NOT NULL AND is_active;

CREATE TABLE public.support_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority_order integer NOT NULL CHECK (priority_order BETWEEN 1 AND 100000),
  rule_version integer NOT NULL DEFAULT 1 CHECK (rule_version > 0),
  product text CHECK (product IS NULL OR product IN ('client', 'business', 'web', 'control')),
  requester_role text CHECK (
    requester_role IS NULL
    OR char_length(btrim(requester_role)) BETWEEN 2 AND 60
  ),
  category text CHECK (
    category IS NULL
    OR category IN (
      'access_identity',
      'booking',
      'business_operations',
      'billing',
      'marketplace',
      'security_privacy',
      'platform_incident',
      'product_feedback',
      'other'
      )
  ),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE,
  region text CHECK (region IS NULL OR char_length(btrim(region)) BETWEEN 2 AND 80),
  state text CHECK (state IS NULL OR char_length(btrim(state)) BETWEEN 2 AND 80),
  city text CHECK (city IS NULL OR char_length(btrim(city)) BETWEEN 2 AND 120),
  target_team_id uuid NOT NULL REFERENCES public.support_teams(id) ON DELETE RESTRICT,
  default_escalation_level integer NOT NULL DEFAULT 0
    CHECK (default_escalation_level BETWEEN 0 AND 3),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_routing_rules_match_idx
  ON public.support_routing_rules (
    active,
    product,
    category,
    organization_id,
    establishment_id,
    region,
    state,
    city,
    priority_order
  );

INSERT INTO public.support_routing_rules (
  id,
  priority_order,
  rule_version,
  target_team_id,
  default_escalation_level,
  active
)
VALUES (
  'b3000000-0000-4000-8000-000000000002',
  100000,
  1,
  'b3000000-0000-4000-8000-000000000001',
  0,
  true
);

CREATE TABLE public.support_business_holidays (
  holiday_date date PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE DEFAULT (
    'CS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ),
  requester_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requester_role text NOT NULL CHECK (
    char_length(btrim(requester_role)) BETWEEN 2 AND 60
  ),
  product text NOT NULL CHECK (product IN ('client', 'business', 'web', 'control')),
  category text NOT NULL CHECK (category IN (
    'access_identity',
    'booking',
    'business_operations',
    'billing',
    'marketplace',
    'security_privacy',
    'platform_incident',
    'product_feedback',
    'other'
  )),
  subcategory text CHECK (
    subcategory IS NULL
    OR char_length(btrim(subcategory)) BETWEEN 2 AND 80
  ),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 5 AND 120),
  impact text NOT NULL CHECK (impact IN ('low', 'normal', 'high', 'critical')),
  priority text NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',
    'open',
    'in_progress',
    'waiting_user',
    'resolved',
    'closed',
    'sync_failed'
  )),
  escalation_level integer NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3),
  team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  assignee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_display_name text CHECK (
    assignee_display_name IS NULL
    OR char_length(btrim(assignee_display_name)) BETWEEN 1 AND 120
  ),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  appointment_id text REFERENCES public.appointments(id) ON DELETE SET NULL,
  location_source text NOT NULL DEFAULT 'none' CHECK (
    location_source IN ('none', 'appointment', 'establishment', 'organization')
  ),
  location_label text CHECK (
    location_label IS NULL
    OR char_length(btrim(location_label)) BETWEEN 2 AND 160
  ),
  location_address text CHECK (
    location_address IS NULL
    OR char_length(btrim(location_address)) BETWEEN 2 AND 500
  ),
  location_region text CHECK (
    location_region IS NULL
    OR char_length(btrim(location_region)) BETWEEN 2 AND 80
  ),
  location_state text CHECK (
    location_state IS NULL
    OR char_length(btrim(location_state)) BETWEEN 2 AND 80
  ),
  location_city text CHECK (
    location_city IS NULL
    OR char_length(btrim(location_city)) BETWEEN 2 AND 120
  ),
  routing_version integer NOT NULL DEFAULT 1 CHECK (routing_version > 0),
  create_idempotency_key text,
  jsm_issue_id text UNIQUE CHECK (
    jsm_issue_id IS NULL OR char_length(btrim(jsm_issue_id)) BETWEEN 1 AND 120
  ),
  jsm_issue_key text UNIQUE CHECK (
    jsm_issue_key IS NULL OR char_length(btrim(jsm_issue_key)) BETWEEN 1 AND 80
  ),
  jsm_issue_url text CHECK (
    jsm_issue_url IS NULL OR jsm_issue_url ~ '^https://'
  ),
  sync_status text NOT NULL DEFAULT 'pending' CHECK (
    sync_status IN ('pending', 'processing', 'synced', 'failed')
  ),
  last_sync_error_code text CHECK (
    last_sync_error_code IS NULL
    OR last_sync_error_code ~ '^[a-z0-9_:-]{1,120}$'
  ),
  first_response_due_at timestamptz,
  first_responded_at timestamptz,
  sla_breached boolean NOT NULL DEFAULT false,
  provider_updated_at timestamptz,
  last_reconciled_at timestamptz,
  next_reconcile_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  content_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_requester_or_purged CHECK (
    requester_id IS NOT NULL OR content_purged_at IS NOT NULL
  ),
  CONSTRAINT support_ticket_create_idempotency CHECK (
    create_idempotency_key IS NULL
    OR char_length(btrim(create_idempotency_key)) BETWEEN 8 AND 160
  ),
  UNIQUE (requester_id, create_idempotency_key)
);

CREATE INDEX support_tickets_requester_idx
  ON public.support_tickets (requester_id, last_message_at DESC)
  WHERE requester_id IS NOT NULL;
CREATE INDEX support_tickets_team_queue_idx
  ON public.support_tickets (team_id, status, priority, created_at DESC);
CREATE INDEX support_tickets_reconciliation_idx
  ON public.support_tickets (next_reconcile_at, id)
  WHERE jsm_issue_key IS NOT NULL AND status NOT IN ('closed');
CREATE INDEX support_tickets_sla_idx
  ON public.support_tickets (team_id, first_response_due_at)
  WHERE first_responded_at IS NULL
    AND status NOT IN ('resolved', 'closed');

CREATE TABLE public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_kind text NOT NULL CHECK (author_kind IN ('requester', 'support', 'system')),
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_display_name text NOT NULL CHECK (
    char_length(btrim(author_display_name)) BETWEEN 1 AND 120
  ),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  is_public boolean NOT NULL DEFAULT true CHECK (is_public),
  idempotency_key text,
  jsm_comment_id text UNIQUE CHECK (
    jsm_comment_id IS NULL
    OR char_length(btrim(jsm_comment_id)) BETWEEN 1 AND 120
  ),
  sync_status text NOT NULL DEFAULT 'pending' CHECK (
    sync_status IN ('pending', 'processing', 'synced', 'failed')
  ),
  last_sync_error_code text CHECK (
    last_sync_error_code IS NULL
    OR last_sync_error_code ~ '^[a-z0-9_:-]{1,120}$'
  ),
  synced_at timestamptz,
  content_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_message_idempotency_length CHECK (
    idempotency_key IS NULL
    OR char_length(btrim(idempotency_key)) BETWEEN 8 AND 160
  ),
  UNIQUE (ticket_id, idempotency_key)
);

CREATE INDEX support_messages_ticket_idx
  ON public.support_messages (ticket_id, created_at, id);

CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    char_length(btrim(event_type)) BETWEEN 3 AND 80
  ),
  from_value text CHECK (
    from_value IS NULL OR char_length(btrim(from_value)) BETWEEN 1 AND 160
  ),
  to_value text CHECK (
    to_value IS NULL OR char_length(btrim(to_value)) BETWEEN 1 AND 160
  ),
  reason text CHECK (
    reason IS NULL OR char_length(btrim(reason)) BETWEEN 10 AND 500
  ),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_display_name text CHECK (
    actor_display_name IS NULL
    OR char_length(btrim(actor_display_name)) BETWEEN 1 AND 120
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_events_ticket_idx
  ON public.support_ticket_events (ticket_id, created_at, id);

CREATE TABLE public.support_sync_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE CASCADE,
  operation_type text NOT NULL CHECK (
    operation_type IN ('create_ticket', 'add_comment', 'update_ticket', 'reconcile_ticket')
  ),
  idempotency_key text NOT NULL UNIQUE CHECK (
    char_length(btrim(idempotency_key)) BETWEEN 8 AND 255
  ),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'retry', 'completed', 'dead_letter')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  last_error_code text CHECK (
    last_error_code IS NULL
    OR last_error_code ~ '^[a-z0-9_:-]{1,120}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_sync_message_contract CHECK (
    (operation_type = 'add_comment' AND message_id IS NOT NULL)
    OR operation_type <> 'add_comment'
  )
);

CREATE INDEX support_sync_operations_queue_idx
  ON public.support_sync_operations (status, available_at, created_at)
  WHERE status IN ('pending', 'processing', 'retry');
CREATE INDEX support_sync_operations_ticket_idx
  ON public.support_sync_operations (ticket_id, created_at DESC);

CREATE TABLE public.support_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'support_reply_received',
    'support_waiting_user',
    'support_resolved'
  )),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_device_id uuid NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_messages(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'ticketed',
    'sent',
    'failed',
    'skipped'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  expo_ticket_id text,
  ticketed_at timestamptz,
  receipt_checked_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_key, push_device_id)
);

CREATE INDEX support_push_deliveries_pending_idx
  ON public.support_push_deliveries (available_at, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX support_push_deliveries_receipts_idx
  ON public.support_push_deliveries (ticketed_at, receipt_checked_at)
  WHERE status = 'ticketed';

CREATE OR REPLACE FUNCTION public.support_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_support_sync_operation(
  target_operation_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  claimed_ticket_id uuid;
  claimed_message_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.support_runtime_settings AS settings
    WHERE settings.id
      AND settings.enabled
      AND settings.sync_enabled
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.support_sync_operations AS operation
  SET status = 'pending',
      locked_at = NULL,
      locked_by = NULL
  WHERE operation.id = target_operation_id
    AND operation.status = 'processing'
    AND operation.locked_at < now() - interval '5 minutes'
    AND operation.attempts < 5;

  UPDATE public.support_sync_operations AS operation
  SET status = 'processing',
      attempts = operation.attempts + 1,
      locked_at = now(),
      locked_by = 'direct:' || gen_random_uuid(),
      last_error_code = NULL
  FROM public.support_tickets AS ticket
  WHERE operation.id = target_operation_id
    AND operation.ticket_id = ticket.id
    AND operation.status = 'pending'
    AND operation.available_at <= now()
    AND operation.attempts < 5
    AND operation.operation_type IN ('create_ticket', 'add_comment')
    AND (
      operation.operation_type = 'create_ticket'
      OR ticket.jsm_issue_key IS NOT NULL
    )
    AND ticket.content_purged_at IS NULL
  RETURNING operation.ticket_id, operation.message_id
  INTO claimed_ticket_id, claimed_message_id;

  IF claimed_ticket_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.support_tickets
  SET sync_status = 'processing',
      last_sync_error_code = NULL
  WHERE id = claimed_ticket_id;

  IF claimed_message_id IS NOT NULL THEN
    UPDATE public.support_messages
    SET sync_status = 'processing',
        last_sync_error_code = NULL
    WHERE id = claimed_message_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_support_team_member(
  target_profile_id uuid,
  target_jira_account_id text,
  target_role text,
  target_active boolean,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_context jsonb;
  actor_id uuid;
  actor_role text;
  default_team_id uuid;
  normalized_jira_account_id text;
  existing_member public.support_team_members%ROWTYPE;
  saved_member public.support_team_members%ROWTYPE;
  active_member_count integer;
  active_lead_count integer;
BEGIN
  control_context := public.get_control_context();
  actor_id := (control_context->>'profile_id')::uuid;
  actor_role := control_context->>'role';

  IF actor_role <> 'SaaS_Owner' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'invalid_support_profile';
  END IF;
  IF target_role NOT IN ('agent', 'lead') THEN
    RAISE EXCEPTION 'invalid_support_member_role';
  END IF;
  IF target_active IS NULL THEN
    RAISE EXCEPTION 'invalid_support_member_status';
  END IF;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  normalized_jira_account_id :=
    nullif(btrim(coalesce(target_jira_account_id, '')), '');
  IF target_active
    AND (
      normalized_jira_account_id IS NULL
      OR char_length(normalized_jira_account_id) > 255
    )
  THEN
    RAISE EXCEPTION 'jira_account_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.governance_users AS governance
    JOIN public.profiles AS profile ON profile.id = governance.profile_id
    WHERE governance.profile_id = target_profile_id
      AND governance.is_active
      AND governance.revoked_at IS NULL
      AND (
        governance.expires_at IS NULL
        OR governance.expires_at > now()
      )
      AND profile.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'support_member_must_be_governance_user';
  END IF;

  SELECT team.id
  INTO default_team_id
  FROM public.support_teams AS team
  WHERE team.active
    AND team.is_default
  ORDER BY team.code
  LIMIT 1
  FOR UPDATE;
  IF default_team_id IS NULL THEN
    RAISE EXCEPTION 'support_routing_unavailable';
  END IF;

  SELECT count(*)
  INTO active_member_count
  FROM public.support_team_members
  WHERE is_active;

  IF active_member_count = 0
    AND (
      target_profile_id <> actor_id
      OR NOT target_active
      OR target_role <> 'lead'
    )
  THEN
    RAISE EXCEPTION 'support_owner_bootstrap_required';
  END IF;

  SELECT *
  INTO existing_member
  FROM public.support_team_members
  WHERE team_id = default_team_id
    AND profile_id = target_profile_id
  FOR UPDATE;

  IF FOUND
    AND existing_member.is_active
    AND existing_member.member_role = 'lead'
    AND (NOT target_active OR target_role <> 'lead')
  THEN
    SELECT count(*)
    INTO active_lead_count
    FROM public.support_team_members
    WHERE team_id = default_team_id
      AND is_active
      AND member_role = 'lead';
    IF active_lead_count <= 1 THEN
      RAISE EXCEPTION 'last_support_lead_required';
    END IF;
  END IF;

  INSERT INTO public.support_team_members (
    team_id,
    profile_id,
    member_role,
    jira_account_id,
    is_active,
    assigned_by,
    assigned_at
  )
  VALUES (
    default_team_id,
    target_profile_id,
    target_role,
    normalized_jira_account_id,
    target_active,
    actor_id,
    now()
  )
  ON CONFLICT (team_id, profile_id) DO UPDATE
  SET member_role = EXCLUDED.member_role,
      jira_account_id = EXCLUDED.jira_account_id,
      is_active = EXCLUDED.is_active,
      assigned_by = EXCLUDED.assigned_by,
      assigned_at = CASE
        WHEN public.support_team_members.is_active IS DISTINCT FROM EXCLUDED.is_active
          THEN now()
        ELSE public.support_team_members.assigned_at
      END
  RETURNING * INTO saved_member;

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    actor_id,
    'control.support.team_member_configured',
    target_profile_id,
    'profile',
    jsonb_build_object(
      'team_id', default_team_id,
      'member_role', target_role,
      'is_active', target_active,
      'jira_account_configured', normalized_jira_account_id IS NOT NULL,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'team_id', saved_member.team_id,
    'profile_id', saved_member.profile_id,
    'member_role', saved_member.member_role,
    'jira_account_id', saved_member.jira_account_id,
    'is_active', saved_member.is_active,
    'updated_at', saved_member.updated_at
  );
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'jira_account_already_assigned';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_control_support_runtime(
  target_enabled boolean,
  target_allow_new_tickets boolean,
  target_sync_enabled boolean,
  target_maintenance_message text,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_context jsonb;
  actor_id uuid;
  normalized_allow_new_tickets boolean;
  normalized_sync_enabled boolean;
  normalized_maintenance_message text;
  saved_settings public.support_runtime_settings%ROWTYPE;
BEGIN
  control_context := public.get_control_context();
  actor_id := (control_context->>'profile_id')::uuid;

  IF control_context->>'role' <> 'SaaS_Owner' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_enabled IS NULL
    OR target_allow_new_tickets IS NULL
    OR target_sync_enabled IS NULL
  THEN
    RAISE EXCEPTION 'invalid_support_runtime';
  END IF;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  normalized_allow_new_tickets :=
    target_enabled AND target_allow_new_tickets;
  normalized_sync_enabled := target_enabled AND target_sync_enabled;
  normalized_maintenance_message :=
    nullif(btrim(coalesce(target_maintenance_message, '')), '');
  IF normalized_maintenance_message IS NOT NULL
    AND char_length(normalized_maintenance_message) NOT BETWEEN 3 AND 500
  THEN
    RAISE EXCEPTION 'invalid_maintenance_message';
  END IF;

  UPDATE public.support_runtime_settings
  SET enabled = target_enabled,
      allow_new_tickets = normalized_allow_new_tickets,
      sync_enabled = normalized_sync_enabled,
      maintenance_message = normalized_maintenance_message,
      updated_by = actor_id
  WHERE id
  RETURNING * INTO saved_settings;

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    actor_id,
    'control.support.runtime_configured',
    actor_id,
    'support_runtime',
    jsonb_build_object(
      'enabled', saved_settings.enabled,
      'allow_new_tickets', saved_settings.allow_new_tickets,
      'sync_enabled', saved_settings.sync_enabled,
      'maintenance_message_configured',
        saved_settings.maintenance_message IS NOT NULL,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'enabled', saved_settings.enabled,
    'allow_new_tickets', saved_settings.allow_new_tickets,
    'sync_enabled', saved_settings.sync_enabled,
    'maintenance_message', saved_settings.maintenance_message,
    'updated_at', saved_settings.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_support_message_internal(
  actor_profile_id uuid,
  target_ticket_id uuid,
  message_body text,
  target_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings public.support_runtime_settings%ROWTYPE;
  ticket_row public.support_tickets%ROWTYPE;
  existing_message public.support_messages%ROWTYPE;
  created_message public.support_messages%ROWTYPE;
  created_operation public.support_sync_operations%ROWTYPE;
  next_status text;
BEGIN
  SELECT *
  INTO ticket_row
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
    AND ticket.requester_id = actor_profile_id
    AND ticket.content_purged_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  SELECT *
  INTO existing_message
  FROM public.support_messages AS message
  WHERE message.ticket_id = target_ticket_id
    AND message.idempotency_key = target_idempotency_key;

  IF FOUND THEN
    SELECT *
    INTO created_operation
    FROM public.support_sync_operations AS operation
    WHERE operation.message_id = existing_message.id
      AND operation.operation_type = 'add_comment'
    ORDER BY operation.created_at
    LIMIT 1;
    RETURN jsonb_build_object(
      'ticket', public.support_ticket_payload(target_ticket_id),
      'message', public.support_message_payload(existing_message.id),
      'operation', jsonb_build_object(
        'id', created_operation.id,
        'operation_type', created_operation.operation_type,
        'status', created_operation.status
      ),
      'idempotent', true
    );
  END IF;

  SELECT *
  INTO settings
  FROM public.support_runtime_settings
  WHERE id;
  IF NOT coalesce(settings.enabled, false) THEN
    RAISE EXCEPTION 'support_disabled';
  END IF;
  IF ticket_row.status = 'closed' THEN
    RAISE EXCEPTION 'support_ticket_closed';
  END IF;
  IF char_length(btrim(coalesce(message_body, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'invalid_support_message';
  END IF;
  IF char_length(btrim(coalesce(target_idempotency_key, ''))) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  IF (
    SELECT count(*)
    FROM public.support_messages AS message
    WHERE message.author_profile_id = actor_profile_id
      AND message.author_kind = 'requester'
      AND message.created_at >= now() - interval '1 hour'
  ) >= 30 THEN
    RAISE EXCEPTION 'support_rate_limited';
  END IF;

  INSERT INTO public.support_messages (
    ticket_id,
    author_kind,
    author_profile_id,
    author_display_name,
    body,
    idempotency_key,
    sync_status
  )
  VALUES (
    target_ticket_id,
    'requester',
    actor_profile_id,
    'Usuário CutSync',
    btrim(message_body),
    btrim(target_idempotency_key),
    'pending'
  )
  RETURNING * INTO created_message;

  next_status := CASE
    WHEN ticket_row.jsm_issue_key IS NULL THEN 'queued'
    ELSE 'open'
  END;

  UPDATE public.support_tickets
  SET status = next_status,
      sync_status = 'pending',
      last_sync_error_code = NULL,
      last_message_at = created_message.created_at,
      resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END,
      closed_at = NULL
  WHERE id = target_ticket_id;

  INSERT INTO public.support_sync_operations (
    ticket_id,
    message_id,
    operation_type,
    idempotency_key,
    payload
  )
  VALUES (
    target_ticket_id,
    created_message.id,
    'add_comment',
    'comment:' || target_ticket_id || ':' || btrim(target_idempotency_key),
    jsonb_build_object('message_id', created_message.id)
  )
  RETURNING * INTO created_operation;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    event_type,
    from_value,
    to_value,
    actor_profile_id,
    actor_display_name
  )
  VALUES (
    target_ticket_id,
    'requester_replied',
    ticket_row.status,
    next_status,
    actor_profile_id,
    'Usuário CutSync'
  );

  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(target_ticket_id),
    'message', public.support_message_payload(created_message.id),
    'operation', jsonb_build_object(
      'id', created_operation.id,
      'operation_type', created_operation.operation_type,
      'status', created_operation.status
    ),
    'idempotent', false
  );
EXCEPTION WHEN unique_violation THEN
  SELECT *
  INTO existing_message
  FROM public.support_messages AS message
  WHERE message.ticket_id = target_ticket_id
    AND message.idempotency_key = target_idempotency_key;
  IF NOT FOUND THEN
    RAISE;
  END IF;
  SELECT *
  INTO created_operation
  FROM public.support_sync_operations AS operation
  WHERE operation.message_id = existing_message.id
    AND operation.operation_type = 'add_comment'
  ORDER BY operation.created_at
  LIMIT 1;
  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(target_ticket_id),
    'message', public.support_message_payload(existing_message.id),
    'operation', jsonb_build_object(
      'id', created_operation.id,
      'operation_type', created_operation.operation_type,
      'status', created_operation.status
    ),
    'idempotent', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_support_ticket_sync_internal(
  actor_profile_id uuid,
  target_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ticket_row public.support_tickets%ROWTYPE;
  existing_operation public.support_sync_operations%ROWTYPE;
  created_operation public.support_sync_operations%ROWTYPE;
  operation_kind text;
  initial_body text;
BEGIN
  SELECT *
  INTO ticket_row
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
    AND ticket.requester_id = actor_profile_id
    AND ticket.content_purged_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  IF (
    SELECT count(*)
    FROM public.support_sync_operations AS operation
    WHERE operation.ticket_id = target_ticket_id
      AND operation.created_at >= now() - interval '1 hour'
      AND operation.idempotency_key LIKE 'ondemand:%'
  ) >= 10 THEN
    RAISE EXCEPTION 'support_rate_limited';
  END IF;

  SELECT *
  INTO existing_operation
  FROM public.support_sync_operations AS operation
  WHERE operation.ticket_id = target_ticket_id
    AND operation.status IN ('pending', 'processing', 'retry')
  ORDER BY operation.created_at
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ticket', public.support_ticket_payload(target_ticket_id),
      'operation', jsonb_build_object(
        'id', existing_operation.id,
        'operation_type', existing_operation.operation_type,
        'status', existing_operation.status
      ),
      'idempotent', true
    );
  END IF;

  operation_kind := CASE
    WHEN ticket_row.jsm_issue_key IS NULL THEN 'create_ticket'
    ELSE 'reconcile_ticket'
  END;

  IF operation_kind = 'create_ticket' THEN
    SELECT message.body
    INTO initial_body
    FROM public.support_messages AS message
    WHERE message.ticket_id = target_ticket_id
      AND message.author_kind = 'requester'
    ORDER BY message.created_at, message.id
    LIMIT 1;
  END IF;

  INSERT INTO public.support_sync_operations (
    ticket_id,
    operation_type,
    idempotency_key,
    payload
  )
  VALUES (
    target_ticket_id,
    operation_kind,
    'ondemand:' || target_ticket_id || ':' || gen_random_uuid(),
    CASE
      WHEN operation_kind = 'create_ticket'
        THEN jsonb_build_object('initial_message', initial_body)
      ELSE '{}'::jsonb
    END
  )
  RETURNING * INTO created_operation;

  UPDATE public.support_tickets
  SET sync_status = 'pending',
      last_sync_error_code = NULL,
      status = CASE
        WHEN jsm_issue_key IS NULL THEN 'queued'
        WHEN status = 'sync_failed' THEN 'open'
        ELSE status
      END
  WHERE id = target_ticket_id;

  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(target_ticket_id),
    'operation', jsonb_build_object(
      'id', created_operation.id,
      'operation_type', created_operation.operation_type,
      'status', created_operation.status
    ),
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_support_sync_operations(
  target_limit integer DEFAULT 25
)
RETURNS TABLE (
  operation_id uuid,
  operation_type text,
  ticket_id uuid,
  message_id uuid,
  payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.support_runtime_settings AS settings
    WHERE settings.id
      AND settings.enabled
      AND settings.sync_enabled
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT operation.id
    FROM public.support_sync_operations AS operation
    JOIN public.support_tickets AS ticket ON ticket.id = operation.ticket_id
    WHERE (
        operation.status IN ('pending', 'retry')
        OR (
          operation.status = 'processing'
          AND operation.locked_at < now() - interval '5 minutes'
        )
      )
      AND operation.available_at <= now()
      AND operation.attempts < 5
      AND (
        operation.operation_type = 'create_ticket'
        OR ticket.jsm_issue_key IS NOT NULL
      )
    ORDER BY operation.available_at, operation.created_at, operation.id
    FOR UPDATE OF operation SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(target_limit, 25), 1), 100)
  ),
  claimed AS (
    UPDATE public.support_sync_operations AS operation
    SET status = 'processing',
        attempts = operation.attempts + 1,
        locked_at = now(),
        locked_by = gen_random_uuid()::text,
        last_error_code = NULL
    FROM candidates
    WHERE operation.id = candidates.id
    RETURNING operation.*
  ),
  ticket_updates AS (
    UPDATE public.support_tickets AS ticket
    SET sync_status = 'processing',
        last_sync_error_code = NULL
    WHERE ticket.id IN (SELECT claimed.ticket_id FROM claimed)
    RETURNING ticket.id
  ),
  message_updates AS (
    UPDATE public.support_messages AS message
    SET sync_status = 'processing',
        last_sync_error_code = NULL
    WHERE message.id IN (
      SELECT claimed.message_id
      FROM claimed
      WHERE claimed.message_id IS NOT NULL
    )
    RETURNING message.id
  )
  SELECT
    claimed.id,
    claimed.operation_type,
    claimed.ticket_id,
    claimed.message_id,
    claimed.payload
  FROM claimed
  ORDER BY claimed.created_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_support_ticket_creation(
  target_operation_id uuid,
  target_ticket_id uuid,
  target_jsm_issue_id text,
  target_jsm_issue_key text,
  target_jsm_issue_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operation_row public.support_sync_operations%ROWTYPE;
  ticket_row public.support_tickets%ROWTYPE;
BEGIN
  SELECT *
  INTO operation_row
  FROM public.support_sync_operations
  WHERE id = target_operation_id
  FOR UPDATE;
  IF NOT FOUND
    OR operation_row.ticket_id <> target_ticket_id
    OR operation_row.operation_type <> 'create_ticket'
  THEN
    RAISE EXCEPTION 'support_operation_not_found';
  END IF;

  IF operation_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'ticket', public.support_ticket_payload(target_ticket_id),
      'idempotent', true
    );
  END IF;
  IF operation_row.status <> 'processing' THEN
    RAISE EXCEPTION 'support_operation_not_processing';
  END IF;
  IF char_length(btrim(coalesce(target_jsm_issue_id, ''))) NOT BETWEEN 1 AND 120
    OR char_length(btrim(coalesce(target_jsm_issue_key, ''))) NOT BETWEEN 1 AND 80
    OR coalesce(target_jsm_issue_url, '') !~ '^https://'
  THEN
    RAISE EXCEPTION 'invalid_jsm_reference';
  END IF;

  SELECT *
  INTO ticket_row
  FROM public.support_tickets
  WHERE id = target_ticket_id
  FOR UPDATE;

  UPDATE public.support_tickets
  SET jsm_issue_id = btrim(target_jsm_issue_id),
      jsm_issue_key = btrim(target_jsm_issue_key),
      jsm_issue_url = btrim(target_jsm_issue_url),
      status = CASE WHEN status IN ('queued', 'sync_failed') THEN 'open' ELSE status END,
      sync_status = 'synced',
      last_sync_error_code = NULL,
      last_reconciled_at = now(),
      next_reconcile_at = now() + interval '2 minutes'
  WHERE id = target_ticket_id;

  IF operation_row.message_id IS NOT NULL THEN
    UPDATE public.support_messages
    SET sync_status = 'synced',
        synced_at = now(),
        last_sync_error_code = NULL
    WHERE id = operation_row.message_id;
  END IF;

  UPDATE public.support_sync_operations
  SET status = 'completed',
      completed_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = NULL
  WHERE id = target_operation_id;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    event_type,
    from_value,
    to_value,
    actor_display_name
  )
  VALUES (
    target_ticket_id,
    'ticket_synced',
    ticket_row.status,
    'open',
    'Sistema CutSync'
  );

  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(target_ticket_id),
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_support_message_sync(
  target_operation_id uuid,
  target_message_id uuid,
  target_jsm_comment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operation_row public.support_sync_operations%ROWTYPE;
BEGIN
  SELECT *
  INTO operation_row
  FROM public.support_sync_operations
  WHERE id = target_operation_id
  FOR UPDATE;
  IF NOT FOUND
    OR operation_row.message_id <> target_message_id
    OR operation_row.operation_type <> 'add_comment'
  THEN
    RAISE EXCEPTION 'support_operation_not_found';
  END IF;
  IF operation_row.status = 'completed' THEN
    RETURN jsonb_build_object(
      'message', public.support_message_payload(target_message_id),
      'idempotent', true
    );
  END IF;
  IF operation_row.status <> 'processing' THEN
    RAISE EXCEPTION 'support_operation_not_processing';
  END IF;
  IF char_length(btrim(coalesce(target_jsm_comment_id, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_jsm_comment';
  END IF;

  UPDATE public.support_messages
  SET jsm_comment_id = btrim(target_jsm_comment_id),
      sync_status = 'synced',
      synced_at = now(),
      last_sync_error_code = NULL
  WHERE id = target_message_id;

  UPDATE public.support_sync_operations
  SET status = 'completed',
      completed_at = now(),
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = NULL
  WHERE id = target_operation_id;

  UPDATE public.support_tickets AS ticket
  SET sync_status = CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.support_sync_operations AS pending
          WHERE pending.ticket_id = ticket.id
            AND pending.id <> target_operation_id
            AND pending.status IN ('pending', 'processing', 'retry')
        ) THEN 'pending'
        ELSE 'synced'
      END,
      last_sync_error_code = NULL
  WHERE ticket.id = operation_row.ticket_id;

  RETURN jsonb_build_object(
    'message', public.support_message_payload(target_message_id),
    'ticket', public.support_ticket_payload(operation_row.ticket_id),
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_support_sync_operation(
  target_operation_id uuid,
  target_error_code text,
  target_retry_after_seconds integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operation_row public.support_sync_operations%ROWTYPE;
  normalized_error text;
  retryable boolean;
  next_status text;
  retry_delay interval;
BEGIN
  SELECT *
  INTO operation_row
  FROM public.support_sync_operations
  WHERE id = target_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_operation_not_found';
  END IF;
  IF operation_row.status = 'completed' THEN
    RETURN jsonb_build_object('operation_id', target_operation_id, 'idempotent', true);
  END IF;
  IF operation_row.status <> 'processing' THEN
    RAISE EXCEPTION 'support_operation_not_processing';
  END IF;

  normalized_error := left(
    regexp_replace(
      lower(coalesce(target_error_code, 'support_external_failure')),
      '[^a-z0-9_:-]+',
      '_',
      'g'
    ),
    120
  );
  retryable := target_retry_after_seconds IS NOT NULL
    OR normalized_error IN (
      'support_external_unavailable',
      'support_external_rate_limited',
      'support_ticket_not_synced',
      'support_network_failure',
      'support_creation_unknown',
      'support_creation_still_unknown'
    );
  next_status := CASE
    WHEN retryable AND operation_row.attempts < 5 THEN 'retry'
    ELSE 'dead_letter'
  END;
  retry_delay := CASE
    WHEN target_retry_after_seconds IS NOT NULL THEN
      make_interval(secs => LEAST(GREATEST(target_retry_after_seconds, 60), 21600))
    WHEN operation_row.attempts <= 1 THEN interval '1 minute'
    WHEN operation_row.attempts = 2 THEN interval '5 minutes'
    WHEN operation_row.attempts = 3 THEN interval '15 minutes'
    WHEN operation_row.attempts = 4 THEN interval '1 hour'
    ELSE interval '6 hours'
  END;

  UPDATE public.support_sync_operations
  SET status = next_status,
      payload = CASE
        WHEN normalized_error IN (
          'support_creation_unknown',
          'support_creation_still_unknown'
        ) THEN jsonb_set(payload, '{creation_unknown}', 'true'::jsonb, true)
        ELSE payload
      END,
      available_at = CASE
        WHEN next_status = 'retry' THEN now() + retry_delay
        ELSE available_at
      END,
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = normalized_error
  WHERE id = target_operation_id;

  IF operation_row.message_id IS NOT NULL THEN
    UPDATE public.support_messages
    SET sync_status = CASE WHEN next_status = 'retry' THEN 'pending' ELSE 'failed' END,
        last_sync_error_code = normalized_error
    WHERE id = operation_row.message_id;
  END IF;

  UPDATE public.support_tickets
  SET sync_status = CASE WHEN next_status = 'retry' THEN 'pending' ELSE 'failed' END,
      status = CASE
        WHEN next_status = 'dead_letter' AND jsm_issue_key IS NULL THEN 'sync_failed'
        ELSE status
      END,
      last_sync_error_code = normalized_error
  WHERE id = operation_row.ticket_id;

  IF next_status = 'dead_letter' THEN
    INSERT INTO public.support_ticket_events (
      ticket_id,
      event_type,
      to_value,
      actor_display_name
    )
    VALUES (
      operation_row.ticket_id,
      'sync_failed',
      normalized_error,
      'Sistema CutSync'
    );
  END IF;

  RETURN jsonb_build_object(
    'operation_id', target_operation_id,
    'status', next_status,
    'attempts', operation_row.attempts,
    'retry_at', CASE WHEN next_status = 'retry' THEN now() + retry_delay ELSE NULL END,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_support_tickets_for_reconciliation(
  target_limit integer DEFAULT 50
)
RETURNS TABLE (
  ticket_id uuid,
  jsm_issue_id text,
  jsm_issue_key text,
  provider_updated_at timestamptz,
  last_reconciled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.support_runtime_settings AS settings
    WHERE settings.id
      AND settings.enabled
      AND settings.sync_enabled
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT ticket.id
    FROM public.support_tickets AS ticket
    WHERE ticket.jsm_issue_key IS NOT NULL
      AND ticket.content_purged_at IS NULL
      AND ticket.status <> 'closed'
      AND ticket.next_reconcile_at <= now()
    ORDER BY ticket.next_reconcile_at, ticket.updated_at, ticket.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(target_limit, 50), 1), 100)
  ),
  claimed AS (
    UPDATE public.support_tickets AS ticket
    SET next_reconcile_at = now() + interval '5 minutes'
    FROM candidates
    WHERE ticket.id = candidates.id
    RETURNING ticket.*
  )
  SELECT
    claimed.id,
    claimed.jsm_issue_id,
    claimed.jsm_issue_key,
    claimed.provider_updated_at,
    claimed.last_reconciled_at
  FROM claimed
  ORDER BY claimed.next_reconcile_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_support_reconciliation(
  target_ticket_id uuid,
  target_status text,
  target_assignee_jira_account_id text,
  target_assignee_name text,
  target_jsm_updated_at timestamptz,
  target_first_response_due_at timestamptz,
  target_first_responded_at timestamptz,
  target_sla_breached boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ticket_row public.support_tickets%ROWTYPE;
  mapped_assignee_id uuid;
  mapped_assignee_name text;
  normalized_assignee_name text;
  status_changed boolean;
BEGIN
  IF target_status NOT IN (
    'queued',
    'open',
    'in_progress',
    'waiting_user',
    'resolved',
    'closed'
  ) THEN
    RAISE EXCEPTION 'invalid_support_status';
  END IF;

  SELECT *
  INTO ticket_row
  FROM public.support_tickets
  WHERE id = target_ticket_id
    AND jsm_issue_key IS NOT NULL
    AND content_purged_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  IF target_jsm_updated_at IS NOT NULL
    AND ticket_row.provider_updated_at IS NOT NULL
    AND target_jsm_updated_at < ticket_row.provider_updated_at
  THEN
    UPDATE public.support_tickets
    SET last_reconciled_at = now(),
        next_reconcile_at = now() + interval '2 minutes'
    WHERE id = target_ticket_id;
    RETURN jsonb_build_object(
      'ticket', public.support_ticket_payload(target_ticket_id),
      'stale', true
    );
  END IF;

  IF nullif(btrim(coalesce(target_assignee_jira_account_id, '')), '') IS NOT NULL THEN
    SELECT member.profile_id, profile.name
    INTO mapped_assignee_id, mapped_assignee_name
    FROM public.support_team_members AS member
    JOIN public.profiles AS profile ON profile.id = member.profile_id
    WHERE member.team_id = ticket_row.team_id
      AND member.jira_account_id = btrim(target_assignee_jira_account_id)
      AND member.is_active
    LIMIT 1;
  END IF;

  normalized_assignee_name := coalesce(
    mapped_assignee_name,
    nullif(left(btrim(coalesce(target_assignee_name, '')), 120), '')
  );
  status_changed := ticket_row.status IS DISTINCT FROM target_status;

  UPDATE public.support_tickets
  SET status = target_status,
      assignee_profile_id = mapped_assignee_id,
      assignee_display_name = normalized_assignee_name,
      sync_status = 'synced',
      last_sync_error_code = NULL,
      first_response_due_at = coalesce(
        target_first_response_due_at,
        first_response_due_at
      ),
      first_responded_at = coalesce(
        first_responded_at,
        target_first_responded_at
      ),
      sla_breached = coalesce(target_sla_breached, sla_breached),
      provider_updated_at = coalesce(target_jsm_updated_at, provider_updated_at),
      last_reconciled_at = now(),
      next_reconcile_at = now() + interval '2 minutes',
      resolved_at = CASE
        WHEN target_status = 'resolved' THEN coalesce(resolved_at, now())
        ELSE resolved_at
      END,
      closed_at = CASE
        WHEN target_status = 'closed' THEN coalesce(closed_at, now())
        ELSE closed_at
      END
  WHERE id = target_ticket_id;

  IF status_changed THEN
    INSERT INTO public.support_ticket_events (
      ticket_id,
      event_type,
      from_value,
      to_value,
      actor_display_name
    )
    VALUES (
      target_ticket_id,
      'status_changed',
      ticket_row.status,
      target_status,
      'Jira Service Management'
    );
  END IF;

  IF status_changed AND target_status = 'waiting_user' THEN
    PERFORM public.enqueue_support_push(
      target_ticket_id,
      'support_waiting_user',
      'support-status:' || target_ticket_id || ':waiting_user:'
        || coalesce(extract(epoch FROM target_jsm_updated_at)::bigint::text, 'current')
    );
  ELSIF status_changed AND target_status IN ('resolved', 'closed') THEN
    PERFORM public.enqueue_support_push(
      target_ticket_id,
      'support_resolved',
      'support-status:' || target_ticket_id || ':' || target_status || ':'
        || coalesce(extract(epoch FROM target_jsm_updated_at)::bigint::text, 'current')
    );
  END IF;

  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(target_ticket_id),
    'stale', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.import_support_public_message(
  target_ticket_id uuid,
  target_jsm_comment_id text,
  message_body text,
  target_author_jira_account_id text,
  target_author_name text,
  target_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  ticket_row public.support_tickets%ROWTYPE;
  existing_message public.support_messages%ROWTYPE;
  created_message public.support_messages%ROWTYPE;
  mapped_author_id uuid;
  mapped_author_name text;
  author_name text;
BEGIN
  IF char_length(btrim(coalesce(target_jsm_comment_id, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'invalid_jsm_comment';
  END IF;
  IF char_length(btrim(coalesce(message_body, ''))) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'invalid_support_message';
  END IF;

  SELECT *
  INTO existing_message
  FROM public.support_messages
  WHERE jsm_comment_id = btrim(target_jsm_comment_id);
  IF FOUND THEN
    RETURN jsonb_build_object(
      'message', public.support_message_payload(existing_message.id),
      'idempotent', true
    );
  END IF;

  SELECT *
  INTO ticket_row
  FROM public.support_tickets
  WHERE id = target_ticket_id
    AND jsm_issue_key IS NOT NULL
    AND content_purged_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  IF nullif(btrim(coalesce(target_author_jira_account_id, '')), '') IS NOT NULL THEN
    SELECT member.profile_id, profile.name
    INTO mapped_author_id, mapped_author_name
    FROM public.support_team_members AS member
    JOIN public.profiles AS profile ON profile.id = member.profile_id
    WHERE member.team_id = ticket_row.team_id
      AND member.jira_account_id = btrim(target_author_jira_account_id)
      AND member.is_active
    LIMIT 1;
  END IF;
  author_name := coalesce(
    mapped_author_name,
    nullif(left(btrim(coalesce(target_author_name, '')), 120), ''),
    'Equipe CutSync'
  );

  INSERT INTO public.support_messages (
    ticket_id,
    author_kind,
    author_profile_id,
    author_display_name,
    body,
    is_public,
    jsm_comment_id,
    sync_status,
    synced_at,
    created_at
  )
  VALUES (
    target_ticket_id,
    'support',
    mapped_author_id,
    author_name,
    btrim(message_body),
    true,
    btrim(target_jsm_comment_id),
    'synced',
    now(),
    coalesce(target_created_at, now())
  )
  RETURNING * INTO created_message;

  UPDATE public.support_tickets
  SET status = CASE WHEN status = 'closed' THEN status ELSE 'waiting_user' END,
      assignee_profile_id = coalesce(mapped_author_id, assignee_profile_id),
      assignee_display_name = coalesce(author_name, assignee_display_name),
      first_responded_at = coalesce(first_responded_at, created_message.created_at),
      last_message_at = GREATEST(last_message_at, created_message.created_at),
      sync_status = 'synced',
      last_sync_error_code = NULL,
      last_reconciled_at = now(),
      next_reconcile_at = now() + interval '2 minutes'
  WHERE id = target_ticket_id;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    event_type,
    from_value,
    to_value,
    actor_profile_id,
    actor_display_name
  )
  VALUES (
    target_ticket_id,
    'public_support_reply_imported',
    ticket_row.status,
    CASE WHEN ticket_row.status = 'closed' THEN 'closed' ELSE 'waiting_user' END,
    mapped_author_id,
    author_name
  );

  PERFORM public.enqueue_support_push(
    target_ticket_id,
    'support_reply_received',
    'support-comment:' || btrim(target_jsm_comment_id),
    created_message.id
  );

  RETURN jsonb_build_object(
    'message', public.support_message_payload(created_message.id),
    'ticket', public.support_ticket_payload(target_ticket_id),
    'idempotent', false
  );
EXCEPTION WHEN unique_violation THEN
  SELECT *
  INTO existing_message
  FROM public.support_messages
  WHERE jsm_comment_id = btrim(target_jsm_comment_id);
  IF NOT FOUND THEN
    RAISE;
  END IF;
  RETURN jsonb_build_object(
    'message', public.support_message_payload(existing_message.id),
    'idempotent', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.support_control_operator_context(
  allow_owner_without_membership boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_context jsonb;
  actor_id uuid;
  actor_role text;
  member_team_id uuid;
  member_team_code text;
  member_team_name text;
  member_role_value text;
  member_jira_account_id text;
  member_is_active boolean := false;
  can_manage boolean;
BEGIN
  control_context := public.get_control_context();
  actor_id := (control_context->>'profile_id')::uuid;
  actor_role := control_context->>'role';

  SELECT
    member.team_id,
    team.code AS team_code,
    team.name AS team_name,
    member.member_role,
    member.jira_account_id,
    member.is_active
  INTO
    member_team_id,
    member_team_code,
    member_team_name,
    member_role_value,
    member_jira_account_id,
    member_is_active
  FROM public.support_team_members AS member
  JOIN public.support_teams AS team
    ON team.id = member.team_id
    AND team.active
  WHERE member.profile_id = actor_id
    AND member.is_active
  ORDER BY
    (member.member_role = 'lead') DESC,
    team.is_default DESC,
    team.code
  LIMIT 1;

  IF member_team_id IS NULL
    AND NOT (allow_owner_without_membership AND actor_role = 'SaaS_Owner')
  THEN
    RAISE EXCEPTION 'support_team_membership_required';
  END IF;

  can_manage := coalesce(
    (control_context->'permissions') ? 'control.support.manage',
    false
  )
    AND (
      member_role_value = 'lead'
      OR (
        member_team_id IS NULL
        AND actor_role = 'SaaS_Owner'
        AND allow_owner_without_membership
      )
    );

  RETURN jsonb_build_object(
    'profile_id', actor_id,
    'name', control_context->>'name',
    'role', actor_role,
    'can_manage', can_manage,
    'team_id', member_team_id,
    'team_code', member_team_code,
    'team_name', member_team_name,
    'member_role', member_role_value,
    'jira_account_id', member_jira_account_id,
    'active', coalesce(member_is_active, false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_control_support_overview(
  target_status text DEFAULT NULL,
  target_priority text DEFAULT NULL,
  target_category text DEFAULT NULL,
  target_limit integer DEFAULT 25,
  target_before timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operator_payload jsonb;
  capabilities_payload jsonb;
  operator_team_id uuid;
  counts_payload jsonb;
  tickets_payload jsonb;
  next_cursor timestamptz;
  limited_count integer;
  normalized_limit integer := LEAST(GREATEST(coalesce(target_limit, 25), 1), 50);
BEGIN
  IF target_status IS NOT NULL AND target_status NOT IN (
    'queued',
    'open',
    'in_progress',
    'waiting_user',
    'resolved',
    'closed',
    'sync_failed'
  ) THEN
    RAISE EXCEPTION 'invalid_support_status';
  END IF;
  IF target_priority IS NOT NULL
    AND target_priority NOT IN ('low', 'normal', 'high', 'critical')
  THEN
    RAISE EXCEPTION 'invalid_support_priority';
  END IF;
  IF target_category IS NOT NULL AND target_category NOT IN (
    'access_identity',
    'booking',
    'business_operations',
    'billing',
    'marketplace',
    'security_privacy',
    'platform_incident',
    'product_feedback',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid_support_category';
  END IF;

  operator_payload := public.support_control_operator_context(true);
  operator_team_id := nullif(operator_payload->>'team_id', '')::uuid;

  SELECT jsonb_build_object(
    'enabled', settings.enabled,
    'allow_new_tickets', settings.allow_new_tickets,
    'sync_enabled', settings.sync_enabled,
    'maintenance_message', settings.maintenance_message
  )
  INTO capabilities_payload
  FROM public.support_runtime_settings AS settings
  WHERE settings.id;

  IF operator_team_id IS NULL THEN
    counts_payload := jsonb_build_object(
      'total', 0,
      'queued', 0,
      'open', 0,
      'in_progress', 0,
      'waiting_user', 0,
      'resolved', 0,
      'sync_failed', 0,
      'critical', 0,
      'sla_at_risk', 0
    );
    RETURN jsonb_build_object(
      'operator', operator_payload,
      'capabilities', capabilities_payload,
      'counts', counts_payload,
      'tickets', '[]'::jsonb,
      'next_cursor', NULL
    );
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'queued', count(*) FILTER (WHERE ticket.status = 'queued'),
    'open', count(*) FILTER (WHERE ticket.status = 'open'),
    'in_progress', count(*) FILTER (WHERE ticket.status = 'in_progress'),
    'waiting_user', count(*) FILTER (WHERE ticket.status = 'waiting_user'),
    'resolved', count(*) FILTER (WHERE ticket.status IN ('resolved', 'closed')),
    'sync_failed', count(*) FILTER (
      WHERE ticket.status = 'sync_failed' OR ticket.sync_status = 'failed'
    ),
    'critical', count(*) FILTER (
      WHERE ticket.priority = 'critical'
        AND ticket.status NOT IN ('resolved', 'closed')
    ),
    'sla_at_risk', count(*) FILTER (
      WHERE ticket.first_responded_at IS NULL
        AND ticket.status NOT IN ('resolved', 'closed')
        AND (
          ticket.sla_breached
          OR ticket.first_response_due_at <= now() + interval '1 hour'
        )
    )
  )
  INTO counts_payload
  FROM public.support_tickets AS ticket
  WHERE ticket.team_id = operator_team_id
    AND ticket.content_purged_at IS NULL;

  WITH filtered AS (
    SELECT ticket.*
    FROM public.support_tickets AS ticket
    WHERE ticket.team_id = operator_team_id
      AND ticket.content_purged_at IS NULL
      AND (target_status IS NULL OR ticket.status = target_status)
      AND (target_priority IS NULL OR ticket.priority = target_priority)
      AND (target_category IS NULL OR ticket.category = target_category)
      AND (target_before IS NULL OR ticket.created_at < target_before)
    ORDER BY ticket.created_at DESC, ticket.id DESC
    LIMIT normalized_limit
  )
  SELECT
    coalesce(
      jsonb_agg(public.support_ticket_payload(filtered.id)
        ORDER BY filtered.created_at DESC, filtered.id DESC),
      '[]'::jsonb
    ),
    count(*)::integer,
    min(filtered.created_at)
  INTO tickets_payload, limited_count, next_cursor
  FROM filtered;

  IF limited_count < normalized_limit THEN
    next_cursor := NULL;
  END IF;

  RETURN jsonb_build_object(
    'operator', operator_payload,
    'capabilities', capabilities_payload,
    'counts', counts_payload,
    'tickets', tickets_payload,
    'next_cursor', next_cursor
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_control_support_ticket(
  target_ticket_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operator_payload jsonb;
  operator_team_id uuid;
  ticket_payload jsonb;
  messages_payload jsonb;
  events_payload jsonb;
BEGIN
  operator_payload := public.support_control_operator_context(false);
  operator_team_id := (operator_payload->>'team_id')::uuid;

  SELECT public.support_ticket_payload(ticket.id)
  INTO ticket_payload
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
    AND ticket.team_id = operator_team_id
    AND ticket.content_purged_at IS NULL;
  IF ticket_payload IS NULL THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  SELECT coalesce(
    jsonb_agg(public.support_message_payload(message.id)
      ORDER BY message.created_at, message.id),
    '[]'::jsonb
  )
  INTO messages_payload
  FROM public.support_messages AS message
  WHERE message.ticket_id = target_ticket_id
    AND message.is_public;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', event.id,
        'event_type', event.event_type,
        'from_value', event.from_value,
        'to_value', event.to_value,
        'reason', event.reason,
        'actor_display_name', event.actor_display_name,
        'created_at', event.created_at
      )
      ORDER BY event.created_at, event.id
    ),
    '[]'::jsonb
  )
  INTO events_payload
  FROM public.support_ticket_events AS event
  WHERE event.ticket_id = target_ticket_id;

  RETURN jsonb_build_object(
    'ticket', ticket_payload,
    'messages', messages_payload,
    'events', events_payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reprocess_support_sync(
  target_ticket_id uuid,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operator_payload jsonb;
  operator_id uuid;
  operator_team_id uuid;
  ticket_row public.support_tickets%ROWTYPE;
  operation_row public.support_sync_operations%ROWTYPE;
  initial_body text;
  operation_kind text;
  was_idempotent boolean := false;
BEGIN
  operator_payload := public.support_control_operator_context(false);
  IF NOT coalesce((operator_payload->>'can_manage')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  operator_id := (operator_payload->>'profile_id')::uuid;
  operator_team_id := (operator_payload->>'team_id')::uuid;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT *
  INTO ticket_row
  FROM public.support_tickets
  WHERE id = target_ticket_id
    AND team_id = operator_team_id
    AND content_purged_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  SELECT *
  INTO operation_row
  FROM public.support_sync_operations
  WHERE ticket_id = target_ticket_id
    AND status IN ('pending', 'processing', 'retry')
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF operation_row.status <> 'processing' THEN
      UPDATE public.support_sync_operations
      SET status = 'pending',
          attempts = 0,
          available_at = now(),
          locked_at = NULL,
          locked_by = NULL,
          last_error_code = NULL
      WHERE id = operation_row.id
      RETURNING * INTO operation_row;
    END IF;
    was_idempotent := true;
  ELSE
    operation_kind := CASE
      WHEN ticket_row.jsm_issue_key IS NULL THEN 'create_ticket'
      ELSE 'reconcile_ticket'
    END;
    IF operation_kind = 'create_ticket' THEN
      SELECT message.body
      INTO initial_body
      FROM public.support_messages AS message
      WHERE message.ticket_id = target_ticket_id
        AND message.author_kind = 'requester'
      ORDER BY message.created_at, message.id
      LIMIT 1;
    END IF;
    INSERT INTO public.support_sync_operations (
      ticket_id,
      operation_type,
      idempotency_key,
      payload
    )
    VALUES (
      target_ticket_id,
      operation_kind,
      'control-reprocess:' || target_ticket_id || ':' || gen_random_uuid(),
      CASE
        WHEN operation_kind = 'create_ticket'
          THEN jsonb_build_object('initial_message', initial_body)
        ELSE '{}'::jsonb
      END
    )
    RETURNING * INTO operation_row;
  END IF;

  UPDATE public.support_tickets
  SET sync_status = 'pending',
      status = CASE
        WHEN jsm_issue_key IS NULL THEN 'queued'
        WHEN status = 'sync_failed' THEN 'open'
        ELSE status
      END,
      last_sync_error_code = NULL
  WHERE id = target_ticket_id;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    event_type,
    reason,
    actor_profile_id,
    actor_display_name
  )
  VALUES (
    target_ticket_id,
    'sync_reprocess_requested',
    btrim(reason),
    operator_id,
    operator_payload->>'name'
  );

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    operator_id,
    'control.support.sync_reprocessed',
    target_ticket_id,
    'support_ticket',
    jsonb_build_object('reason_provided', true)
  );

  RETURN jsonb_build_object(
    'ticket_id', target_ticket_id,
    'sync_status', 'pending',
    'operation_id', operation_row.id,
    'idempotent', was_idempotent
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.escalate_support_ticket(
  target_ticket_id uuid,
  target_level integer,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  operator_payload jsonb;
  operator_id uuid;
  operator_team_id uuid;
  ticket_row public.support_tickets%ROWTYPE;
  next_priority text;
  operation_row public.support_sync_operations%ROWTYPE;
  result_updated_at timestamptz;
BEGIN
  operator_payload := public.support_control_operator_context(false);
  IF NOT coalesce((operator_payload->>'can_manage')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  operator_id := (operator_payload->>'profile_id')::uuid;
  operator_team_id := (operator_payload->>'team_id')::uuid;
  IF target_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'invalid_escalation_level';
  END IF;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  SELECT *
  INTO ticket_row
  FROM public.support_tickets
  WHERE id = target_ticket_id
    AND team_id = operator_team_id
    AND content_purged_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;
  IF target_level <= ticket_row.escalation_level THEN
    RAISE EXCEPTION 'escalation_must_increase';
  END IF;

  next_priority := CASE
    WHEN target_level = 3 THEN 'critical'
    WHEN target_level = 2 THEN 'high'
    WHEN ticket_row.priority = 'low' THEN 'normal'
    ELSE ticket_row.priority
  END;

  UPDATE public.support_tickets
  SET escalation_level = target_level,
      priority = next_priority,
      status = CASE
        WHEN status IN ('resolved', 'closed', 'sync_failed')
          THEN CASE WHEN jsm_issue_key IS NULL THEN 'queued' ELSE 'in_progress' END
        ELSE status
      END,
      resolved_at = CASE WHEN status = 'resolved' THEN NULL ELSE resolved_at END,
      closed_at = CASE WHEN status = 'closed' THEN NULL ELSE closed_at END
  WHERE id = target_ticket_id
  RETURNING updated_at INTO result_updated_at;

  INSERT INTO public.support_sync_operations (
    ticket_id,
    operation_type,
    idempotency_key,
    payload
  )
  VALUES (
    target_ticket_id,
    'update_ticket',
    'control-escalation:' || target_ticket_id || ':' || target_level || ':' || gen_random_uuid(),
    jsonb_build_object('escalation_level', target_level)
  )
  RETURNING * INTO operation_row;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    event_type,
    from_value,
    to_value,
    reason,
    actor_profile_id,
    actor_display_name
  )
  VALUES (
    target_ticket_id,
    'ticket_escalated',
    ticket_row.escalation_level::text,
    target_level::text,
    btrim(reason),
    operator_id,
    operator_payload->>'name'
  );

  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    operator_id,
    'control.support.ticket_escalated',
    target_ticket_id,
    'support_ticket',
    jsonb_build_object(
      'from_level', ticket_row.escalation_level,
      'to_level', target_level,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'ticket_id', target_ticket_id,
    'escalation_level', target_level,
    'priority', next_priority,
    'updated_at', result_updated_at,
    'operation_id', operation_row.id
  );
END;
$$;

CREATE TRIGGER support_runtime_touch_updated_at
  BEFORE UPDATE ON public.support_runtime_settings
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_teams_touch_updated_at
  BEFORE UPDATE ON public.support_teams
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_team_members_touch_updated_at
  BEFORE UPDATE ON public.support_team_members
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_routing_rules_touch_updated_at
  BEFORE UPDATE ON public.support_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_business_holidays_touch_updated_at
  BEFORE UPDATE ON public.support_business_holidays
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_tickets_touch_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_messages_touch_updated_at
  BEFORE UPDATE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_sync_operations_touch_updated_at
  BEFORE UPDATE ON public.support_sync_operations
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();
CREATE TRIGGER support_push_deliveries_touch_updated_at
  BEFORE UPDATE ON public.support_push_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_updated_at();

CREATE OR REPLACE FUNCTION public.support_is_business_day(target_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT extract(isodow FROM target_date) BETWEEN 1 AND 5
    AND NOT EXISTS (
      SELECT 1
      FROM public.support_business_holidays AS holiday
      WHERE holiday.holiday_date = target_date
        AND holiday.active
    );
$$;

CREATE OR REPLACE FUNCTION public.support_add_business_minutes(
  target_at timestamptz,
  target_minutes integer
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  local_cursor timestamp;
  remaining_minutes integer := GREATEST(COALESCE(target_minutes, 0), 0);
  available_minutes integer;
  local_close timestamp;
BEGIN
  IF target_at IS NULL THEN
    RETURN NULL;
  END IF;

  local_cursor := target_at AT TIME ZONE 'America/Sao_Paulo';

  LOOP
    IF NOT public.support_is_business_day(local_cursor::date) THEN
      local_cursor := date_trunc('day', local_cursor) + interval '1 day 9 hours';
      CONTINUE;
    END IF;
    IF local_cursor::time < time '09:00' THEN
      local_cursor := date_trunc('day', local_cursor) + interval '9 hours';
    ELSIF local_cursor::time >= time '18:00' THEN
      local_cursor := date_trunc('day', local_cursor) + interval '1 day 9 hours';
      CONTINUE;
    END IF;
    EXIT;
  END LOOP;

  WHILE remaining_minutes > 0 LOOP
    IF NOT public.support_is_business_day(local_cursor::date) THEN
      local_cursor := date_trunc('day', local_cursor) + interval '1 day 9 hours';
      CONTINUE;
    END IF;

    local_close := date_trunc('day', local_cursor) + interval '18 hours';
    available_minutes := GREATEST(
      floor(extract(epoch FROM (local_close - local_cursor)) / 60)::integer,
      0
    );

    IF remaining_minutes <= available_minutes THEN
      local_cursor := local_cursor + make_interval(mins => remaining_minutes);
      remaining_minutes := 0;
    ELSE
      remaining_minutes := remaining_minutes - available_minutes;
      local_cursor := date_trunc('day', local_cursor) + interval '1 day 9 hours';
    END IF;
  END LOOP;

  RETURN local_cursor AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

CREATE OR REPLACE FUNCTION public.support_first_response_due_at(
  target_created_at timestamptz,
  target_priority text
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.support_add_business_minutes(
    target_created_at,
    CASE target_priority
      WHEN 'critical' THEN 60
      WHEN 'high' THEN 240
      WHEN 'normal' THEN 540
      WHEN 'low' THEN 1080
      ELSE 540
    END
  );
$$;

CREATE OR REPLACE FUNCTION public.support_ticket_payload(target_ticket_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', ticket.id,
    'protocol', ticket.protocol,
    'requester_id', ticket.requester_id,
    'requester_role', ticket.requester_role,
    'requester_display_name', CASE
      WHEN ticket.requester_id IS NULL THEN NULL
      ELSE coalesce(requester.name, 'Usuário CutSync')
    END,
    'product', ticket.product,
    'category', ticket.category,
    'subcategory', ticket.subcategory,
    'subject', ticket.subject,
    'impact', ticket.impact,
    'priority', ticket.priority,
    'status', ticket.status,
    'escalation_level', ticket.escalation_level,
    'team_id', ticket.team_id,
    'team_code', team.code,
    'team_name', team.name,
    'assignee_profile_id', ticket.assignee_profile_id,
    'assignee_name', coalesce(assignee.name, ticket.assignee_display_name),
    'assignee_display_name', coalesce(assignee.name, ticket.assignee_display_name),
    'establishment_id', ticket.establishment_id,
    'organization_id', ticket.organization_id,
    'appointment_id', ticket.appointment_id,
    'location_label', ticket.location_label,
    'location_address', ticket.location_address,
    'location_region', ticket.location_region,
    'location_state', ticket.location_state,
    'location_city', ticket.location_city,
    'routing_version', ticket.routing_version,
    'jsm_issue_key', ticket.jsm_issue_key,
    'jsm_issue_url', ticket.jsm_issue_url,
    'sync_status', ticket.sync_status,
    'last_sync_error_code', ticket.last_sync_error_code,
    'first_response_due_at', ticket.first_response_due_at,
    'first_responded_at', ticket.first_responded_at,
    'sla_breached', ticket.sla_breached,
    'last_message_at', ticket.last_message_at,
    'resolved_at', ticket.resolved_at,
    'closed_at', ticket.closed_at,
    'created_at', ticket.created_at,
    'updated_at', ticket.updated_at
  )
  FROM public.support_tickets AS ticket
  LEFT JOIN public.profiles AS requester ON requester.id = ticket.requester_id
  LEFT JOIN public.support_teams AS team ON team.id = ticket.team_id
  LEFT JOIN public.profiles AS assignee ON assignee.id = ticket.assignee_profile_id
  WHERE ticket.id = target_ticket_id;
$$;

CREATE OR REPLACE FUNCTION public.support_message_payload(target_message_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', message.id,
    'ticket_id', message.ticket_id,
    'author_kind', message.author_kind,
    'author_display_name', message.author_display_name,
    'body', message.body,
    'is_public', message.is_public,
    'sync_status', message.sync_status,
    'jsm_comment_id', message.jsm_comment_id,
    'created_at', message.created_at,
    'updated_at', message.updated_at
  )
  FROM public.support_messages AS message
  WHERE message.id = target_message_id
    AND message.is_public;
$$;

CREATE OR REPLACE FUNCTION public.support_public_ticket_payload(
  target_ticket_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', ticket.id,
    'protocol', ticket.protocol,
    'subject', ticket.subject,
    'category', ticket.category,
    'impact', ticket.impact,
    'priority', ticket.priority,
    'status', ticket.status,
    'sync_status', ticket.sync_status,
    'appointment_id', ticket.appointment_id,
    'created_at', ticket.created_at,
    'updated_at', ticket.updated_at,
    'last_message_at', ticket.last_message_at,
    'resolved_at', ticket.resolved_at
  )
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
    AND ticket.content_purged_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.support_public_message_payload(
  target_message_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', message.id,
    'ticket_id', message.ticket_id,
    'author_kind', message.author_kind,
    'author_display_name', message.author_display_name,
    'body', message.body,
    'created_at', message.created_at
  )
  FROM public.support_messages AS message
  WHERE message.id = target_message_id
    AND message.is_public
    AND message.content_purged_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_support_push(
  target_ticket_id uuid,
  target_event_type text,
  target_event_key text,
  target_message_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count integer;
  target_title text;
  target_body text;
BEGIN
  IF target_event_type NOT IN (
    'support_reply_received',
    'support_waiting_user',
    'support_resolved'
  ) THEN
    RAISE EXCEPTION 'invalid_support_notification_type';
  END IF;

  target_title := CASE target_event_type
    WHEN 'support_reply_received' THEN 'Nova resposta do suporte'
    WHEN 'support_waiting_user' THEN 'O suporte aguarda seu retorno'
    WHEN 'support_resolved' THEN 'Chamado resolvido'
  END;
  target_body := CASE target_event_type
    WHEN 'support_reply_received' THEN
      'A equipe CutSync respondeu ao seu chamado.'
    WHEN 'support_waiting_user' THEN
      'Abra o chamado para consultar e responder à equipe CutSync.'
    WHEN 'support_resolved' THEN
      'Seu chamado foi marcado como resolvido.'
  END;

  INSERT INTO public.support_push_deliveries (
    event_key,
    event_type,
    profile_id,
    push_device_id,
    ticket_id,
    message_id,
    title,
    body,
    payload
  )
  SELECT
    target_event_key,
    target_event_type,
    ticket.requester_id,
    device.id,
    ticket.id,
    target_message_id,
    target_title,
    target_body,
    jsonb_build_object(
      'ticketId', ticket.id,
      'eventType', target_event_type,
      'url', '/support/' || ticket.id
    )
  FROM public.support_tickets AS ticket
  JOIN public.profiles AS profile
    ON profile.id = ticket.requester_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(coalesce(profile.notification_channels, ARRAY[]::text[]))
  JOIN public.push_devices AS device
    ON device.profile_id = ticket.requester_id
    AND device.app_kind = 'client'
    AND device.enabled
  WHERE ticket.id = target_ticket_id
    AND ticket.requester_id IS NOT NULL
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_support_capabilities()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings public.support_runtime_settings%ROWTYPE;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    AND coalesce((SELECT auth.role()), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT *
  INTO settings
  FROM public.support_runtime_settings
  WHERE id;

  RETURN jsonb_build_object(
    'enabled', coalesce(settings.enabled, false),
    'allow_new_tickets', coalesce(settings.allow_new_tickets, false),
    'sync_enabled', coalesce(settings.sync_enabled, false),
    'maintenance_message', settings.maintenance_message
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_support_tickets()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  tickets_payload jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT coalesce(
    jsonb_agg(public.support_public_ticket_payload(ticket.id)
      ORDER BY ticket.last_message_at DESC, ticket.id),
    '[]'::jsonb
  )
  INTO tickets_payload
  FROM public.support_tickets AS ticket
  WHERE ticket.requester_id = actor_id
    AND ticket.content_purged_at IS NULL;

  RETURN jsonb_build_object('tickets', tickets_payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_support_ticket(target_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  ticket_payload jsonb;
  messages_payload jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT public.support_public_ticket_payload(ticket.id)
  INTO ticket_payload
  FROM public.support_tickets AS ticket
  WHERE ticket.id = target_ticket_id
    AND ticket.requester_id = actor_id
    AND ticket.content_purged_at IS NULL;

  IF ticket_payload IS NULL THEN
    RAISE EXCEPTION 'support_ticket_not_found';
  END IF;

  SELECT coalesce(
    jsonb_agg(public.support_public_message_payload(message.id)
      ORDER BY message.created_at, message.id),
    '[]'::jsonb
  )
  INTO messages_payload
  FROM public.support_messages AS message
  WHERE message.ticket_id = target_ticket_id
    AND message.is_public;

  RETURN jsonb_build_object(
    'ticket', ticket_payload,
    'messages', messages_payload
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_support_ticket_internal(
  actor_profile_id uuid,
  target_category text,
  target_impact text,
  target_subject text,
  initial_message text,
  target_appointment_id text,
  target_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  settings public.support_runtime_settings%ROWTYPE;
  existing_ticket_id uuid;
  selected_team_id uuid;
  selected_rule_version integer;
  selected_escalation integer;
  selected_priority text;
  selected_establishment_id uuid;
  selected_organization_id uuid;
  selected_location_label text;
  selected_location_address text;
  selected_location_source text := 'none';
  created_ticket public.support_tickets%ROWTYPE;
  created_message public.support_messages%ROWTYPE;
  created_operation public.support_sync_operations%ROWTYPE;
BEGIN
  SELECT ticket.id
  INTO existing_ticket_id
  FROM public.support_tickets AS ticket
  WHERE ticket.requester_id = actor_profile_id
    AND ticket.create_idempotency_key = target_idempotency_key;

  IF existing_ticket_id IS NOT NULL THEN
    SELECT *
    INTO created_operation
    FROM public.support_sync_operations AS operation
    WHERE operation.ticket_id = existing_ticket_id
      AND operation.operation_type = 'create_ticket'
    ORDER BY operation.created_at
    LIMIT 1;

    RETURN jsonb_build_object(
      'ticket', public.support_ticket_payload(existing_ticket_id),
      'operation', jsonb_build_object(
        'id', created_operation.id,
        'operation_type', created_operation.operation_type,
        'status', created_operation.status
      ),
      'idempotent', true
    );
  END IF;

  SELECT *
  INTO settings
  FROM public.support_runtime_settings
  WHERE id;

  IF NOT coalesce(settings.enabled, false) THEN
    RAISE EXCEPTION 'support_disabled';
  END IF;
  IF NOT coalesce(settings.allow_new_tickets, false) THEN
    RAISE EXCEPTION 'support_new_tickets_disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = actor_profile_id
      AND profile.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF target_category NOT IN (
    'access_identity',
    'booking',
    'marketplace',
    'security_privacy',
    'product_feedback',
    'other'
  ) THEN
    RAISE EXCEPTION 'invalid_support_category';
  END IF;
  IF target_impact NOT IN ('low', 'normal', 'high', 'critical') THEN
    RAISE EXCEPTION 'invalid_support_impact';
  END IF;
  IF char_length(btrim(coalesce(target_subject, ''))) NOT BETWEEN 5 AND 120 THEN
    RAISE EXCEPTION 'invalid_support_subject';
  END IF;
  IF char_length(btrim(coalesce(initial_message, ''))) NOT BETWEEN 20 AND 4000 THEN
    RAISE EXCEPTION 'invalid_support_message';
  END IF;
  IF char_length(btrim(coalesce(target_idempotency_key, ''))) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;
  IF (
    SELECT count(*)
    FROM public.support_tickets AS recent
    WHERE recent.requester_id = actor_profile_id
      AND recent.created_at >= now() - interval '1 hour'
  ) >= 5 THEN
    RAISE EXCEPTION 'support_rate_limited';
  END IF;

  IF nullif(btrim(coalesce(target_appointment_id, '')), '') IS NOT NULL THEN
    SELECT
      appointment.establishment_id,
      organization_link.organization_id,
      establishment.name,
      establishment.address
    INTO
      selected_establishment_id,
      selected_organization_id,
      selected_location_label,
      selected_location_address
    FROM public.appointments AS appointment
    JOIN public.establishments AS establishment
      ON establishment.id = appointment.establishment_id
    LEFT JOIN LATERAL (
      SELECT link.organization_id
      FROM public.organization_establishments AS link
      WHERE link.establishment_id = appointment.establishment_id
        AND link.status = 'active'
      ORDER BY link.created_at DESC
      LIMIT 1
    ) AS organization_link ON true
    WHERE appointment.id = target_appointment_id
      AND appointment.client_id = actor_profile_id
      AND appointment.deleted_at IS NULL;

    IF selected_establishment_id IS NULL THEN
      RAISE EXCEPTION 'invalid_support_appointment';
    END IF;
    selected_location_source := 'appointment';
  END IF;

  selected_priority := CASE target_impact
    WHEN 'critical' THEN 'critical'
    WHEN 'high' THEN 'high'
    WHEN 'low' THEN 'low'
    ELSE 'normal'
  END;

  SELECT
    rule.target_team_id,
    rule.rule_version,
    rule.default_escalation_level
  INTO
    selected_team_id,
    selected_rule_version,
    selected_escalation
  FROM public.support_routing_rules AS rule
  JOIN public.support_teams AS team
    ON team.id = rule.target_team_id
    AND team.active
  WHERE rule.active
    AND (rule.product IS NULL OR rule.product = 'client')
    AND (rule.requester_role IS NULL OR rule.requester_role = 'client')
    AND (rule.category IS NULL OR rule.category = target_category)
    AND (
      rule.organization_id IS NULL
      OR rule.organization_id = selected_organization_id
    )
    AND (
      rule.establishment_id IS NULL
      OR rule.establishment_id = selected_establishment_id
    )
    AND rule.region IS NULL
    AND rule.state IS NULL
    AND rule.city IS NULL
  ORDER BY rule.priority_order, rule.id
  LIMIT 1;

  IF selected_team_id IS NULL THEN
    SELECT team.id, 1, 0
    INTO selected_team_id, selected_rule_version, selected_escalation
    FROM public.support_teams AS team
    WHERE team.active
      AND team.is_default
    LIMIT 1;
  END IF;
  IF selected_team_id IS NULL THEN
    RAISE EXCEPTION 'support_routing_unavailable';
  END IF;

  INSERT INTO public.support_tickets (
    requester_id,
    requester_role,
    product,
    category,
    subject,
    impact,
    priority,
    status,
    escalation_level,
    team_id,
    establishment_id,
    organization_id,
    appointment_id,
    location_source,
    location_label,
    location_address,
    routing_version,
    create_idempotency_key,
    sync_status,
    first_response_due_at
  )
  VALUES (
    actor_profile_id,
    'client',
    'client',
    target_category,
    btrim(target_subject),
    target_impact,
    selected_priority,
    'queued',
    selected_escalation,
    selected_team_id,
    selected_establishment_id,
    selected_organization_id,
    nullif(btrim(coalesce(target_appointment_id, '')), ''),
    selected_location_source,
    selected_location_label,
    selected_location_address,
    selected_rule_version,
    btrim(target_idempotency_key),
    'pending',
    public.support_first_response_due_at(now(), selected_priority)
  )
  RETURNING * INTO created_ticket;

  INSERT INTO public.support_messages (
    ticket_id,
    author_kind,
    author_profile_id,
    author_display_name,
    body,
    idempotency_key,
    sync_status
  )
  VALUES (
    created_ticket.id,
    'requester',
    actor_profile_id,
    'Usuário CutSync',
    btrim(initial_message),
    'initial:' || btrim(target_idempotency_key),
    'pending'
  )
  RETURNING * INTO created_message;

  UPDATE public.support_tickets
  SET last_message_at = created_message.created_at
  WHERE id = created_ticket.id;

  INSERT INTO public.support_sync_operations (
    ticket_id,
    message_id,
    operation_type,
    idempotency_key,
    payload
  )
  VALUES (
    created_ticket.id,
    created_message.id,
    'create_ticket',
    'create:' || actor_profile_id || ':' || btrim(target_idempotency_key),
    jsonb_build_object(
      'initial_message', btrim(initial_message),
      'ticket_id', created_ticket.id,
      'message_id', created_message.id
    )
  )
  RETURNING * INTO created_operation;

  INSERT INTO public.support_ticket_events (
    ticket_id,
    event_type,
    to_value,
    actor_profile_id,
    actor_display_name
  )
  VALUES
    (
      created_ticket.id,
      'ticket_created',
      'queued',
      actor_profile_id,
      'Usuário CutSync'
    ),
    (
      created_ticket.id,
      'ticket_routed',
      selected_team_id::text,
      NULL,
      'Sistema CutSync'
    );

  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(created_ticket.id),
    'operation', jsonb_build_object(
      'id', created_operation.id,
      'operation_type', created_operation.operation_type,
      'status', created_operation.status
    ),
    'idempotent', false
  );
EXCEPTION WHEN unique_violation THEN
  SELECT ticket.id
  INTO existing_ticket_id
  FROM public.support_tickets AS ticket
  WHERE ticket.requester_id = actor_profile_id
    AND ticket.create_idempotency_key = target_idempotency_key;
  IF existing_ticket_id IS NULL THEN
    RAISE;
  END IF;
  SELECT *
  INTO created_operation
  FROM public.support_sync_operations AS operation
  WHERE operation.ticket_id = existing_ticket_id
    AND operation.operation_type = 'create_ticket'
  ORDER BY operation.created_at
  LIMIT 1;
  RETURN jsonb_build_object(
    'ticket', public.support_ticket_payload(existing_ticket_id),
    'operation', jsonb_build_object(
      'id', created_operation.id,
      'operation_type', created_operation.operation_type,
      'status', created_operation.status
    ),
    'idempotent', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_support_push_deliveries(
  target_limit integer DEFAULT 100
)
RETURNS TABLE (
  delivery_id uuid,
  expo_push_token text,
  notification_title text,
  notification_body text,
  notification_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.support_push_deliveries AS delivery
  SET status = 'skipped',
      last_error_code = 'push_disabled',
      locked_at = NULL
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
          AND 'push' = ANY(
            coalesce(profile.notification_channels, ARRAY[]::text[])
          )
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT queued.id
    FROM public.support_push_deliveries AS queued
    WHERE (
        queued.status = 'pending'
        OR (
          queued.status = 'processing'
          AND queued.locked_at < now() - interval '5 minutes'
        )
      )
      AND queued.available_at <= now()
      AND queued.attempts < 5
    ORDER BY queued.available_at, queued.created_at, queued.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(target_limit, 100), 1), 100)
  ),
  claimed AS (
    UPDATE public.support_push_deliveries AS queued
    SET status = 'processing',
        attempts = queued.attempts + 1,
        locked_at = now(),
        last_error_code = NULL
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
  ORDER BY claimed.created_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_support_push_delivery(
  target_delivery_id uuid,
  target_success boolean,
  target_ticket_id text DEFAULT NULL,
  target_error_code text DEFAULT NULL,
  target_retryable boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_device_id uuid;
  normalized_error_code text;
BEGIN
  normalized_error_code := nullif(
    left(
      regexp_replace(
        coalesce(btrim(target_error_code), ''),
        '[^A-Za-z0-9_:-]+',
        '_',
        'g'
      ),
      120
    ),
    ''
  );

  UPDATE public.support_push_deliveries AS delivery
  SET status = CASE
        WHEN target_success THEN 'ticketed'
        WHEN target_retryable AND delivery.attempts < 5 THEN 'pending'
        ELSE 'failed'
      END,
      expo_ticket_id = CASE
        WHEN target_success THEN nullif(btrim(target_ticket_id), '')
        ELSE NULL
      END,
      ticketed_at = CASE WHEN target_success THEN now() ELSE NULL END,
      available_at = CASE
        WHEN NOT target_success
          AND target_retryable
          AND delivery.attempts < 5
        THEN now() + make_interval(
          mins => (2 ^ LEAST(delivery.attempts, 5))::integer
        )
        ELSE delivery.available_at
      END,
      locked_at = NULL,
      last_error_code = CASE
        WHEN target_success THEN NULL
        ELSE normalized_error_code
      END
  WHERE delivery.id = target_delivery_id
    AND delivery.status = 'processing'
  RETURNING delivery.push_device_id INTO target_device_id;

  IF target_device_id IS NULL THEN
    RETURN false;
  END IF;

  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices
    SET enabled = false,
        updated_at = now()
    WHERE id = target_device_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_support_push_receipts(
  target_limit integer DEFAULT 100
)
RETURNS TABLE (
  delivery_id uuid,
  expo_ticket_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.support_push_deliveries
  SET status = 'failed',
      last_error_code = 'receipt_expired'
  WHERE status = 'ticketed'
    AND ticketed_at < now() - interval '24 hours';

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.support_push_deliveries AS delivery
    WHERE delivery.status = 'ticketed'
      AND delivery.ticketed_at <= now() - interval '15 minutes'
      AND (
        delivery.receipt_checked_at IS NULL
        OR delivery.receipt_checked_at <= now() - interval '15 minutes'
      )
    ORDER BY delivery.ticketed_at, delivery.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(target_limit, 100), 1), 100)
  ),
  claimed AS (
    UPDATE public.support_push_deliveries AS delivery
    SET receipt_checked_at = now()
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.expo_ticket_id
  )
  SELECT claimed.id, claimed.expo_ticket_id
  FROM claimed
  WHERE claimed.expo_ticket_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_support_push_receipt(
  target_delivery_id uuid,
  target_success boolean,
  target_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_device_id uuid;
  normalized_error_code text;
BEGIN
  normalized_error_code := nullif(
    left(
      regexp_replace(
        coalesce(btrim(target_error_code), ''),
        '[^A-Za-z0-9_:-]+',
        '_',
        'g'
      ),
      120
    ),
    ''
  );

  UPDATE public.support_push_deliveries AS delivery
  SET status = CASE WHEN target_success THEN 'sent' ELSE 'failed' END,
      sent_at = CASE WHEN target_success THEN now() ELSE NULL END,
      last_error_code = CASE
        WHEN target_success THEN NULL
        ELSE normalized_error_code
      END
  WHERE delivery.id = target_delivery_id
    AND delivery.status = 'ticketed'
  RETURNING delivery.push_device_id INTO target_device_id;

  IF target_device_id IS NULL THEN
    RETURN false;
  END IF;

  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices
    SET enabled = false,
        updated_at = now()
    WHERE id = target_device_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_support_content(
  target_now timestamptz DEFAULT now(),
  target_limit integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expired_ticket_ids uuid[];
  purged_count integer;
BEGIN
  SELECT coalesce(array_agg(expired.id), ARRAY[]::uuid[])
  INTO expired_ticket_ids
  FROM (
    SELECT ticket.id
    FROM public.support_tickets AS ticket
    WHERE ticket.content_purged_at IS NULL
      AND ticket.status IN ('resolved', 'closed')
      AND coalesce(
        ticket.closed_at,
        ticket.resolved_at,
        ticket.updated_at
      ) < target_now - interval '12 months'
    ORDER BY coalesce(
      ticket.closed_at,
      ticket.resolved_at,
      ticket.updated_at
    ), ticket.id
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(coalesce(target_limit, 500), 1), 1000)
  ) AS expired;

  purged_count := cardinality(expired_ticket_ids);
  IF purged_count = 0 THEN
    RETURN 0;
  END IF;

  DELETE FROM public.support_push_deliveries
  WHERE ticket_id = ANY(expired_ticket_ids);

  UPDATE public.support_sync_operations
  SET payload = '{}'::jsonb,
      status = CASE
        WHEN status IN ('pending', 'processing', 'retry') THEN 'dead_letter'
        ELSE status
      END,
      locked_at = NULL,
      locked_by = NULL,
      last_error_code = CASE
        WHEN status IN ('pending', 'processing', 'retry') THEN 'content_purged'
        ELSE last_error_code
      END
  WHERE ticket_id = ANY(expired_ticket_ids);

  UPDATE public.support_messages
  SET author_profile_id = NULL,
      author_display_name = CASE
        WHEN author_kind = 'support' THEN 'Equipe CutSync'
        WHEN author_kind = 'system' THEN 'Sistema CutSync'
        ELSE 'Usuário removido'
      END,
      body = 'Conteúdo removido pela política de retenção.',
      idempotency_key = NULL,
      jsm_comment_id = NULL,
      sync_status = 'failed',
      last_sync_error_code = 'content_purged',
      content_purged_at = target_now
  WHERE ticket_id = ANY(expired_ticket_ids);

  UPDATE public.support_ticket_events
  SET reason = NULL,
      actor_profile_id = NULL,
      actor_display_name = NULL
  WHERE ticket_id = ANY(expired_ticket_ids);

  UPDATE public.support_tickets
  SET requester_id = NULL,
      subject = 'Conteúdo removido pela política de retenção',
      assignee_profile_id = NULL,
      assignee_display_name = NULL,
      establishment_id = NULL,
      organization_id = NULL,
      appointment_id = NULL,
      location_source = 'none',
      location_label = NULL,
      location_address = NULL,
      location_region = NULL,
      location_state = NULL,
      location_city = NULL,
      create_idempotency_key = NULL,
      jsm_issue_id = NULL,
      jsm_issue_key = NULL,
      jsm_issue_url = NULL,
      sync_status = 'failed',
      last_sync_error_code = 'content_purged',
      status = 'closed',
      closed_at = coalesce(closed_at, resolved_at, target_now),
      content_purged_at = target_now
  WHERE id = ANY(expired_ticket_ids);

  RETURN purged_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_support_profile_content(
  target_profile_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requester_ticket_ids uuid[];
  purged_count integer;
BEGIN
  IF target_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT coalesce(array_agg(locked_ticket.id), ARRAY[]::uuid[])
  INTO requester_ticket_ids
  FROM (
    SELECT ticket.id
    FROM public.support_tickets AS ticket
    WHERE ticket.requester_id = target_profile_id
    FOR UPDATE
  ) AS locked_ticket;

  purged_count := cardinality(requester_ticket_ids);

  IF purged_count > 0 THEN
    DELETE FROM public.support_push_deliveries
    WHERE ticket_id = ANY(requester_ticket_ids);

    UPDATE public.support_sync_operations
    SET payload = '{}'::jsonb,
        status = CASE
          WHEN status IN ('pending', 'processing', 'retry') THEN 'dead_letter'
          ELSE status
        END,
        locked_at = NULL,
        locked_by = NULL,
        last_error_code = CASE
          WHEN status IN ('pending', 'processing', 'retry') THEN 'profile_purged'
          ELSE last_error_code
        END
    WHERE ticket_id = ANY(requester_ticket_ids);

    UPDATE public.support_messages
    SET author_profile_id = NULL,
        author_display_name = CASE
          WHEN author_kind = 'support' THEN 'Equipe CutSync'
          WHEN author_kind = 'system' THEN 'Sistema CutSync'
          ELSE 'Usuário removido'
        END,
        body = 'Conteúdo removido por solicitação de privacidade.',
        idempotency_key = NULL,
        jsm_comment_id = NULL,
        sync_status = 'failed',
        last_sync_error_code = 'profile_purged',
        content_purged_at = now()
    WHERE ticket_id = ANY(requester_ticket_ids);

    UPDATE public.support_ticket_events
    SET reason = NULL,
        actor_profile_id = NULL,
        actor_display_name = NULL
    WHERE ticket_id = ANY(requester_ticket_ids);

    UPDATE public.support_tickets
    SET requester_id = NULL,
        subject = 'Conteúdo removido por solicitação de privacidade',
        assignee_profile_id = NULL,
        assignee_display_name = NULL,
        establishment_id = NULL,
        organization_id = NULL,
        appointment_id = NULL,
        location_source = 'none',
        location_label = NULL,
        location_address = NULL,
        location_region = NULL,
        location_state = NULL,
        location_city = NULL,
        create_idempotency_key = NULL,
        jsm_issue_id = NULL,
        jsm_issue_key = NULL,
        jsm_issue_url = NULL,
        sync_status = 'failed',
        last_sync_error_code = 'profile_purged',
        status = 'closed',
        closed_at = coalesce(closed_at, resolved_at, now()),
        content_purged_at = now()
    WHERE id = ANY(requester_ticket_ids);
  END IF;

  UPDATE public.support_tickets
  SET assignee_profile_id = NULL,
      assignee_display_name = NULL
  WHERE assignee_profile_id = target_profile_id;

  UPDATE public.support_messages
  SET author_profile_id = NULL,
      author_display_name = CASE
        WHEN author_kind = 'support' THEN 'Equipe CutSync'
        WHEN author_kind = 'system' THEN 'Sistema CutSync'
        ELSE 'Usuário removido'
      END
  WHERE author_profile_id = target_profile_id;

  UPDATE public.support_ticket_events
  SET actor_profile_id = NULL,
      actor_display_name = NULL
  WHERE actor_profile_id = target_profile_id;

  UPDATE public.support_team_members
  SET jira_account_id = NULL,
      is_active = false
  WHERE profile_id = target_profile_id;

  RETURN purged_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.support_profile_purge_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM public.purge_support_profile_content(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER purge_support_when_profile_is_deleted
  AFTER UPDATE OF deleted_at ON public.profiles
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.support_profile_purge_trigger();

ALTER TABLE public.support_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_business_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_sync_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_push_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_requesters_read_own_tickets
  ON public.support_tickets
  FOR SELECT
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    AND content_purged_at IS NULL
  );

CREATE POLICY support_requesters_read_own_public_messages
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    is_public
    AND content_purged_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.support_tickets AS ticket
      WHERE ticket.id = support_messages.ticket_id
        AND ticket.requester_id = (SELECT auth.uid())
        AND ticket.content_purged_at IS NULL
    )
  );

REVOKE ALL ON TABLE
  public.support_runtime_settings,
  public.support_teams,
  public.support_team_members,
  public.support_routing_rules,
  public.support_business_holidays,
  public.support_tickets,
  public.support_messages,
  public.support_ticket_events,
  public.support_sync_operations,
  public.support_push_deliveries
FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  protocol,
  subject,
  category,
  impact,
  priority,
  status,
  sync_status,
  appointment_id,
  created_at,
  updated_at,
  last_message_at,
  resolved_at
) ON public.support_tickets TO authenticated;

GRANT SELECT (
  id,
  ticket_id,
  author_kind,
  author_display_name,
  body,
  created_at
) ON public.support_messages TO authenticated;

GRANT ALL ON TABLE
  public.support_runtime_settings,
  public.support_teams,
  public.support_team_members,
  public.support_routing_rules,
  public.support_business_holidays,
  public.support_tickets,
  public.support_messages,
  public.support_ticket_events,
  public.support_sync_operations,
  public.support_push_deliveries
TO service_role;

ALTER TABLE public.support_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;

DO $$
DECLARE
  support_realtime_table text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    FOREACH support_realtime_table IN ARRAY ARRAY[
      'support_tickets',
      'support_messages'
    ]
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = support_realtime_table
      ) THEN
        EXECUTE format(
          'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
          support_realtime_table
        );
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.support_touch_updated_at()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_is_business_day(date)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_add_business_minutes(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_first_response_due_at(timestamptz, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_payload(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_message_payload(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_public_ticket_payload(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_public_message_payload(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_support_push(uuid, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_control_operator_context(boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_profile_purge_trigger()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_support_capabilities()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_my_support_tickets()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_support_ticket(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_control_support_overview(
  text,
  text,
  text,
  integer,
  timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_control_support_ticket(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reprocess_support_sync(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_support_ticket(uuid, integer, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.configure_support_team_member(
  uuid,
  text,
  text,
  boolean,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_control_support_runtime(
  boolean,
  boolean,
  boolean,
  text,
  text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_support_ticket_internal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_support_message_internal(
  uuid,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_support_ticket_sync_internal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_support_sync_operation(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_support_sync_operations(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_support_ticket_creation(
  uuid,
  uuid,
  text,
  text,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_support_message_sync(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_support_sync_operation(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_support_tickets_for_reconciliation(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_support_reconciliation(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_support_public_message(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_support_push_deliveries(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_support_push_delivery(
  uuid,
  boolean,
  text,
  text,
  boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_support_push_receipts(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_support_push_receipt(
  uuid,
  boolean,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_support_content(
  timestamptz,
  integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_support_profile_content(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_support_capabilities()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_my_support_tickets()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_support_ticket(uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_control_support_overview(
  text,
  text,
  text,
  integer,
  timestamptz
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_control_support_ticket(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reprocess_support_sync(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.escalate_support_ticket(uuid, integer, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_support_team_member(
  uuid,
  text,
  text,
  boolean,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_control_support_runtime(
  boolean,
  boolean,
  boolean,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_support_ticket_internal(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_support_message_internal(
  uuid,
  uuid,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_support_ticket_sync_internal(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_support_sync_operation(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_support_sync_operations(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_support_ticket_creation(
  uuid,
  uuid,
  text,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_support_message_sync(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_support_sync_operation(uuid, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.list_support_tickets_for_reconciliation(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_support_reconciliation(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_support_public_message(
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_support_push_deliveries(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_support_push_delivery(
  uuid,
  boolean,
  text,
  text,
  boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_support_push_receipts(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_support_push_receipt(
  uuid,
  boolean,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_support_content(
  timestamptz,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_support_profile_content(uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
