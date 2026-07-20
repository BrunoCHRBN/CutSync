BEGIN;

SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.services ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ordered_services AS (
  SELECT id, row_number() OVER (PARTITION BY establishment_id ORDER BY created_at, id) * 10 AS position
  FROM public.services
)
UPDATE public.services service
SET sort_order = ordered_services.position
FROM ordered_services
WHERE service.id = ordered_services.id
  AND service.sort_order IS NULL;

ALTER TABLE public.services ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE public.services ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS services_establishment_sort_idx
  ON public.services (establishment_id, sort_order, name)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.reorder_service(
  target_establishment_id uuid,
  target_service_id text,
  direction text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  current_service public.services%ROWTYPE;
  neighbor_service public.services%ROWTYPE;
  temporary_position integer;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF direction NOT IN ('up', 'down') THEN RAISE EXCEPTION 'invalid_direction'; END IF;

  SELECT * INTO current_service
  FROM public.services service
  WHERE service.id = target_service_id
    AND service.establishment_id = target_establishment_id
    AND service.deleted_at IS NULL
  FOR UPDATE;
  IF current_service.id IS NULL THEN RAISE EXCEPTION 'service_not_found'; END IF;

  IF direction = 'up' THEN
    SELECT * INTO neighbor_service
    FROM public.services service
    WHERE service.establishment_id = target_establishment_id
      AND service.deleted_at IS NULL
      AND (service.sort_order < current_service.sort_order
        OR (service.sort_order = current_service.sort_order AND service.name < current_service.name))
    ORDER BY service.sort_order DESC, service.name DESC
    LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO neighbor_service
    FROM public.services service
    WHERE service.establishment_id = target_establishment_id
      AND service.deleted_at IS NULL
      AND (service.sort_order > current_service.sort_order
        OR (service.sort_order = current_service.sort_order AND service.name > current_service.name))
    ORDER BY service.sort_order, service.name
    LIMIT 1 FOR UPDATE;
  END IF;

  IF neighbor_service.id IS NULL THEN RETURN; END IF;
  temporary_position := current_service.sort_order;
  UPDATE public.services SET sort_order = neighbor_service.sort_order WHERE id = current_service.id;
  UPDATE public.services SET sort_order = temporary_position WHERE id = neighbor_service.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reorder_service(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_service(uuid, text, text) TO authenticated;

COMMIT;
