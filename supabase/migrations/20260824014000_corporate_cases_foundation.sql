-- Corporate cases foundation: events, participants, routing, SLA and notifications.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

ALTER TABLE public.control_permission_catalog
  DROP CONSTRAINT control_permission_catalog_area_check;

ALTER TABLE public.control_permission_catalog
  ADD CONSTRAINT control_permission_catalog_area_check CHECK (area IN (
    'central', 'operation', 'support', 'governance', 'knowledge',
    'finance', 'commercial', 'access', 'audit', 'auth_recovery', 'cases'
  ));

INSERT INTO public.control_permission_catalog(permission, label, area, risk_level)
VALUES
  ('control.cases.request', 'Solicitar chamado corporativo', 'cases', 'low'),
  ('control.cases.read', 'Consultar chamados corporativos autorizados', 'cases', 'moderate'),
  ('control.cases.triage', 'Realizar triagem de chamados corporativos', 'cases', 'high'),
  ('control.cases.route', 'Encaminhar chamados corporativos', 'cases', 'high'),
  ('control.cases.manage', 'Administrar chamados corporativos', 'cases', 'critical'),
  ('control.cases.audit', 'Auditar chamados corporativos', 'cases', 'high')
ON CONFLICT (permission) DO UPDATE
SET label = EXCLUDED.label,
    area = EXCLUDED.area,
    risk_level = EXCLUDED.risk_level,
    active = true,
    updated_at = now();

INSERT INTO public.control_access_profile_permissions(access_profile_id, permission)
SELECT access_profile.id, seed.permission
FROM (VALUES
  ('saas_viewer', 'control.cases.request'),
  ('saas_viewer', 'control.cases.read'),
  ('saas_editor', 'control.cases.request'),
  ('saas_editor', 'control.cases.read'),
  ('saas_editor', 'control.cases.triage'),
  ('saas_editor', 'control.cases.route'),
  ('saas_owner', 'control.cases.request'),
  ('saas_owner', 'control.cases.read'),
  ('saas_owner', 'control.cases.triage'),
  ('saas_owner', 'control.cases.route'),
  ('saas_owner', 'control.cases.manage'),
  ('saas_owner', 'control.cases.audit'),
  ('support_assistant', 'control.cases.request'),
  ('support_assistant', 'control.cases.read'),
  ('support_analyst', 'control.cases.request'),
  ('support_analyst', 'control.cases.read'),
  ('support_analyst', 'control.cases.triage'),
  ('support_supervisor', 'control.cases.request'),
  ('support_supervisor', 'control.cases.read'),
  ('support_supervisor', 'control.cases.triage'),
  ('support_supervisor', 'control.cases.route'),
  ('finance_analyst', 'control.cases.request'),
  ('finance_analyst', 'control.cases.read'),
  ('finance_manager', 'control.cases.request'),
  ('finance_manager', 'control.cases.read'),
  ('commercial_analyst', 'control.cases.request'),
  ('commercial_analyst', 'control.cases.read'),
  ('commercial_manager', 'control.cases.request'),
  ('commercial_manager', 'control.cases.read'),
  ('governance_analyst', 'control.cases.request'),
  ('governance_analyst', 'control.cases.read'),
  ('governance_analyst', 'control.cases.triage'),
  ('governance_analyst', 'control.cases.audit'),
  ('governance_manager', 'control.cases.request'),
  ('governance_manager', 'control.cases.read'),
  ('governance_manager', 'control.cases.triage'),
  ('governance_manager', 'control.cases.route'),
  ('governance_manager', 'control.cases.manage'),
  ('governance_manager', 'control.cases.audit'),
  ('knowledge_editor', 'control.cases.request'),
  ('knowledge_editor', 'control.cases.read'),
  ('security_reviewer', 'control.cases.request'),
  ('security_reviewer', 'control.cases.read'),
  ('security_reviewer', 'control.cases.triage'),
  ('security_reviewer', 'control.cases.route'),
  ('security_reviewer', 'control.cases.audit'),
  ('access_administrator', 'control.cases.request'),
  ('access_administrator', 'control.cases.read'),
  ('access_administrator', 'control.cases.triage'),
  ('access_administrator', 'control.cases.route'),
  ('access_administrator', 'control.cases.manage'),
  ('access_administrator', 'control.cases.audit')
) AS seed(profile_key, permission)
JOIN public.control_access_profiles AS access_profile
  ON access_profile.profile_key = seed.profile_key
ON CONFLICT (access_profile_id, permission) DO NOTHING;

CREATE TABLE public.corporate_case_runtime_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  creation_enabled boolean NOT NULL DEFAULT false,
  automation_enabled boolean NOT NULL DEFAULT false,
  email_enabled boolean NOT NULL DEFAULT false,
  legacy_redirects_enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corporate_case_runtime_settings_dependency CHECK (
    (NOT creation_enabled OR enabled)
    AND (NOT automation_enabled OR enabled)
    AND (NOT email_enabled OR automation_enabled)
    AND (NOT legacy_redirects_enabled OR enabled)
  )
);

CREATE TABLE public.corporate_business_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_key text NOT NULL UNIQUE CHECK (calendar_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo'
    CHECK (char_length(btrim(timezone)) BETWEEN 3 AND 80),
  business_weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  business_day_starts_at time NOT NULL DEFAULT '09:00',
  business_day_ends_at time NOT NULL DEFAULT '18:00',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corporate_business_calendars_weekdays CHECK (
    cardinality(business_weekdays) BETWEEN 1 AND 7
    AND business_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  ),
  CONSTRAINT corporate_business_calendars_hours CHECK (
    business_day_starts_at < business_day_ends_at
  )
);

CREATE TABLE public.corporate_business_calendar_holidays (
  calendar_id uuid NOT NULL
    REFERENCES public.corporate_business_calendars(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_id, holiday_date)
);

CREATE TABLE public.corporate_work_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key text NOT NULL UNIQUE CHECK (group_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text NOT NULL UNIQUE CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  area text NOT NULL CHECK (area IN (
    'central', 'operation', 'support', 'governance', 'knowledge',
    'finance', 'commercial', 'access', 'security', 'technology'
  )),
  default_calendar_id uuid NOT NULL
    REFERENCES public.corporate_business_calendars(id) ON DELETE RESTRICT,
  manager_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.corporate_work_group_members (
  group_id uuid NOT NULL REFERENCES public.corporate_work_groups(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  member_role text NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('member', 'manager', 'substitute')),
  can_receive boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, profile_id),
  CONSTRAINT corporate_work_group_members_validity CHECK (
    valid_until IS NULL OR valid_until > valid_from
  )
);

CREATE TABLE public.corporate_case_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_key text NOT NULL UNIQUE CHECK (type_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  area text NOT NULL CHECK (area IN (
    'access', 'commercial', 'support', 'finance', 'governance',
    'knowledge', 'gsp', 'security', 'technology', 'operations'
  )),
  category text NOT NULL CHECK (category ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text NOT NULL UNIQUE CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 500),
  form_key text NOT NULL CHECK (form_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  form_version integer NOT NULL DEFAULT 1 CHECK (form_version > 0),
  default_risk text NOT NULL DEFAULT 'moderate'
    CHECK (default_risk IN ('low', 'moderate', 'high', 'critical')),
  sensitivity text NOT NULL DEFAULT 'internal'
    CHECK (sensitivity IN ('internal', 'restricted', 'confidential')),
  opening_permission text NOT NULL
    REFERENCES public.control_permission_catalog(permission) ON DELETE RESTRICT,
  requires_beneficiary boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.corporate_case_routing_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type_id uuid NOT NULL REFERENCES public.corporate_case_types(id) ON DELETE RESTRICT,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  calendar_id uuid NOT NULL
    REFERENCES public.corporate_business_calendars(id) ON DELETE RESTRICT,
  maximum_lifetime_minutes integer NOT NULL CHECK (maximum_lifetime_minutes BETWEEN 15 AND 525600),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX corporate_case_routing_policies_active_unique
  ON public.corporate_case_routing_policies(case_type_id, risk_level)
  WHERE active;

CREATE TABLE public.corporate_case_routing_stages (
  routing_policy_id uuid NOT NULL
    REFERENCES public.corporate_case_routing_policies(id) ON DELETE CASCADE,
  stage_order smallint NOT NULL CHECK (stage_order BETWEEN 1 AND 100),
  stage_key text NOT NULL CHECK (stage_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  task_type text NOT NULL
    CHECK (task_type IN ('triage', 'review', 'approval', 'fulfillment')),
  target_group_id uuid NOT NULL REFERENCES public.corporate_work_groups(id) ON DELETE RESTRICT,
  sla_minutes integer NOT NULL CHECK (sla_minutes BETWEEN 5 AND 525600),
  required_approvals smallint NOT NULL DEFAULT 0 CHECK (required_approvals BETWEEN 0 AND 10),
  requires_distinct_actor boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (routing_policy_id, stage_order),
  UNIQUE (routing_policy_id, stage_key),
  CONSTRAINT corporate_case_routing_stages_approval_count CHECK (
    task_type = 'approval' OR required_approvals = 0
  )
);

CREATE TABLE public.corporate_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  protocol text NOT NULL UNIQUE DEFAULT (
    'CI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  ) CHECK (protocol ~ '^CI-[A-F0-9]{12}$'),
  client_request_id uuid NOT NULL UNIQUE,
  case_type_id uuid NOT NULL REFERENCES public.corporate_case_types(id) ON DELETE RESTRICT,
  requester_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  beneficiary_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  routing_policy_id uuid NOT NULL
    REFERENCES public.corporate_case_routing_policies(id) ON DELETE RESTRICT,
  routing_policy_version integer NOT NULL CHECK (routing_policy_version > 0),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  sensitivity text NOT NULL
    CHECK (sensitivity IN ('internal', 'restricted', 'confidential')),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted', 'triage', 'review', 'awaiting_approval', 'approved',
    'fulfillment', 'waiting_requester', 'resolved', 'closed', 'rejected',
    'cancelled', 'expired', 'archived'
  )),
  current_stage_order smallint CHECK (current_stage_order BETWEEN 1 AND 100),
  current_group_id uuid REFERENCES public.corporate_work_groups(id) ON DELETE RESTRICT,
  current_assignee_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 5 AND 160),
  summary text NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 10 AND 4000),
  form_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(form_payload) = 'object'),
  external_reference text CHECK (
    external_reference IS NULL OR char_length(btrim(external_reference)) BETWEEN 3 AND 160
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corporate_cases_resolution_order CHECK (
    closed_at IS NULL OR (resolved_at IS NOT NULL AND closed_at >= resolved_at)
  ),
  CONSTRAINT corporate_cases_archive_order CHECK (
    archived_at IS NULL OR archived_at >= created_at
  )
);

CREATE TABLE public.corporate_case_participants (
  case_id uuid NOT NULL REFERENCES public.corporate_cases(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  participant_role text NOT NULL CHECK (participant_role IN (
    'requester', 'beneficiary', 'observer', 'triager', 'assignee', 'approver', 'auditor'
  )),
  notification_level text NOT NULL DEFAULT 'all'
    CHECK (notification_level IN ('all', 'important', 'none')),
  active boolean NOT NULL DEFAULT true,
  added_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  removed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (case_id, profile_id, participant_role),
  CONSTRAINT corporate_case_participants_removal CHECK (
    (active AND removed_at IS NULL AND removed_by IS NULL)
    OR (NOT active AND removed_at IS NOT NULL)
  )
);

CREATE TABLE public.corporate_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.corporate_cases(id) ON DELETE RESTRICT,
  author_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  client_message_id uuid NOT NULL,
  visibility text NOT NULL DEFAULT 'participants'
    CHECK (visibility IN ('participants', 'internal', 'restricted')),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  UNIQUE (case_id, client_message_id)
);

CREATE TABLE public.corporate_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key uuid NOT NULL UNIQUE,
  case_id uuid NOT NULL REFERENCES public.corporate_cases(id) ON DELETE RESTRICT,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{2,119}$'),
  audience text NOT NULL DEFAULT 'participants'
    CHECK (audience IN ('participants', 'internal', 'restricted', 'system')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.corporate_case_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.corporate_cases(id) ON DELETE RESTRICT,
  stage_order smallint NOT NULL CHECK (stage_order BETWEEN 1 AND 100),
  task_type text NOT NULL
    CHECK (task_type IN ('triage', 'review', 'approval', 'fulfillment')),
  assigned_group_id uuid NOT NULL REFERENCES public.corporate_work_groups(id) ON DELETE RESTRICT,
  assigned_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'waiting', 'completed', 'cancelled', 'expired')),
  due_at timestamptz NOT NULL,
  completed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  completed_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corporate_case_tasks_completion CHECK (
    (status = 'completed' AND completed_by IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  )
);

CREATE TABLE public.corporate_case_approval_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.corporate_case_tasks(id) ON DELETE RESTRICT,
  slot_order smallint NOT NULL CHECK (slot_order BETWEEN 1 AND 10),
  requested_approver_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_approver_group_id uuid REFERENCES public.corporate_work_groups(id) ON DELETE RESTRICT,
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision_reason text CHECK (
    decision_reason IS NULL OR char_length(btrim(decision_reason)) BETWEEN 3 AND 1000
  ),
  decided_at timestamptz,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, slot_order),
  CONSTRAINT corporate_case_approval_slots_target CHECK (
    num_nonnulls(requested_approver_profile_id, requested_approver_group_id) = 1
  ),
  CONSTRAINT corporate_case_approval_slots_decision CHECK (
    (decision IN ('approved', 'rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    OR (decision NOT IN ('approved', 'rejected') AND decided_at IS NULL)
  )
);

CREATE TABLE public.corporate_case_sla_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.corporate_cases(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES public.corporate_case_tasks(id) ON DELETE RESTRICT,
  metric_key text NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('pending', 'running', 'paused', 'met', 'breached', 'stopped')),
  target_at timestamptz NOT NULL,
  paused_at timestamptz,
  accumulated_pause_seconds integer NOT NULL DEFAULT 0 CHECK (accumulated_pause_seconds >= 0),
  met_at timestamptz,
  breached_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.corporate_notification_preferences (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_category text NOT NULL CHECK (event_category ~ '^[a-z][a-z0-9_]{2,79}$'),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  enabled boolean NOT NULL DEFAULT true,
  important_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, event_category, channel)
);

CREATE TABLE public.corporate_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9_.]{2,119}$'),
  channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'push')),
  version integer NOT NULL CHECK (version > 0),
  subject_template text CHECK (
    subject_template IS NULL OR char_length(subject_template) BETWEEN 1 AND 200
  ),
  body_template text NOT NULL CHECK (char_length(body_template) BETWEEN 1 AND 10000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_key, channel, version)
);

CREATE TABLE public.corporate_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.corporate_case_events(id) ON DELETE RESTRICT,
  recipient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_category text NOT NULL CHECK (event_category ~ '^[a-z][a-z0-9_]{2,79}$'),
  importance text NOT NULL DEFAULT 'normal'
    CHECK (importance IN ('low', 'normal', 'high', 'critical')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 3 AND 2000),
  route_payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(route_payload) = 'object'),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, recipient_profile_id)
);

CREATE TABLE public.corporate_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.corporate_notifications(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('email', 'push')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text CHECK (locked_by IS NULL OR char_length(locked_by) BETWEEN 3 AND 160),
  last_error_code text CHECK (
    last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 120
  ),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);

CREATE TABLE public.corporate_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id uuid NOT NULL REFERENCES public.corporate_notification_outbox(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 100),
  status text NOT NULL CHECK (status IN ('accepted', 'delivered', 'deferred', 'bounced', 'failed')),
  provider_message_id text CHECK (
    provider_message_id IS NULL OR char_length(provider_message_id) BETWEEN 1 AND 255
  ),
  provider_status_code text CHECK (
    provider_status_code IS NULL OR char_length(provider_status_code) BETWEEN 1 AND 80
  ),
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 120),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  UNIQUE (outbox_id, attempt_number)
);

CREATE INDEX corporate_work_groups_calendar_idx
  ON public.corporate_work_groups(default_calendar_id);
CREATE INDEX corporate_work_groups_manager_idx
  ON public.corporate_work_groups(manager_profile_id) WHERE manager_profile_id IS NOT NULL;
CREATE INDEX corporate_work_group_members_profile_idx
  ON public.corporate_work_group_members(profile_id, active);
CREATE INDEX corporate_case_types_permission_idx
  ON public.corporate_case_types(opening_permission);
CREATE INDEX corporate_case_routing_policies_calendar_idx
  ON public.corporate_case_routing_policies(calendar_id);
CREATE INDEX corporate_case_routing_stages_group_idx
  ON public.corporate_case_routing_stages(target_group_id);
CREATE INDEX corporate_cases_requester_idx
  ON public.corporate_cases(requester_profile_id, created_at DESC);
CREATE INDEX corporate_cases_beneficiary_idx
  ON public.corporate_cases(beneficiary_profile_id, created_at DESC)
  WHERE beneficiary_profile_id IS NOT NULL;
CREATE INDEX corporate_cases_queue_idx
  ON public.corporate_cases(current_group_id, priority DESC, created_at)
  WHERE status IN ('submitted', 'triage', 'review', 'awaiting_approval', 'approved', 'fulfillment');
CREATE INDEX corporate_cases_assignee_idx
  ON public.corporate_cases(current_assignee_profile_id, status, updated_at DESC)
  WHERE current_assignee_profile_id IS NOT NULL;
CREATE INDEX corporate_cases_type_idx ON public.corporate_cases(case_type_id);
CREATE INDEX corporate_cases_routing_policy_idx ON public.corporate_cases(routing_policy_id);
CREATE INDEX corporate_case_participants_profile_idx
  ON public.corporate_case_participants(profile_id, active, case_id);
CREATE INDEX corporate_case_participants_added_by_idx
  ON public.corporate_case_participants(added_by);
CREATE INDEX corporate_case_participants_removed_by_idx
  ON public.corporate_case_participants(removed_by) WHERE removed_by IS NOT NULL;
CREATE INDEX corporate_case_messages_case_idx
  ON public.corporate_case_messages(case_id, created_at);
CREATE INDEX corporate_case_messages_author_idx
  ON public.corporate_case_messages(author_profile_id) WHERE author_profile_id IS NOT NULL;
CREATE INDEX corporate_case_events_case_idx
  ON public.corporate_case_events(case_id, created_at);
CREATE INDEX corporate_case_events_actor_idx
  ON public.corporate_case_events(actor_profile_id) WHERE actor_profile_id IS NOT NULL;
CREATE INDEX corporate_case_tasks_queue_idx
  ON public.corporate_case_tasks(assigned_group_id, status, due_at)
  WHERE status IN ('pending', 'in_progress', 'waiting');
CREATE INDEX corporate_case_tasks_assignee_idx
  ON public.corporate_case_tasks(assigned_profile_id, status, due_at)
  WHERE assigned_profile_id IS NOT NULL;
CREATE INDEX corporate_case_tasks_case_idx ON public.corporate_case_tasks(case_id, stage_order);
CREATE INDEX corporate_case_tasks_completed_by_idx
  ON public.corporate_case_tasks(completed_by) WHERE completed_by IS NOT NULL;
CREATE INDEX corporate_case_approval_slots_profile_idx
  ON public.corporate_case_approval_slots(requested_approver_profile_id, decision, due_at)
  WHERE requested_approver_profile_id IS NOT NULL;
CREATE INDEX corporate_case_approval_slots_group_idx
  ON public.corporate_case_approval_slots(requested_approver_group_id, decision, due_at)
  WHERE requested_approver_group_id IS NOT NULL;
CREATE INDEX corporate_case_approval_slots_decided_by_idx
  ON public.corporate_case_approval_slots(decided_by) WHERE decided_by IS NOT NULL;
CREATE INDEX corporate_case_sla_case_idx
  ON public.corporate_case_sla_instances(case_id, status, target_at);
CREATE INDEX corporate_case_sla_task_idx
  ON public.corporate_case_sla_instances(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX corporate_notifications_recipient_idx
  ON public.corporate_notifications(recipient_profile_id, read_at, created_at DESC);
CREATE INDEX corporate_notification_outbox_pending_idx
  ON public.corporate_notification_outbox(available_at, created_at)
  WHERE status IN ('pending', 'failed');
CREATE INDEX corporate_notification_deliveries_outbox_idx
  ON public.corporate_notification_deliveries(outbox_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.corporate_cases_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.corporate_case_events_are_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'corporate_case_events_are_immutable';
END;
$$;

CREATE TRIGGER corporate_case_runtime_settings_touch_updated_at
BEFORE UPDATE ON public.corporate_case_runtime_settings
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_business_calendars_touch_updated_at
BEFORE UPDATE ON public.corporate_business_calendars
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_work_groups_touch_updated_at
BEFORE UPDATE ON public.corporate_work_groups
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_work_group_members_touch_updated_at
BEFORE UPDATE ON public.corporate_work_group_members
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_types_touch_updated_at
BEFORE UPDATE ON public.corporate_case_types
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_routing_policies_touch_updated_at
BEFORE UPDATE ON public.corporate_case_routing_policies
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_routing_stages_touch_updated_at
BEFORE UPDATE ON public.corporate_case_routing_stages
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_cases_touch_updated_at
BEFORE UPDATE ON public.corporate_cases
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_participants_touch_updated_at
BEFORE UPDATE ON public.corporate_case_participants
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_tasks_touch_updated_at
BEFORE UPDATE ON public.corporate_case_tasks
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_approval_slots_touch_updated_at
BEFORE UPDATE ON public.corporate_case_approval_slots
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_sla_instances_touch_updated_at
BEFORE UPDATE ON public.corporate_case_sla_instances
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_notification_preferences_touch_updated_at
BEFORE UPDATE ON public.corporate_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_notification_templates_touch_updated_at
BEFORE UPDATE ON public.corporate_notification_templates
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_notification_outbox_touch_updated_at
BEFORE UPDATE ON public.corporate_notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();
CREATE TRIGGER corporate_case_events_immutable
BEFORE UPDATE OR DELETE ON public.corporate_case_events
FOR EACH ROW EXECUTE FUNCTION public.corporate_case_events_are_immutable();

INSERT INTO public.corporate_case_runtime_settings(singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO public.corporate_business_calendars(
  calendar_key, label, timezone, business_weekdays,
  business_day_starts_at, business_day_ends_at
)
VALUES (
  'cutsync_br_business', 'Expediente corporativo CutSync', 'America/Sao_Paulo',
  ARRAY[1,2,3,4,5]::smallint[], '09:00', '18:00'
)
ON CONFLICT (calendar_key) DO NOTHING;

INSERT INTO public.corporate_work_groups(group_key, label, area, default_calendar_id)
SELECT seed.group_key, seed.label, seed.area, calendar.id
FROM (VALUES
  ('access_intake', 'Recebimento de acessos', 'access'),
  ('access_review', 'Validação de acessos', 'governance'),
  ('access_approvers', 'Aprovadores de acessos', 'governance'),
  ('access_fulfillment', 'Execução de acessos', 'access')
) AS seed(group_key, label, area)
CROSS JOIN public.corporate_business_calendars AS calendar
WHERE calendar.calendar_key = 'cutsync_br_business'
ON CONFLICT (group_key) DO NOTHING;

INSERT INTO public.corporate_case_types(
  type_key, area, category, label, description, form_key, form_version,
  default_risk, sensitivity, opening_permission, requires_beneficiary
)
VALUES (
  'access_release', 'access', 'access_management', 'Liberação de acesso',
  'Solicitação corporativa padronizada para concessão ou alteração de acesso.',
  'access_release', 1, 'moderate', 'restricted', 'control.cases.request', true
)
ON CONFLICT (type_key) DO NOTHING;

INSERT INTO public.corporate_case_routing_policies(
  case_type_id, risk_level, calendar_id, maximum_lifetime_minutes, version
)
SELECT case_type.id, seed.risk_level, calendar.id, seed.maximum_lifetime_minutes, 1
FROM (VALUES
  ('low', 10080),
  ('moderate', 7200),
  ('high', 2880),
  ('critical', 480)
) AS seed(risk_level, maximum_lifetime_minutes)
CROSS JOIN public.corporate_case_types AS case_type
CROSS JOIN public.corporate_business_calendars AS calendar
WHERE case_type.type_key = 'access_release'
  AND calendar.calendar_key = 'cutsync_br_business'
ON CONFLICT (case_type_id, risk_level) WHERE active DO NOTHING;

INSERT INTO public.corporate_case_routing_stages(
  routing_policy_id, stage_order, stage_key, label, task_type,
  target_group_id, sla_minutes, required_approvals, requires_distinct_actor
)
SELECT policy.id, seed.stage_order, seed.stage_key, seed.label, seed.task_type,
       work_group.id,
       CASE seed.stage_key
         WHEN 'triage' THEN CASE policy.risk_level WHEN 'critical' THEN 15 ELSE 240 END
         WHEN 'review' THEN CASE policy.risk_level WHEN 'critical' THEN 60 ELSE 480 END
         WHEN 'approval' THEN CASE policy.risk_level WHEN 'critical' THEN 120 ELSE 1440 END
         ELSE CASE policy.risk_level WHEN 'critical' THEN 240 ELSE 2880 END
       END,
       CASE
         WHEN seed.stage_key = 'approval' AND policy.risk_level IN ('high', 'critical') THEN 2
         WHEN seed.stage_key = 'approval' THEN 1
         ELSE 0
       END,
       seed.stage_key IN ('approval', 'fulfillment')
FROM public.corporate_case_routing_policies AS policy
JOIN public.corporate_case_types AS case_type
  ON case_type.id = policy.case_type_id AND case_type.type_key = 'access_release'
CROSS JOIN (VALUES
  (1::smallint, 'triage', 'Triagem', 'triage', 'access_intake'),
  (2::smallint, 'review', 'Validação da necessidade', 'review', 'access_review'),
  (3::smallint, 'approval', 'Aprovação', 'approval', 'access_approvers'),
  (4::smallint, 'fulfillment', 'Execução', 'fulfillment', 'access_fulfillment')
) AS seed(stage_order, stage_key, label, task_type, group_key)
JOIN public.corporate_work_groups AS work_group ON work_group.group_key = seed.group_key
ON CONFLICT (routing_policy_id, stage_order) DO NOTHING;

ALTER TABLE public.corporate_case_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_business_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_business_calendar_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_work_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_work_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_routing_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_routing_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_approval_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_sla_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.corporate_case_runtime_settings,
  public.corporate_business_calendars,
  public.corporate_business_calendar_holidays,
  public.corporate_work_groups,
  public.corporate_work_group_members,
  public.corporate_case_types,
  public.corporate_case_routing_policies,
  public.corporate_case_routing_stages,
  public.corporate_cases,
  public.corporate_case_participants,
  public.corporate_case_messages,
  public.corporate_case_events,
  public.corporate_case_tasks,
  public.corporate_case_approval_slots,
  public.corporate_case_sla_instances,
  public.corporate_notification_preferences,
  public.corporate_notification_templates,
  public.corporate_notifications,
  public.corporate_notification_outbox,
  public.corporate_notification_deliveries
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.corporate_case_runtime_settings,
  public.corporate_business_calendars,
  public.corporate_business_calendar_holidays,
  public.corporate_work_groups,
  public.corporate_work_group_members,
  public.corporate_case_types,
  public.corporate_case_routing_policies,
  public.corporate_case_routing_stages,
  public.corporate_cases,
  public.corporate_case_participants,
  public.corporate_case_messages,
  public.corporate_case_events,
  public.corporate_case_tasks,
  public.corporate_case_approval_slots,
  public.corporate_case_sla_instances,
  public.corporate_notification_preferences,
  public.corporate_notification_templates,
  public.corporate_notifications,
  public.corporate_notification_outbox,
  public.corporate_notification_deliveries
TO service_role;

REVOKE ALL ON SEQUENCE public.corporate_cases_case_number_seq
FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.corporate_cases_case_number_seq TO service_role;

REVOKE ALL ON FUNCTION public.corporate_cases_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.corporate_case_events_are_immutable() FROM PUBLIC, anon, authenticated;

COMMIT;
