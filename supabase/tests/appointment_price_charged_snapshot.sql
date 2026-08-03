-- Contract smoke for appointment price_charged snapshot.
\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'price_charged'
  ) THEN
    RAISE EXCEPTION 'FAIL: appointments.price_charged missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'price_charged'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'FAIL: appointments.price_charged must be NOT NULL';
  END IF;
END $$;

-- Assert the trigger freezes both duration and price (including professional override).
DO $$
DECLARE
  body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_appointment_duration_snapshot';

  IF body IS NULL THEN
    RAISE EXCEPTION 'FAIL: set_appointment_duration_snapshot missing';
  END IF;
  IF position('NEW.price_charged' IN body) = 0 THEN
    RAISE EXCEPTION 'FAIL: trigger does not snapshot price_charged';
  END IF;
  IF position('professional_service.price' IN body) = 0 THEN
    RAISE EXCEPTION 'FAIL: trigger ignores professional price override';
  END IF;
END $$;

DO $$
DECLARE
  body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_admin_report_v2_before_business_access';

  IF body IS NULL THEN
    RAISE EXCEPTION 'FAIL: get_admin_report_v2_before_business_access missing';
  END IF;
  IF position('appointment.price_charged' IN body) = 0 THEN
    RAISE EXCEPTION 'FAIL: admin report v2 still uses live catalog prices';
  END IF;
  IF position('service.price' IN body) > 0 THEN
    RAISE EXCEPTION 'FAIL: admin report v2 still references service.price';
  END IF;
END $$;

ROLLBACK;
