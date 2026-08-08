-- Migration: Access-control audit hardening (2026-06)
-- Corrige não conformidades de segregação de acesso encontradas na auditoria das
-- roles client, admin/dono e professional. Todas as mudanças são fail-closed e
-- preservam os contratos existentes de admin/superadmin.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
-- ---------------------------------------------------------------------------
-- 1. [ALTO] get_establishment_team vazava commission_rate / email / phone dos
--    colegas para qualquer membro com role 'professional'. Comissão e contato
--    passam a ser visíveis apenas para admin do estabelecimento ou superadmin.
--    Profissionais continuam enxergando a equipe (nome, avatar, título,
--    especialidades), mas sem dados sensíveis dos demais.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_establishment_team(
  target_establishment_id uuid,
  include_administrators boolean DEFAULT true
)
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, work_hours text, specialties text,
  instagram text, titulo_profissional text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_is_manager boolean;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'view_own_agenda')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  caller_is_manager := public.is_superadmin()
    OR public.is_business_administrator(target_establishment_id, false);

  RETURN QUERY
  SELECT
    p.id,
    m.establishment_id,
    p.name,
    m.role,
    -- Dados sensíveis: somente o próprio membro ou um gestor (admin/superadmin)
    CASE WHEN caller_is_manager OR p.id = (SELECT auth.uid()) THEN p.email END,
    CASE WHEN caller_is_manager OR p.id = (SELECT auth.uid()) THEN p.phone END,
    p.avatar_url,
    CASE WHEN caller_is_manager OR p.id = (SELECT auth.uid()) THEN m.commission_rate END,
    p.work_hours,
    p.specialties,
    p.instagram,
    p.titulo_profissional
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.establishment_id = target_establishment_id
    AND m.status = 'active'
    AND (include_administrators OR m.role = 'professional')
    AND p.deleted_at IS NULL
  ORDER BY p.name;
END;
$$;
REVOKE ALL ON FUNCTION public.get_establishment_team(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_establishment_team(uuid, boolean) TO authenticated;
-- ---------------------------------------------------------------------------
-- 2. [ALTO] establishment_reviews era legível por `anon` (USING (true)),
--    expondo client_id, comentários e vínculo cliente<->estabelecimento a
--    qualquer visitante e permitindo enumeração. A média/contagem pública já
--    vive em establishments.average_rating/review_count, então a tabela bruta
--    não precisa ser pública. Restringe leitura ao autor da avaliação, admins
--    do estabelecimento e superadmin.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read reviews" ON public.establishment_reviews;
DROP POLICY IF EXISTS "Reviews visible to owner and establishment managers"
  ON public.establishment_reviews;
CREATE POLICY "Reviews visible to owner and establishment managers"
  ON public.establishment_reviews FOR SELECT
  TO authenticated
  USING (
    client_id = (SELECT auth.uid())
    OR public.is_superadmin()
    OR public.has_active_membership(establishment_id, ARRAY['admin'])
  );
-- Endurece o contrato de inserção: só permite avaliar agendamentos efetivamente
-- concluídos (remove a brecha de avaliar 'confirmed' apenas por estar no passado,
-- que permitia avaliar no-shows).
DROP POLICY IF EXISTS "Clients can insert their own reviews for past or completed appointments"
  ON public.establishment_reviews;
DROP POLICY IF EXISTS "Clients review only completed appointments"
  ON public.establishment_reviews;
CREATE POLICY "Clients review only completed appointments"
  ON public.establishment_reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1 FROM public.appointments appt
      WHERE appt.id = appointment_id
        AND appt.client_id = auth.uid()
        AND appt.establishment_id = establishment_reviews.establishment_id
        AND appt.status = 'completed'
    )
  );
-- ---------------------------------------------------------------------------
-- 3. [ALTO] Notas internas do agendamento (cancellation_note_internal e
--    business_notes) eram retornadas por `SELECT *` a qualquer membro com
--    visibilidade de linha (inclusive profissional em agenda compartilhada),
--    contrariando o comentário "Never expose through client-facing RPCs or UI".
--    Revoga o SELECT dessas colunas para anon/authenticated. A escrita continua
--    via RPCs SECURITY DEFINER (rodam como owner) e o service_role mantém acesso
--    para reconciliações/edge functions.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
      AND column_name = 'cancellation_note_internal'
  ) THEN
    EXECUTE 'REVOKE SELECT (cancellation_note_internal) ON public.appointments FROM anon, authenticated';
    EXECUTE 'GRANT SELECT (cancellation_note_internal) ON public.appointments TO service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
      AND column_name = 'business_notes'
  ) THEN
    EXECUTE 'REVOKE SELECT (business_notes) ON public.appointments FROM anon, authenticated';
    EXECUTE 'GRANT SELECT (business_notes) ON public.appointments TO service_role';
  END IF;
END $$;
-- ---------------------------------------------------------------------------
-- 4. [MÉDIO] Usuários conseguiam alterar diretamente profiles.email (o grant
--    dinâmico de 20260721004000 só excluía id/role/establishment_id/
--    commission_rate). Isso permitia divergência com auth.users.email e
--    poluição do matching por e-mail. Revoga UPDATE da coluna email; o e-mail
--    canônico continua sendo o do provedor de auth.
-- ---------------------------------------------------------------------------
REVOKE UPDATE (email) ON public.profiles FROM authenticated;
COMMIT;
