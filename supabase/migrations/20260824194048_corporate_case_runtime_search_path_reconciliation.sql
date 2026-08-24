-- Reconcile Homolog instances where the original runtime administration
-- migration was applied before its SECURITY DEFINER search_path hardening.

ALTER FUNCTION public.corporate_case_runtime_changes_are_immutable()
  SET search_path = pg_catalog;

ALTER FUNCTION public.get_corporate_case_runtime_administration_context(integer)
  SET search_path = pg_catalog;

ALTER FUNCTION public.set_corporate_case_runtime_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
) SET search_path = pg_catalog;
