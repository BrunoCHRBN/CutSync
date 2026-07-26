-- Migration: 20260720004050_allow_governance_establishments_update.sql
-- Descrição: Habilita usuários de governança com permissão de escrita (SaaS_Editor e SaaS_Owner) a alterarem dados operacionais dos estabelecimentos.

BEGIN;

DROP POLICY IF EXISTS "Governance editors update establishments"
  ON public.establishments;
CREATE POLICY "Governance editors update establishments" ON public.establishments
  FOR UPDATE TO authenticated
  USING (public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]))
  WITH CHECK (public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]));

COMMIT;
