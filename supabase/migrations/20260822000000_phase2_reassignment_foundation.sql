BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Phase 2, slice 1: additive server-side reassignment model. The legacy
-- appointments.professional_id projection remains authoritative until a later
-- shadow-validation cutover.

CREATE TABLE public.appointment_professional_preference_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  preference text NOT NULL CHECK (preference IN ('specific', 'any_available')),
  selected_professional_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  policy_version integer NOT NULL CHECK (policy_version > 0),
  policy_accepted boolean NOT NULL DEFAULT false,
  acceptance_channel text CHECK (acceptance_channel IN (
    'client_web', 'client_app', 'business', 'web', 'import', 'legacy_default'
  )),
  accepted_at timestamptz,
  captured_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id uuid NOT NULL UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_preference_specific_professional_check CHECK (
    preference <> 'specific' OR selected_professional_id IS NOT NULL
  ),
  CONSTRAINT appointment_preference_acceptance_check CHECK (
    (policy_accepted AND acceptance_channel IS NOT NULL AND accepted_at IS NOT NULL)
    OR (NOT policy_accepted AND accepted_at IS NULL)
  ),
  UNIQUE (appointment_id, version)
);

CREATE TABLE public.appointment_professional_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN (
    'proposed', 'active', 'superseded', 'corrected'
  )),
  source text NOT NULL CHECK (source IN (
    'legacy_projection', 'booking', 'reassignment', 'correction'
  )),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  supersedes_assignment_id uuid REFERENCES public.appointment_professional_assignments(id)
    ON DELETE RESTRICT,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id uuid UNIQUE,
  correlation_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from)
);

CREATE UNIQUE INDEX appointment_assignments_one_active_idx
  ON public.appointment_professional_assignments(appointment_id)
  WHERE status = 'active' AND effective_until IS NULL;
CREATE INDEX appointment_assignments_timeline_idx
  ON public.appointment_professional_assignments(appointment_id, effective_from, created_at);

CREATE TABLE public.appointment_reassignment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  previous_assignment_id uuid REFERENCES public.appointment_professional_assignments(id)
    ON DELETE RESTRICT,
  proposed_professional_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  initiated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  responsibility text NOT NULL CHECK (responsibility IN (
    'professional', 'reception', 'manager', 'admin', 'owner', 'customer', 'system'
  )),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{2,79}$'),
  previous_condition jsonb NOT NULL CHECK (jsonb_typeof(previous_condition) = 'object'),
  proposed_condition jsonb NOT NULL CHECK (jsonb_typeof(proposed_condition) = 'object'),
  customer_decision_required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'validating', 'awaiting_manager', 'awaiting_customer',
    'ready_to_apply', 'applied', 'declined', 'withdrawn', 'expired',
    'failed', 'manual_review'
  )),
  due_at timestamptz NOT NULL,
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  expected_appointment_updated_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  completed_at timestamptz,
  CHECK (due_at > created_at),
  CHECK (
    (status = 'applied' AND applied_at IS NOT NULL AND completed_at IS NOT NULL)
    OR (status <> 'applied')
  )
);

ALTER TABLE public.appointment_professional_assignments
  ADD COLUMN reassignment_request_id uuid
    REFERENCES public.appointment_reassignment_requests(id) ON DELETE RESTRICT;

CREATE INDEX appointment_reassignment_requests_queue_idx
  ON public.appointment_reassignment_requests(
    establishment_id, status, due_at, created_at
  )
  WHERE status IN (
    'requested', 'validating', 'awaiting_manager', 'awaiting_customer',
    'ready_to_apply', 'manual_review'
  );
CREATE INDEX appointment_reassignment_requests_appointment_idx
  ON public.appointment_reassignment_requests(appointment_id, created_at DESC);

CREATE TABLE public.customer_change_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reassignment_request_id uuid NOT NULL UNIQUE
    REFERENCES public.appointment_reassignment_requests(id) ON DELETE RESTRICT,
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  decision text NOT NULL DEFAULT 'pending' CHECK (decision IN (
    'pending', 'accept_replacement', 'choose_professional',
    'reschedule_original', 'cancel_due_to_change', 'contested', 'resolved'
  )),
  accepted_assignment_id uuid REFERENCES public.appointment_professional_assignments(id)
    ON DELETE RESTRICT,
  chosen_professional_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_kind text CHECK (actor_kind IN ('customer', 'staff', 'system')),
  channel text CHECK (channel IN (
    'client_web', 'client_app', 'business', 'web', 'support', 'system'
  )),
  decision_reason text CHECK (
    decision_reason IS NULL
    OR char_length(btrim(decision_reason)) BETWEEN 3 AND 500
  ),
  request_id uuid UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_decision_payload_check CHECK (
    (decision = 'pending' AND decided_at IS NULL)
    OR (
      decision <> 'pending'
      AND decided_at IS NOT NULL
      AND actor_kind IS NOT NULL
      AND channel IS NOT NULL
      AND request_id IS NOT NULL
    )
  ),
  CONSTRAINT customer_decision_chosen_professional_check CHECK (
    decision <> 'choose_professional' OR chosen_professional_id IS NOT NULL
  )
);

CREATE TABLE public.appointment_assignment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  reassignment_request_id uuid REFERENCES public.appointment_reassignment_requests(id)
    ON DELETE RESTRICT,
  assignment_id uuid REFERENCES public.appointment_professional_assignments(id)
    ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type ~ '^[a-z][a-z0-9_.]{2,99}$'),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN (
    'customer', 'professional', 'staff', 'system', 'support'
  )),
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  previous_version integer CHECK (previous_version IS NULL OR previous_version > 0),
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX appointment_assignment_events_timeline_idx
  ON public.appointment_assignment_events(appointment_id, occurred_at, id);
CREATE INDEX appointment_assignment_events_correlation_idx
  ON public.appointment_assignment_events(correlation_id, occurred_at);

CREATE TABLE public.decision_queue_items (
  reassignment_request_id uuid PRIMARY KEY
    REFERENCES public.appointment_reassignment_requests(id) ON DELETE CASCADE,
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  status text NOT NULL,
  urgency text NOT NULL CHECK (urgency IN ('normal', 'attention', 'urgent', 'overdue')),
  responsibility text NOT NULL,
  due_at timestamptz NOT NULL,
  next_actor_kind text NOT NULL CHECK (next_actor_kind IN (
    'customer', 'professional', 'reception', 'manager', 'admin', 'owner', 'system'
  )),
  customer_decision_required boolean NOT NULL,
  monetary_impact boolean NOT NULL DEFAULT false,
  allowed_actions text[] NOT NULL DEFAULT ARRAY[]::text[],
  correlation_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  data_cutoff_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX decision_queue_items_operational_idx
  ON public.decision_queue_items(establishment_id, urgency, due_at, updated_at);

CREATE OR REPLACE FUNCTION public.prevent_appointment_assignment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'appointment_assignment_event_immutable' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER appointment_assignment_events_immutable
BEFORE UPDATE OR DELETE ON public.appointment_assignment_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_appointment_assignment_event_mutation();

COMMENT ON TRIGGER appointment_assignment_events_immutable
ON public.appointment_assignment_events IS
  'Application roles cannot mutate assignment audit events. Controlled owner-only erasure follows docs/architecture/GATE_G14_PREPARATION.md.';

-- Existing appointments enter shadow mode with an active assignment matching
-- the legacy projection. No authority cutover happens in this migration.
INSERT INTO public.appointment_professional_assignments(
  appointment_id,
  establishment_id,
  professional_id,
  status,
  source,
  effective_from,
  correlation_id
)
SELECT
  appointment.id,
  appointment.establishment_id,
  appointment.professional_id,
  'active',
  'legacy_projection',
  appointment.created_at,
  gen_random_uuid()
FROM public.appointments AS appointment
WHERE appointment.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.appointment_professional_assignments AS assignment
    WHERE assignment.appointment_id = appointment.id
      AND assignment.status = 'active'
      AND assignment.effective_until IS NULL
  );

CREATE VIEW public.appointment_assignment_shadow_comparison
WITH (security_invoker = true)
AS
SELECT
  appointment.id AS appointment_id,
  appointment.establishment_id,
  appointment.professional_id AS projected_professional_id,
  active_assignment.professional_id AS assigned_professional_id,
  active_assignment.id AS active_assignment_id,
  COALESCE(
    active_assignment.professional_id = appointment.professional_id,
    false
  ) AS projection_matches,
  COALESCE(active_assignment.active_count, 0) AS active_assignment_count
FROM public.appointments AS appointment
LEFT JOIN LATERAL (
  SELECT
    min(assignment.id::text)::uuid AS id,
    min(assignment.professional_id::text)::uuid AS professional_id,
    count(*)::integer AS active_count
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.appointment_id = appointment.id
    AND assignment.status = 'active'
    AND assignment.effective_until IS NULL
) AS active_assignment ON true
WHERE appointment.deleted_at IS NULL;

CREATE VIEW public.appointment_professional_preference_projection
WITH (security_invoker = true)
AS
SELECT
  appointment.id AS appointment_id,
  appointment.establishment_id,
  COALESCE(snapshot.preference, 'specific') AS preference,
  COALESCE(snapshot.selected_professional_id, appointment.professional_id)
    AS selected_professional_id,
  COALESCE(snapshot.policy_version, 0) AS policy_version,
  CASE WHEN snapshot.id IS NULL THEN 'legacy_default' ELSE 'snapshot' END
    AS preference_source,
  snapshot.id AS preference_snapshot_id,
  snapshot.version
FROM public.appointments AS appointment
LEFT JOIN LATERAL (
  SELECT preference_snapshot.*
  FROM public.appointment_professional_preference_snapshots AS preference_snapshot
  WHERE preference_snapshot.appointment_id = appointment.id
  ORDER BY preference_snapshot.version DESC, preference_snapshot.created_at DESC
  LIMIT 1
) AS snapshot ON true
WHERE appointment.deleted_at IS NULL;

ALTER TABLE public.appointment_professional_preference_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_professional_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reassignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_change_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_queue_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON
  public.appointment_professional_preference_snapshots,
  public.appointment_professional_assignments,
  public.appointment_reassignment_requests,
  public.customer_change_decisions,
  public.appointment_assignment_events,
  public.decision_queue_items
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON
  public.appointment_assignment_shadow_comparison,
  public.appointment_professional_preference_projection
FROM PUBLIC, anon, authenticated;
GRANT SELECT ON
  public.appointment_assignment_shadow_comparison,
  public.appointment_professional_preference_projection
TO service_role;

REVOKE ALL ON FUNCTION public.prevent_appointment_assignment_event_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_appointment_assignment_event_mutation()
  TO service_role;

COMMENT ON TABLE public.appointment_professional_preference_snapshots IS
  'Immutable booking-time professional preference evidence. Missing legacy evidence resolves fail-closed to specific.';
COMMENT ON TABLE public.appointment_professional_assignments IS
  'Shadow assignment timeline. appointments.professional_id remains the temporary projection until explicit cutover.';
COMMENT ON TABLE public.appointment_reassignment_requests IS
  'Authoritative versioned reassignment workflow state; never mutate from an app table client.';
COMMENT ON TABLE public.customer_change_decisions IS
  'Versioned customer decision attached to one reassignment workflow.';
COMMENT ON TABLE public.appointment_assignment_events IS
  'Immutable reassignment and assignment audit timeline keyed by request and correlation IDs.';
COMMENT ON TABLE public.decision_queue_items IS
  'Disposable decision-queue read model. Never use as an authority source.';
COMMENT ON COLUMN public.appointments.transferred_from_professional_id IS
  'legacy_transfer_metadata only; does not prove customer knowledge or acceptance.';
COMMENT ON COLUMN public.appointments.transfer_reason IS
  'legacy_transfer_metadata only; does not prove customer knowledge or acceptance.';

COMMIT;
