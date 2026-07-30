BEGIN;

CREATE TABLE IF NOT EXISTS public.marketing_contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  establishment_name text,
  message text NOT NULL,
  consent boolean NOT NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  answered_at timestamptz,
  CONSTRAINT marketing_contact_requests_origin_check CHECK (origin IN ('client', 'business')),
  CONSTRAINT marketing_contact_requests_status_check CHECK (status IN ('new', 'in_review', 'answered', 'archived')),
  CONSTRAINT marketing_contact_requests_consent_check CHECK (consent),
  CONSTRAINT marketing_contact_requests_name_check CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT marketing_contact_requests_email_check CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AND char_length(email) <= 180),
  CONSTRAINT marketing_contact_requests_establishment_check CHECK (establishment_name IS NULL OR char_length(btrim(establishment_name)) BETWEEN 1 AND 140),
  CONSTRAINT marketing_contact_requests_message_check CHECK (char_length(btrim(message)) BETWEEN 12 AND 1200)
);

COMMENT ON TABLE public.marketing_contact_requests IS
  'Solicitações comerciais recebidas nas landings públicas. Não armazena IP, user-agent ou telemetria do visitante.';

CREATE INDEX IF NOT EXISTS marketing_contact_requests_email_created_idx
  ON public.marketing_contact_requests (email, created_at DESC);

CREATE INDEX IF NOT EXISTS marketing_contact_requests_status_created_idx
  ON public.marketing_contact_requests (status, created_at DESC);

ALTER TABLE public.marketing_contact_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_contact_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_contact_requests_no_direct_access ON public.marketing_contact_requests;

CREATE OR REPLACE FUNCTION public.marketing_contact_requests_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_contact_requests_touch_updated_at ON public.marketing_contact_requests;

CREATE TRIGGER marketing_contact_requests_touch_updated_at
  BEFORE UPDATE ON public.marketing_contact_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.marketing_contact_requests_touch_updated_at();

CREATE OR REPLACE FUNCTION public.submit_marketing_contact_request(
  request_origin text,
  contact_name text,
  contact_email text,
  contact_establishment_name text,
  contact_message text,
  contact_consent boolean,
  contact_trap text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_origin text;
  normalized_name text;
  normalized_email text;
  normalized_establishment text;
  normalized_message text;
  recent_requests integer;
BEGIN
  -- Honeypot: descarta silenciosamente e responde de forma genérica.
  IF char_length(btrim(COALESCE(contact_trap, ''))) > 0 THEN
    RETURN jsonb_build_object('status', 'received');
  END IF;

  normalized_origin := lower(btrim(COALESCE(request_origin, '')));
  normalized_name := btrim(regexp_replace(COALESCE(contact_name, ''), '\s+', ' ', 'g'));
  normalized_email := lower(btrim(COALESCE(contact_email, '')));
  normalized_establishment := NULLIF(btrim(regexp_replace(COALESCE(contact_establishment_name, ''), '\s+', ' ', 'g')), '');
  normalized_message := btrim(COALESCE(contact_message, ''));

  IF normalized_origin NOT IN ('client', 'business')
    OR COALESCE(contact_consent, false) IS DISTINCT FROM true
    OR char_length(normalized_name) < 2
    OR char_length(normalized_name) > 120
    OR char_length(normalized_email) > 180
    OR normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR char_length(normalized_message) < 12
    OR char_length(normalized_message) > 1200
    OR (normalized_establishment IS NOT NULL AND char_length(normalized_establishment) > 140)
    OR normalized_name ~ '[<>]'
    OR normalized_message ~ '[<>]'
  THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF normalized_origin = 'client' THEN
    normalized_establishment := NULL;
  END IF;

  SELECT count(*)
  INTO recent_requests
  FROM public.marketing_contact_requests AS request
  WHERE request.email = normalized_email
    AND request.created_at > timezone('utc', now()) - interval '24 hours';

  -- Limite de 3 solicitações por e-mail em 24 horas, com resposta genérica.
  IF recent_requests >= 3 THEN
    RETURN jsonb_build_object('status', 'received');
  END IF;

  INSERT INTO public.marketing_contact_requests (
    origin, name, email, establishment_name, message, consent
  ) VALUES (
    normalized_origin, normalized_name, normalized_email, normalized_establishment, normalized_message, true
  );

  RETURN jsonb_build_object('status', 'received');
END;
$$;

COMMENT ON FUNCTION public.submit_marketing_contact_request(text, text, text, text, text, boolean, text) IS
  'Único ponto de escrita das solicitações comerciais públicas: validação server-side, honeypot, limite de 3 por e-mail em 24h e resposta genérica.';

REVOKE ALL ON TABLE public.marketing_contact_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_contact_requests_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_marketing_contact_request(text, text, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_marketing_contact_request(text, text, text, text, text, boolean, text) TO anon, authenticated;

COMMIT;
