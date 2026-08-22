BEGIN;

DO $$
DECLARE
  table_name text;
  expected_tables text[] := ARRAY[
    'corporate_case_runtime_settings',
    'corporate_business_calendars',
    'corporate_business_calendar_holidays',
    'corporate_work_groups',
    'corporate_work_group_members',
    'corporate_case_types',
    'corporate_case_routing_policies',
    'corporate_case_routing_stages',
    'corporate_cases',
    'corporate_case_participants',
    'corporate_case_messages',
    'corporate_case_events',
    'corporate_case_tasks',
    'corporate_case_approval_slots',
    'corporate_case_sla_instances',
    'corporate_notification_preferences',
    'corporate_notification_templates',
    'corporate_notifications',
    'corporate_notification_outbox',
    'corporate_notification_deliveries'
  ];
BEGIN
  FOREACH table_name IN ARRAY expected_tables LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = table_name
        AND relation.relkind = 'r'
        AND relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'FAIL: missing private RLS table %', table_name;
    END IF;

    IF has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
       OR has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') THEN
      RAISE EXCEPTION 'FAIL: direct client privilege on %', table_name;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.corporate_case_runtime_settings
    WHERE enabled OR creation_enabled OR automation_enabled OR email_enabled OR legacy_redirects_enabled
  ) THEN
    RAISE EXCEPTION 'FAIL: corporate cases runtime unexpectedly enabled';
  END IF;

  IF (SELECT count(*) FROM public.control_permission_catalog WHERE area = 'cases') <> 6 THEN
    RAISE EXCEPTION 'FAIL: corporate cases permission catalog is incomplete';
  END IF;

  IF (SELECT count(*) FROM public.corporate_case_routing_stages) <> 16 THEN
    RAISE EXCEPTION 'FAIL: access routing stages were not seeded for every risk level';
  END IF;

  IF EXISTS (SELECT 1 FROM public.corporate_work_group_members) THEN
    RAISE EXCEPTION 'FAIL: migration assigned real users to work groups';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.corporate_case_events'::regclass
      AND tgname = 'corporate_case_events_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL: immutable event trigger is missing';
  END IF;
END;
$$;

ROLLBACK;
