SET search_path = pg_catalog, public;

-- Dispatcher RPCs expose push tokens and mutate delivery state. They are
-- internal worker APIs and must never inherit PostgreSQL's default PUBLIC
-- EXECUTE grant after a function recreation or remote schema reconciliation.
REVOKE ALL ON FUNCTION public.enqueue_client_appointment_push()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_due_client_appointment_reminders(timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_client_push_deliveries(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_push_delivery(
  uuid, boolean, text, text, boolean
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_client_push_receipts(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_push_receipt(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.queue_due_client_appointment_reminders(timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_client_push_deliveries(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_push_delivery(
  uuid, boolean, text, text, boolean
) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_client_push_receipts(integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_push_receipt(uuid, boolean, text)
  TO service_role;

COMMENT ON FUNCTION public.claim_client_push_deliveries(integer) IS
  'Internal service-role worker API. PUBLIC, anon and authenticated EXECUTE are explicitly revoked.';

NOTIFY pgrst, 'reload schema';
