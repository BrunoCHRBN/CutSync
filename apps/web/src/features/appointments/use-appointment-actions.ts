import { useCallback, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { createMobileRequestId, translateAppointmentError } from '@cutsync/domain';
import type {
  AppointmentReassignmentStatus,
  BusinessReassignmentCandidate,
} from '@cutsync/database';
import { useToast } from '../../components/ui/toast-provider';
import { webReassignmentApi, WebReassignmentError } from './reassignment-api';

export type AbsenceTransferAction =
  | { appointment_id: string; action: 'keep' }
  | { appointment_id: string; action: 'cancel'; cancellation_note?: string };

export type AbsenceTransferResult = {
  appointment_id: string;
  ok: boolean;
  action: string;
  error: string | null;
};

export type AbsenceBatchReport = {
  results: AbsenceTransferResult[];
  schedule_block_id: string | null;
  schedule_block_error: string | null;
};

export type WebReassignmentPreparation = {
  reassignmentRequestId: string;
  appointmentId: string;
  status: AppointmentReassignmentStatus;
  version: number;
  correlationId: string;
  candidates: BusinessReassignmentCandidate[];
  proposalAllowed: boolean;
};

type UseAppointmentActionsOptions = {
  onChanged?: () => Promise<void> | void;
};

type ReassignmentRequestIntentInput = {
  appointmentId: string;
  reasonCode: string;
  responsibility: string;
  startsAt: string;
  expectedAppointmentUpdatedAt: string;
};

type ReassignmentRequestIntent = {
  requestId: string;
  correlationId: string;
  dueAt: string;
};

const getReassignmentRequestIntentKey = (input: ReassignmentRequestIntentInput) => JSON.stringify([
  input.appointmentId,
  input.reasonCode,
  input.responsibility,
  input.startsAt,
  input.expectedAppointmentUpdatedAt,
]);

export function useAppointmentActions(options: UseAppointmentActionsOptions = {}) {
  const { pushToast } = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [reassignmentLoadingId, setReassignmentLoadingId] = useState<string | null>(null);
  const requestIntentsRef = useRef(new Map<string, ReassignmentRequestIntent>());
  const validationRequestIdsRef = useRef(new Map<string, string>());
  const proposalRequestIdsRef = useRef(new Map<string, string>());
  const onChangedRef = useRef(options.onChanged);
  onChangedRef.current = options.onChanged;

  const updateStatus = useCallback(async (
    id: string,
    status: 'confirmed' | 'completed' | 'cancelled',
    reason?: string,
  ) => {
    setLoadingId(id);
    try {
      const rpcParams: {
        target_appointment_id: string;
        new_status: string;
        new_cancellation_note_internal?: string;
      } = {
        target_appointment_id: id,
        new_status: status,
      };
      if (status === 'cancelled') {
        rpcParams.new_cancellation_note_internal = reason || 'Cancelado pela equipe';
      }
      const { error } = await supabase.rpc('update_appointment_status_v2', rpcParams);
      if (error) throw error;
      pushToast({
        tone: 'success',
        title: status === 'cancelled' ? 'Atendimento cancelado' : 'Status atualizado',
      });
      await onChangedRef.current?.();
      return true;
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Falha ao atualizar',
        message: translateAppointmentError(err, 'Não foi possível atualizar este atendimento.'),
      });
      return false;
    } finally {
      setLoadingId(null);
    }
  }, [pushToast]);

  const reschedule = useCallback(async (input: {
    appointmentId: string;
    dateTime: Date;
    professionalId: string;
    serviceId: string;
    successTitle?: string;
  }) => {
    setLoadingId(input.appointmentId);
    try {
      const { error } = await supabase.rpc('reschedule_appointment', {
        target_appointment_id: input.appointmentId,
        requested_date_time: input.dateTime.toISOString(),
        requested_professional_id: input.professionalId,
        requested_service_id: input.serviceId,
      });
      if (error) throw error;
      pushToast({
        tone: 'success',
        title: input.successTitle || 'Atendimento reagendado',
      });
      await onChangedRef.current?.();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushToast({
        tone: 'danger',
        title: 'Falha ao reagendar',
        message: message.includes('appointment_conflict')
          ? 'Esse horário conflita com outro atendimento.'
          : translateAppointmentError(err, 'Não foi possível reagendar este atendimento.'),
      });
      return false;
    } finally {
      setLoadingId(null);
    }
  }, [pushToast]);

  const runAbsenceMode = useCallback(async (input: {
    establishmentId: string;
    professionalId: string;
    rangeStart: Date;
    rangeEnd: Date;
    transfers: AbsenceTransferAction[];
    reassignmentAppointments: {
      appointmentId: string;
      expectedUpdatedAt: string;
      startsAt: Date;
    }[];
  }): Promise<AbsenceBatchReport | null> => {
    setBatchLoading(true);
    try {
      const { data, error } = await supabase.rpc('transfer_professional_absence', {
        target_professional_id: input.professionalId,
        range_start: input.rangeStart.toISOString(),
        range_end: input.rangeEnd.toISOString(),
        transfers: input.transfers,
      });
      if (error) throw error;
      const report = data as AbsenceBatchReport;
      report.results = report.results ?? [];
      const queue = input.reassignmentAppointments.length > 0
        ? await webReassignmentApi.listQueue(input.establishmentId)
        : [];
      for (const appointment of input.reassignmentAppointments) {
        const existing = queue.find((item) => item.appointmentId === appointment.appointmentId);
        if (existing) {
          report.results.push({
            appointment_id: appointment.appointmentId,
            ok: true,
            action: 'request_reassignment',
            error: null,
          });
          continue;
        }
        const requestIntentInput = {
          appointmentId: appointment.appointmentId,
          reasonCode: 'professional_absence',
          responsibility: 'professional',
          startsAt: appointment.startsAt.toISOString(),
          expectedAppointmentUpdatedAt: appointment.expectedUpdatedAt,
        } as const;
        const intentKey = getReassignmentRequestIntentKey(requestIntentInput);
        const intent = requestIntentsRef.current.get(intentKey) ?? {
          requestId: createMobileRequestId(),
          correlationId: createMobileRequestId(),
          dueAt: getReassignmentDueAt(appointment.startsAt),
        };
        requestIntentsRef.current.set(intentKey, intent);
        try {
          await webReassignmentApi.request({
            appointmentId: requestIntentInput.appointmentId,
            reasonCode: requestIntentInput.reasonCode,
            responsibility: requestIntentInput.responsibility,
            expectedAppointmentUpdatedAt: requestIntentInput.expectedAppointmentUpdatedAt,
            ...intent,
          });
          requestIntentsRef.current.delete(intentKey);
          report.results.push({
            appointment_id: appointment.appointmentId,
            ok: true,
            action: 'request_reassignment',
            error: null,
          });
        } catch (requestError) {
          if (!(requestError instanceof WebReassignmentError)
            || requestError.code !== 'network_error') {
            requestIntentsRef.current.delete(intentKey);
          }
          report.results.push({
            appointment_id: appointment.appointmentId,
            ok: false,
            action: 'request_reassignment',
            error: requestError instanceof Error ? requestError.message : 'Falha ao criar solicitação',
          });
        }
      }
      const successCount = report.results.filter((item) => item.ok).length;
      const failCount = report.results.filter((item) => !item.ok).length;
      pushToast({
        tone: failCount > 0 ? 'warning' : 'success',
        title: 'Modo ausência concluído',
        message: `${successCount} ok · ${failCount} com falha${report.schedule_block_id ? ' · período bloqueado' : ''}`,
      });
      await onChangedRef.current?.();
      return report;
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Falha no modo ausência',
        message: translateAppointmentError(err, 'Não foi possível processar a ausência.'),
      });
      return null;
    } finally {
      setBatchLoading(false);
    }
  }, [pushToast]);

  const prepareReassignment = useCallback(async (input: {
    establishmentId: string;
    appointmentId: string;
    expectedUpdatedAt: string;
    startsAt: Date;
    responsibility: 'professional' | 'manager' | 'admin' | 'owner' | 'reception';
    reasonCode?: string;
    canPropose: boolean;
  }): Promise<WebReassignmentPreparation | null> => {
    setReassignmentLoadingId(input.appointmentId);
    const requestIntentInput = {
      appointmentId: input.appointmentId,
      reasonCode: input.reasonCode ?? 'schedule_adjustment',
      responsibility: input.responsibility,
      startsAt: input.startsAt.toISOString(),
      expectedAppointmentUpdatedAt: input.expectedUpdatedAt,
    };
    const intentKey = getReassignmentRequestIntentKey(requestIntentInput);
    try {
      const queue = await webReassignmentApi.listQueue(input.establishmentId);
      const existing = queue.find((item) => item.appointmentId === input.appointmentId);
      let cursor = existing ? {
        reassignmentRequestId: existing.reassignmentRequestId,
        appointmentId: existing.appointmentId,
        status: existing.status,
        version: existing.version,
        correlationId: existing.correlationId,
      } : null;

      if (!cursor) {
        const intent = requestIntentsRef.current.get(intentKey) ?? {
          requestId: createMobileRequestId(),
          correlationId: createMobileRequestId(),
          dueAt: getReassignmentDueAt(input.startsAt),
        };
        requestIntentsRef.current.set(intentKey, intent);
        const receipt = await webReassignmentApi.request({
          appointmentId: requestIntentInput.appointmentId,
          reasonCode: requestIntentInput.reasonCode,
          responsibility: requestIntentInput.responsibility,
          expectedAppointmentUpdatedAt: requestIntentInput.expectedAppointmentUpdatedAt,
          ...intent,
        });
        requestIntentsRef.current.delete(intentKey);
        cursor = {
          reassignmentRequestId: receipt.reassignmentRequestId,
          appointmentId: input.appointmentId,
          status: receipt.status,
          version: receipt.version,
          correlationId: receipt.correlationId,
        };
      }

      if (cursor.status === 'requested' || cursor.status === 'validating') {
        const validationId = validationRequestIdsRef.current.get(cursor.reassignmentRequestId)
          ?? createMobileRequestId();
        validationRequestIdsRef.current.set(cursor.reassignmentRequestId, validationId);
        const receipt = await webReassignmentApi.validate({
          reassignmentRequestId: cursor.reassignmentRequestId,
          expectedVersion: cursor.version,
          requestId: validationId,
        });
        validationRequestIdsRef.current.delete(cursor.reassignmentRequestId);
        cursor = { ...cursor, status: receipt.status, version: receipt.version };
      }

      const candidates = cursor.status === 'awaiting_manager' && input.canPropose
        ? await webReassignmentApi.listCandidates(
          input.establishmentId,
          cursor.reassignmentRequestId,
        )
        : [];
      return { ...cursor, candidates, proposalAllowed: input.canPropose };
    } catch (error) {
      if (!(error instanceof WebReassignmentError) || error.code !== 'network_error') {
        requestIntentsRef.current.delete(intentKey);
      }
      pushToast({
        tone: error instanceof WebReassignmentError && error.code === 'network_error'
          ? 'warning' : 'danger',
        title: 'Proposta não preparada',
        message: error instanceof Error ? error.message : 'Não foi possível preparar a solicitação.',
      });
      return null;
    } finally {
      setReassignmentLoadingId(null);
    }
  }, [pushToast]);

  const proposeReassignment = useCallback(async (input: {
    preparation: WebReassignmentPreparation;
    professionalId: string;
  }) => {
    const key = `${input.preparation.reassignmentRequestId}:${input.professionalId}`;
    const requestId = proposalRequestIdsRef.current.get(key) ?? createMobileRequestId();
    proposalRequestIdsRef.current.set(key, requestId);
    setReassignmentLoadingId(input.preparation.appointmentId);
    try {
      const receipt = await webReassignmentApi.propose({
        reassignmentRequestId: input.preparation.reassignmentRequestId,
        professionalId: input.professionalId,
        expectedVersion: input.preparation.version,
        requestId,
      });
      proposalRequestIdsRef.current.delete(key);
      pushToast({
        tone: 'success',
        title: 'Proposta registrada',
        message: receipt.customerDecisionRequired
          ? 'Aguardando a decisão do cliente. O profissional ainda não foi alterado.'
          : 'A proposta está pronta para aplicação autorizada. O profissional ainda não foi alterado.',
      });
      await onChangedRef.current?.();
      return receipt;
    } catch (error) {
      if (!(error instanceof WebReassignmentError) || error.code !== 'network_error') {
        proposalRequestIdsRef.current.delete(key);
      }
      pushToast({
        tone: error instanceof WebReassignmentError && error.code === 'network_error'
          ? 'warning' : 'danger',
        title: 'Proposta não confirmada',
        message: error instanceof Error ? error.message : 'Não foi possível registrar a proposta.',
      });
      return null;
    } finally {
      setReassignmentLoadingId(null);
    }
  }, [pushToast]);

  return {
    loadingId,
    batchLoading,
    reassignmentLoadingId,
    updateStatus,
    reschedule,
    runAbsenceMode,
    prepareReassignment,
    proposeReassignment,
  };
}

const getReassignmentDueAt = (startsAt: Date) => {
  const now = Date.now();
  const remaining = startsAt.getTime() - now;
  if (remaining <= 1_000) return new Date(now + 500).toISOString();
  return new Date(now + Math.min(12 * 60 * 60 * 1_000, Math.max(1_000, remaining / 2))).toISOString();
};
