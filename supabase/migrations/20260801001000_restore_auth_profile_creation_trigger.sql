-- Keep Auth users and public profiles synchronized in environments restored
-- from a schema-only snapshot. The public function already exists in the
-- historical schema, but triggers on auth.users are not always restored.

DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    RAISE EXCEPTION 'missing public.handle_new_user()';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger AS trigger
    WHERE trigger.tgrelid = 'auth.users'::regclass
      AND trigger.tgname = 'on_auth_user_created'
      AND NOT trigger.tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();
  END IF;
END;
$$;
