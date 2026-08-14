BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Payment/settlement does not exist yet. Keep the lifecycle implementation
-- available to trusted backend workers, but outside the mobile RPC surface.
REVOKE ALL ON FUNCTION public.close_service_order(uuid, uuid, bigint, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_service_order(uuid, uuid, bigint, uuid)
  TO service_role;

ALTER FUNCTION public.fold_establishment_client_search_text(text)
  SET search_path = pg_catalog, public;

CREATE INDEX IF NOT EXISTS client_favorites_establishment_idx
  ON public.client_favorite_establishments (establishment_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
