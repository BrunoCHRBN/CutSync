BEGIN;

-- Add new fields to public.establishments
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS average_rating numeric(3,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS average_price numeric(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS price_level integer NOT NULL DEFAULT 1;

-- Create review table
CREATE TABLE IF NOT EXISTS public.establishment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE UNIQUE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS policies
ALTER TABLE public.establishment_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read reviews"
  ON public.establishment_reviews FOR SELECT
  USING (true);

CREATE POLICY "Clients can insert their own reviews for past or completed appointments"
  ON public.establishment_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = client_id AND
    EXISTS (
      SELECT 1 FROM public.appointments appt
      WHERE appt.id = appointment_id
        AND appt.client_id = auth.uid()
        AND (appt.status = 'completed' OR (appt.status = 'confirmed' AND appt.date_time < now()))
    )
  );

CREATE POLICY "Clients can update their own reviews"
  ON public.establishment_reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = client_id)
  WITH CHECK (auth.uid() = client_id);

CREATE POLICY "Clients can delete their own reviews"
  ON public.establishment_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = client_id);

-- Trigger function to update average rating and review count
CREATE OR REPLACE FUNCTION public.update_establishment_ratings()
RETURNS trigger AS $$
DECLARE
  avg_rating numeric(3,2);
  cnt_reviews integer;
  target_est_id uuid;
BEGIN
  target_est_id := COALESCE(NEW.establishment_id, OLD.establishment_id);

  SELECT COALESCE(AVG(rating), 0)::numeric(3,2), COUNT(*)
  INTO avg_rating, cnt_reviews
  FROM public.establishment_reviews
  WHERE establishment_id = target_est_id;

  UPDATE public.establishments
  SET average_rating = avg_rating,
      review_count = cnt_reviews
  WHERE id = target_est_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for ratings
DROP TRIGGER IF EXISTS update_establishment_ratings_trigger ON public.establishment_reviews;
CREATE TRIGGER update_establishment_ratings_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.establishment_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_establishment_ratings();

-- Trigger function to update price level
CREATE OR REPLACE FUNCTION public.update_establishment_price_level()
RETURNS trigger AS $$
DECLARE
  avg_price numeric(10,2);
  p_level integer;
  target_est_id uuid;
BEGIN
  target_est_id := COALESCE(NEW.establishment_id, OLD.establishment_id);

  SELECT COALESCE(AVG(price), 0)::numeric(10,2)
  INTO avg_price
  FROM public.services
  WHERE establishment_id = target_est_id
    AND is_active = true
    AND deleted_at IS NULL;

  IF avg_price < 40.00 THEN
    p_level := 1;
  ELSIF avg_price >= 40.00 AND avg_price <= 80.00 THEN
    p_level := 2;
  ELSE
    p_level := 3;
  END IF;

  UPDATE public.establishments
  SET average_price = avg_price,
      price_level = p_level
  WHERE id = target_est_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for price levels
DROP TRIGGER IF EXISTS update_establishment_price_level_trigger ON public.services;
CREATE TRIGGER update_establishment_price_level_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.update_establishment_price_level();

-- Initialize existing data
UPDATE public.establishments est
SET
  average_price = COALESCE((
    SELECT AVG(price)::numeric(10,2)
    FROM public.services s
    WHERE s.establishment_id = est.id
      AND s.is_active = true
      AND s.deleted_at IS NULL
  ), 0.00);

UPDATE public.establishments
SET price_level = CASE
  WHEN average_price < 40.00 THEN 1
  WHEN average_price >= 40.00 AND average_price <= 80.00 THEN 2
  ELSE 3
END;

COMMIT;
