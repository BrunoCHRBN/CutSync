BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- G13 policy slice. Operational payment receiver identifiers deliberately stay
-- null until the separate POS/Connect domains exist. Null therefore means
-- "no operational receiver configured", never a SaaS billing account.
CREATE OR REPLACE FUNCTION public.get_reassignment_operational_condition(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'establishmentId', target_establishment_id,
    'legalEntityId', (
      SELECT organization_entity.legal_entity_id
      FROM public.organization_establishments AS unit_link
      JOIN public.organization_legal_entities AS organization_entity
        ON organization_entity.organization_id = unit_link.organization_id
       AND organization_entity.status = 'active'
       AND organization_entity.revoked_at IS NULL
      WHERE unit_link.establishment_id = target_establishment_id
        AND unit_link.status = 'active'
        AND unit_link.effective_from <= current_date
        AND (unit_link.effective_until IS NULL OR unit_link.effective_until >= current_date)
      ORDER BY organization_entity.created_at DESC
      LIMIT 1
    ),
    'receiverAccountId', NULL,
    'receiverSource', 'not_configured'
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_reassignment_customer_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
  snapshot public.appointment_professional_preference_snapshots%ROWTYPE;
  preference text := 'specific';
  policy_accepted boolean := false;
  linked_customer boolean;
  equivalent_condition boolean := false;
  operational_condition jsonb;
BEGIN
  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = NEW.appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  linked_customer := appointment.client_id IS NOT NULL
    OR appointment.establishment_client_id IS NOT NULL;

  IF TG_OP = 'INSERT' THEN
    SELECT * INTO snapshot
    FROM public.appointment_professional_preference_snapshots AS preference_snapshot
    WHERE preference_snapshot.appointment_id = appointment.id
    ORDER BY preference_snapshot.version DESC, preference_snapshot.created_at DESC
    LIMIT 1;
    IF FOUND THEN
      preference := snapshot.preference;
      policy_accepted := snapshot.policy_accepted;
    END IF;
    operational_condition := public.get_reassignment_operational_condition(
      appointment.establishment_id
    );
    NEW.previous_condition := COALESCE(NEW.previous_condition, '{}'::jsonb)
      || operational_condition
      || jsonb_build_object(
        'preference', preference,
        'preferencePolicyAccepted', policy_accepted,
        'preferencePolicyVersion', COALESCE(snapshot.policy_version, 0)
      );
    NEW.customer_decision_required := linked_customer AND NOT (
      preference = 'any_available' AND policy_accepted
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'applied' AND OLD.status <> 'applied' THEN
    operational_condition := public.get_reassignment_operational_condition(
      appointment.establishment_id
    );
    IF COALESCE(NEW.proposed_condition->>'establishmentId', '') <>
        COALESCE(operational_condition->>'establishmentId', '')
      OR COALESCE(NEW.proposed_condition->>'legalEntityId', '') <>
        COALESCE(operational_condition->>'legalEntityId', '')
      OR COALESCE(NEW.proposed_condition->>'receiverAccountId', '') <>
        COALESCE(operational_condition->>'receiverAccountId', '')
    THEN
      RAISE EXCEPTION 'reassignment_operational_party_changed'
        USING ERRCODE = '40001';
    END IF;
    RETURN NEW;
  END IF;

  -- A condition snapshot is recalculated only when a new professional proposal
  -- is created. Customer decisions and terminal transitions must not rewrite it.
  IF NEW.proposed_professional_id IS NULL
    OR NEW.proposed_professional_id IS NOT DISTINCT FROM OLD.proposed_professional_id
  THEN
    RETURN NEW;
  END IF;

  preference := COALESCE(NEW.previous_condition->>'preference', 'specific');
  policy_accepted := COALESCE(
    (NEW.previous_condition->>'preferencePolicyAccepted')::boolean,
    false
  );
  operational_condition := public.get_reassignment_operational_condition(
    appointment.establishment_id
  );
  NEW.proposed_condition := NEW.proposed_condition || operational_condition;
  equivalent_condition :=
    COALESCE(NEW.previous_condition->>'establishmentId', '') =
      COALESCE(NEW.proposed_condition->>'establishmentId', '')
    AND COALESCE(NEW.previous_condition->>'legalEntityId', '') =
      COALESCE(NEW.proposed_condition->>'legalEntityId', '')
    AND COALESCE(NEW.previous_condition->>'receiverAccountId', '') =
      COALESCE(NEW.proposed_condition->>'receiverAccountId', '')
    AND COALESCE(NEW.previous_condition->>'startsAt', '') =
      COALESCE(NEW.proposed_condition->>'startsAt', '')
    AND COALESCE(NEW.previous_condition->>'endsAt', '') =
      COALESCE(NEW.proposed_condition->>'endsAt', '')
    AND COALESCE(NEW.previous_condition->>'serviceId', '') =
      COALESCE(NEW.proposed_condition->>'serviceId', '')
    AND COALESCE(NEW.previous_condition->>'priceCents', '') =
      COALESCE(NEW.proposed_condition->>'priceCents', '');
  NEW.customer_decision_required := linked_customer AND NOT (
    preference = 'any_available' AND policy_accepted AND equivalent_condition
  );
  NEW.status := CASE
    WHEN NEW.customer_decision_required THEN 'awaiting_customer'
    ELSE 'ready_to_apply'
  END;
  NEW.proposed_condition := NEW.proposed_condition || jsonb_build_object(
    'equivalentCondition', equivalent_condition,
    'customerDecisionRequired', NEW.customer_decision_required
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointment_reassignment_customer_policy
BEFORE INSERT OR UPDATE OF proposed_condition, status, customer_decision_required
ON public.appointment_reassignment_requests
FOR EACH ROW EXECUTE FUNCTION public.enforce_reassignment_customer_policy();

CREATE TABLE public.appointment_assignment_shadow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  total_appointments integer NOT NULL CHECK (total_appointments >= 0),
  matching_appointments integer NOT NULL CHECK (matching_appointments >= 0),
  mismatched_appointments integer NOT NULL CHECK (mismatched_appointments >= 0),
  missing_assignments integer NOT NULL CHECK (missing_assignments >= 0),
  multiple_active_assignments integer NOT NULL CHECK (multiple_active_assignments >= 0),
  cutover_eligible boolean NOT NULL DEFAULT false,
  data_cutoff_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (matching_appointments + mismatched_appointments = total_appointments),
  CHECK (NOT cutover_eligible OR (
    total_appointments > 0
    AND mismatched_appointments = 0
    AND missing_assignments = 0
    AND multiple_active_assignments = 0
  ))
);

CREATE TABLE public.appointment_assignment_shadow_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.appointment_assignment_shadow_runs(id)
    ON DELETE RESTRICT,
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  issue_code text NOT NULL CHECK (issue_code IN (
    'missing_active_assignment', 'multiple_active_assignments', 'professional_mismatch'
  )),
  projected_professional_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_professional_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  active_assignment_count integer NOT NULL CHECK (active_assignment_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, appointment_id, issue_code)
);

CREATE INDEX appointment_assignment_shadow_runs_unit_idx
  ON public.appointment_assignment_shadow_runs(establishment_id, created_at DESC);
CREATE INDEX appointment_assignment_shadow_issues_run_idx
  ON public.appointment_assignment_shadow_issues(run_id, issue_code);

CREATE OR REPLACE FUNCTION public.prevent_assignment_shadow_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'assignment_shadow_evidence_immutable' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER appointment_assignment_shadow_runs_immutable
BEFORE UPDATE OR DELETE ON public.appointment_assignment_shadow_runs
FOR EACH ROW EXECUTE FUNCTION public.prevent_assignment_shadow_evidence_mutation();
CREATE TRIGGER appointment_assignment_shadow_issues_immutable
BEFORE UPDATE OR DELETE ON public.appointment_assignment_shadow_issues
FOR EACH ROW EXECUTE FUNCTION public.prevent_assignment_shadow_evidence_mutation();

CREATE OR REPLACE FUNCTION public.reconcile_appointment_assignment_shadow(
  target_establishment_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  existing public.appointment_assignment_shadow_runs%ROWTYPE;
  created public.appointment_assignment_shadow_runs%ROWTYPE;
  cutoff timestamptz := now();
  total_count integer;
  matching_count integer;
  mismatch_count integer;
  missing_count integer;
  multiple_count integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_establishment_id IS NULL OR target_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_shadow_reconciliation' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'manage_team', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing
  FROM public.appointment_assignment_shadow_runs AS run
  WHERE run.request_id = target_request_id;
  IF FOUND THEN
    IF existing.establishment_id <> target_establishment_id
      OR existing.requested_by <> actor_id
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'runId', existing.id,
      'establishmentId', existing.establishment_id,
      'totalAppointments', existing.total_appointments,
      'matchingAppointments', existing.matching_appointments,
      'mismatchedAppointments', existing.mismatched_appointments,
      'missingAssignments', existing.missing_assignments,
      'multipleActiveAssignments', existing.multiple_active_assignments,
      'cutoverEligible', existing.cutover_eligible,
      'dataCutoffAt', existing.data_cutoff_at,
      'requestId', existing.request_id,
      'replayed', true
    );
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (WHERE comparison.projection_matches
      AND comparison.active_assignment_count = 1)::integer,
    count(*) FILTER (WHERE NOT comparison.projection_matches
      OR comparison.active_assignment_count <> 1)::integer,
    count(*) FILTER (WHERE comparison.active_assignment_count = 0)::integer,
    count(*) FILTER (WHERE comparison.active_assignment_count > 1)::integer
  INTO total_count, matching_count, mismatch_count, missing_count, multiple_count
  FROM public.appointment_assignment_shadow_comparison AS comparison
  WHERE comparison.establishment_id = target_establishment_id;

  INSERT INTO public.appointment_assignment_shadow_runs(
    establishment_id, requested_by, request_id,
    total_appointments, matching_appointments, mismatched_appointments,
    missing_assignments, multiple_active_assignments,
    cutover_eligible, data_cutoff_at
  ) VALUES (
    target_establishment_id, actor_id, target_request_id,
    total_count, matching_count, mismatch_count,
    missing_count, multiple_count,
    total_count > 0 AND mismatch_count = 0
      AND missing_count = 0 AND multiple_count = 0,
    cutoff
  ) RETURNING * INTO created;

  INSERT INTO public.appointment_assignment_shadow_issues(
    run_id, appointment_id, issue_code,
    projected_professional_id, assigned_professional_id,
    active_assignment_count
  )
  SELECT
    created.id,
    comparison.appointment_id,
    CASE
      WHEN comparison.active_assignment_count = 0 THEN 'missing_active_assignment'
      WHEN comparison.active_assignment_count > 1 THEN 'multiple_active_assignments'
      ELSE 'professional_mismatch'
    END,
    comparison.projected_professional_id,
    comparison.assigned_professional_id,
    comparison.active_assignment_count
  FROM public.appointment_assignment_shadow_comparison AS comparison
  WHERE comparison.establishment_id = target_establishment_id
    AND (
      NOT comparison.projection_matches
      OR comparison.active_assignment_count <> 1
    );

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id, 'appointment_assignment.shadow_reconciled',
    target_establishment_id,
    jsonb_build_object(
      'run_id', created.id,
      'request_id', target_request_id,
      'total_appointments', total_count,
      'mismatched_appointments', mismatch_count,
      'cutover_eligible', created.cutover_eligible,
      'data_cutoff_at', cutoff
    )
  );

  RETURN jsonb_build_object(
    'runId', created.id,
    'establishmentId', created.establishment_id,
    'totalAppointments', created.total_appointments,
    'matchingAppointments', created.matching_appointments,
    'mismatchedAppointments', created.mismatched_appointments,
    'missingAssignments', created.missing_assignments,
    'multipleActiveAssignments', created.multiple_active_assignments,
    'cutoverEligible', created.cutover_eligible,
    'dataCutoffAt', created.data_cutoff_at,
    'requestId', created.request_id,
    'replayed', false
  );
END;
$$;

ALTER TABLE public.appointment_assignment_shadow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_assignment_shadow_issues ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.get_reassignment_operational_condition(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_reassignment_customer_policy()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_assignment_shadow_evidence_mutation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reassignment_operational_condition(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_reassignment_customer_policy()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_assignment_shadow_evidence_mutation()
  TO service_role;

REVOKE ALL ON public.appointment_assignment_shadow_runs,
  public.appointment_assignment_shadow_issues
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_appointment_assignment_shadow(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_appointment_assignment_shadow(uuid, uuid)
  TO authenticated;

COMMIT;
