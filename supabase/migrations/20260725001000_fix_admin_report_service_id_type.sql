-- Correct deployments where the interactive report RPCs were created with
-- target_service_id uuid even though services.id/appointments.service_id are text.
DO $migration$
DECLARE
  old_report regprocedure := to_regprocedure(
    'public.get_admin_report_v2(uuid,date,date,uuid,uuid,text)'
  );
  old_details regprocedure := to_regprocedure(
    'public.get_admin_report_details(uuid,date,date,text,uuid,uuid,text,date,integer,integer,text,integer)'
  );
  function_definition text;
BEGIN
  IF old_report IS NOT NULL THEN
    SELECT pg_get_functiondef(old_report) INTO function_definition;
    function_definition := replace(
      function_definition,
      'target_service_id uuid DEFAULT NULL::uuid',
      'target_service_id text DEFAULT NULL::text'
    );
    IF function_definition NOT LIKE '%target_service_id text%' THEN
      RAISE EXCEPTION 'unable_to_patch_get_admin_report_v2_service_id';
    END IF;
    DROP FUNCTION public.get_admin_report_v2(uuid, date, date, uuid, uuid, text);
    EXECUTE function_definition;
  END IF;

  IF old_details IS NOT NULL THEN
    SELECT pg_get_functiondef(old_details) INTO function_definition;
    function_definition := replace(
      function_definition,
      'target_service_id uuid DEFAULT NULL::uuid',
      'target_service_id text DEFAULT NULL::text'
    );
    IF function_definition NOT LIKE '%target_service_id text%' THEN
      RAISE EXCEPTION 'unable_to_patch_get_admin_report_details_service_id';
    END IF;
    DROP FUNCTION public.get_admin_report_details(
      uuid, date, date, text, uuid, uuid, text, date, integer, integer, text, integer
    );
    EXECUTE function_definition;
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_admin_report_v2(uuid, date, date, uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_report_v2(uuid, date, date, uuid, text, text)
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_admin_report_details(
  uuid, date, date, text, uuid, text, text, date, integer, integer, text, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_report_details(
  uuid, date, date, text, uuid, text, text, date, integer, integer, text, integer
) TO authenticated;

NOTIFY pgrst, 'reload schema';
