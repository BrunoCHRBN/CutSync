BEGIN;

-- Existing Supabase projects may have granted EXECUTE directly to anon when
-- these functions were created. Revoking PUBLIC alone does not remove that
-- direct grant, so keep the multi-app RPC surface authenticated-only.
REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_push_device(text, text, text) FROM anon;

REVOKE ALL ON FUNCTION public.unregister_push_device(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unregister_push_device(text) FROM anon;

REVOKE ALL ON FUNCTION public.get_my_operational_contexts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_operational_contexts() FROM anon;

GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_operational_contexts() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
