SET search_path = pg_catalog, public, extensions;

CREATE OR REPLACE FUNCTION public.kick_notification_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  dispatcher_url text;
  dispatcher_secret text;
BEGIN
  IF TG_NARGS <> 1 OR TG_ARGV[0] NOT IN (
    'notification_dispatch_client_url',
    'notification_dispatch_business_url'
  ) THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM inserted_deliveries) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO dispatcher_url
  FROM vault.decrypted_secrets
  WHERE name = TG_ARGV[0]
  LIMIT 1;

  SELECT decrypted_secret INTO dispatcher_secret
  FROM vault.decrypted_secrets
  WHERE name = 'notification_dispatch_secret'
  LIMIT 1;

  IF NULLIF(btrim(dispatcher_url), '') IS NULL
    OR NULLIF(btrim(dispatcher_secret), '') IS NULL
  THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := dispatcher_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cutsync-dispatch-secret', dispatcher_secret
    ),
    body := '{"mode":"send","limit":100}'::jsonb,
    timeout_milliseconds := 10000
  );

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Notification availability must never roll back the originating operation.
  -- The minute cron remains the durable recovery path.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS kick_client_notification_dispatch_trigger
  ON public.client_push_deliveries;
CREATE TRIGGER kick_client_notification_dispatch_trigger
AFTER INSERT ON public.client_push_deliveries
REFERENCING NEW TABLE AS inserted_deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION public.kick_notification_dispatch(
  'notification_dispatch_client_url'
);

DROP TRIGGER IF EXISTS kick_business_notification_dispatch_trigger
  ON public.business_push_deliveries;
CREATE TRIGGER kick_business_notification_dispatch_trigger
AFTER INSERT ON public.business_push_deliveries
REFERENCING NEW TABLE AS inserted_deliveries
FOR EACH STATEMENT
EXECUTE FUNCTION public.kick_notification_dispatch(
  'notification_dispatch_business_url'
);

REVOKE ALL ON FUNCTION public.kick_notification_dispatch()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kick_notification_dispatch()
  TO service_role;

COMMENT ON FUNCTION public.kick_notification_dispatch() IS
  'Asynchronously wakes the relevant notification dispatcher after queue insertion; cron remains the fallback.';
