-- The push queue is intentionally service-role-only. Its table-level CHECK
-- constraint still invokes this helper for every worker update, so the worker
-- role must be able to execute it even though app roles must not.
REVOKE ALL ON FUNCTION public.is_safe_business_push_payload(jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_safe_business_push_payload(jsonb)
  TO service_role;
