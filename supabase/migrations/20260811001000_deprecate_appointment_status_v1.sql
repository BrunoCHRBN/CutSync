-- Migration: Deprecação lógica de update_appointment_status v1
-- Todo o código atual (web admin/profissional/cliente e app mobile do cliente)
-- passou a usar update_appointment_status_v2, que trabalha com reason codes e
-- separa a nota administrativa interna. A v1 é mantida APENAS para compatibilidade
-- com builds mobile já instalados (não é falha de privilégio: valida papel
-- server-side e restringe o motivo a um conjunto fixo). Não revogamos o EXECUTE
-- para não quebrar apps antigos; apenas marcamos como deprecada.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.update_appointment_status(text, text, text)') IS NOT NULL THEN
    EXECUTE $c$
      COMMENT ON FUNCTION public.update_appointment_status(text, text, text) IS
      'DEPRECATED (2026-06): use update_appointment_status_v2. Mantida apenas para compatibilidade com builds mobile antigos.'
    $c$;
  END IF;
END $$;

COMMIT;
