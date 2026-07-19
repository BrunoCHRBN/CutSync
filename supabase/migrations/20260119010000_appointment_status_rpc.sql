BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- RPC transacional para atualizar o status do agendamento (confirmar / cancelar / concluir).
--
-- Preenche o gap deixado pela migration `20260716057000_transactional_appointment_creation.sql`,
-- que revogou UPDATE direto em `public.appointments` do role `authenticated`. Sem uma RPC dedicada,
-- os dashboards de admin/profissional retornavam `permission denied` ao tentar mudar o status.
--
-- Regras de transição aplicadas server-side (imutáveis):
--   pending   -> confirmed  (apenas admin/profissional membro do estabelecimento)
--   pending   -> cancelled  (cliente dono do agendamento OU admin/profissional)
--   confirmed -> completed  (apenas admin/profissional; exige date_time <= now())
--   confirmed -> cancelled  (cliente dono OU admin/profissional)
--   completed | cancelled -> * (proibido; agendamento imutável após término)
--
-- `cancelled_by_role` é decidido pelo servidor a partir do papel do ator, para evitar spoof.
CREATE OR REPLACE FUNCTION public.update_appointment_status(
  target_appointment_id text,
  new_status text,
  new_cancellation_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional_member boolean;
  actor_is_owner_client boolean;
  effective_cancelled_by_role text;
  effective_reason text;
  current_appointment public.appointments%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF new_status NOT IN ('confirmed', 'cancelled', 'completed') THEN
    RAISE EXCEPTION 'invalid_status_value';
  END IF;

  SELECT * INTO current_appointment
  FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL
  FOR UPDATE;

  IF current_appointment.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  -- Estado terminal: agendamento concluído ou cancelado não pode voltar.
  IF current_appointment.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'appointment_status_immutable';
  END IF;

  -- Descobre o papel do ator no estabelecimento do agendamento.
  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin']);
  actor_is_professional_member := public.has_active_membership(
    current_appointment.establishment_id,
    ARRAY['professional', 'admin']
  );
  actor_is_owner_client := current_appointment.client_id = actor_id;

  -- Validação de transição + autorização por papel.
  IF new_status = 'confirmed' THEN
    IF current_appointment.status <> 'pending' THEN
      RAISE EXCEPTION 'invalid_status_transition';
    END IF;
    IF NOT actor_is_professional_member THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

  ELSIF new_status = 'completed' THEN
    IF current_appointment.status <> 'confirmed' THEN
      RAISE EXCEPTION 'invalid_status_transition';
    END IF;
    IF NOT actor_is_professional_member THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF current_appointment.date_time > now() THEN
      RAISE EXCEPTION 'appointment_not_yet_finished';
    END IF;

  ELSE -- new_status = 'cancelled'
    IF current_appointment.status NOT IN ('pending', 'confirmed') THEN
      RAISE EXCEPTION 'invalid_status_transition';
    END IF;
    IF NOT (actor_is_owner_client OR actor_is_professional_member) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    IF actor_is_admin THEN
      effective_cancelled_by_role := 'admin';
    ELSIF actor_is_professional_member THEN
      effective_cancelled_by_role := 'professional';
    ELSE
      effective_cancelled_by_role := 'client';
    END IF;
    effective_reason := NULLIF(trim(coalesce(new_cancellation_reason, '')), '');
  END IF;

  UPDATE public.appointments AS a
  SET
    status = new_status,
    cancellation_reason = CASE
      WHEN new_status = 'cancelled' THEN effective_reason
      ELSE a.cancellation_reason
    END,
    cancelled_by_role = CASE
      WHEN new_status = 'cancelled' THEN effective_cancelled_by_role
      ELSE a.cancelled_by_role
    END
  WHERE a.id = target_appointment_id;

  RETURN target_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_appointment_status(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
