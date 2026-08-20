BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Validation is intentionally separate from constraint creation. PostgreSQL
-- can validate existing rows without the write-blocking lock used by an
-- immediately validated ADD CONSTRAINT.
ALTER TABLE public.approval_requests
  VALIDATE CONSTRAINT approval_requests_subject_appointment_id_fkey;
ALTER TABLE public.approval_requests
  VALIDATE CONSTRAINT approval_requests_proposed_professional_id_fkey;
ALTER TABLE public.approval_requests
  VALIDATE CONSTRAINT approval_requests_consumed_by_fkey;
ALTER TABLE public.approval_requests
  VALIDATE CONSTRAINT executor_correction_approval_payload_check;

COMMIT;
