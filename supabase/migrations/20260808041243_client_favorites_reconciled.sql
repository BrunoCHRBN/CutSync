BEGIN;
CREATE TABLE IF NOT EXISTS public.client_favorite_establishments (
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, establishment_id)
);
CREATE INDEX IF NOT EXISTS client_favorite_establishments_client_created_idx
  ON public.client_favorite_establishments (client_id, created_at DESC);
ALTER TABLE public.client_favorite_establishments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_favorites_select_own ON public.client_favorite_establishments;
CREATE POLICY client_favorites_select_own
  ON public.client_favorite_establishments
  FOR SELECT
  TO authenticated
  USING (client_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS client_favorites_insert_own ON public.client_favorite_establishments;
CREATE POLICY client_favorites_insert_own
  ON public.client_favorite_establishments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.establishments AS establishment
      WHERE establishment.id = establishment_id
        AND establishment.account_status = 'active'
    )
  );
DROP POLICY IF EXISTS client_favorites_delete_own ON public.client_favorite_establishments;
CREATE POLICY client_favorites_delete_own
  ON public.client_favorite_establishments
  FOR DELETE
  TO authenticated
  USING (client_id = (SELECT auth.uid()));
CREATE OR REPLACE FUNCTION public.list_client_favorite_establishments()
RETURNS TABLE (
  establishment_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  RETURN QUERY
  SELECT
    favorite.establishment_id,
    favorite.created_at
  FROM public.client_favorite_establishments AS favorite
  JOIN public.establishments AS establishment
    ON establishment.id = favorite.establishment_id
  WHERE favorite.client_id = actor_id
    AND establishment.account_status = 'active'
  ORDER BY favorite.created_at DESC;
END;
$$;
CREATE OR REPLACE FUNCTION public.set_client_favorite_establishment(
  target_establishment_id uuid,
  target_favorited boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  is_active boolean := false;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_establishment_id';
  END IF;

  SELECT establishment.account_status = 'active'
  INTO is_active
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  IF NOT COALESCE(is_active, false) THEN
    RAISE EXCEPTION 'establishment_unavailable';
  END IF;

  IF target_favorited THEN
    INSERT INTO public.client_favorite_establishments (client_id, establishment_id)
    VALUES (actor_id, target_establishment_id)
    ON CONFLICT (client_id, establishment_id) DO NOTHING;
    RETURN true;
  END IF;

  DELETE FROM public.client_favorite_establishments
  WHERE client_id = actor_id
    AND establishment_id = target_establishment_id;

  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.list_client_favorite_establishments() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_client_favorite_establishments() TO authenticated;
REVOKE ALL ON FUNCTION public.set_client_favorite_establishment(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_client_favorite_establishment(uuid, boolean) TO authenticated;
REVOKE ALL ON TABLE public.client_favorite_establishments FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.client_favorite_establishments TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
