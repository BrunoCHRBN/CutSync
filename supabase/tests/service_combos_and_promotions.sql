\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'services' AND column_name = 'kind'
  ) THEN RAISE EXCEPTION 'FAIL: services.kind missing'; END IF;

  IF to_regclass('public.service_combo_items') IS NULL THEN
    RAISE EXCEPTION 'FAIL: service_combo_items missing';
  END IF;
  IF to_regclass('public.service_promotions') IS NULL THEN
    RAISE EXCEPTION 'FAIL: service_promotions missing';
  END IF;
END $$;

DO $$
DECLARE
  body text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_effective_price';
  IF body IS NULL THEN RAISE EXCEPTION 'FAIL: get_effective_price missing'; END IF;

  SELECT pg_get_functiondef(p.oid) INTO body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'set_appointment_duration_snapshot';
  IF position('get_effective_price' IN body) = 0 THEN
    RAISE EXCEPTION 'FAIL: snapshot trigger does not use get_effective_price';
  END IF;
END $$;

ROLLBACK;
