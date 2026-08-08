import { useCallback, useRef, useState } from 'react';
import { supabase } from '../../services/supabase';
import { translateAppointmentError } from '@cutsync/domain';
import { useToast } from '../../components/ui/toast-provider';

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

type UseAppointmentActionsOptions = {
  onChanged?: () => Promise<void> | void;
};

export function useAppointmentActions(options: UseAppointmentActionsOptions = {}) {
  const { pushToast } = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
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
    professionalId: string;
    rangeStart: Date;
    rangeEnd: Date;
    transfers: AbsenceTransferAction[];
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
      const successCount = (report.results || []).filter((item) => item.ok).length;
      const failCount = (report.results || []).filter((item) => !item.ok).length;
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

  return {
    loadingId,
    batchLoading,
    updateStatus,
    reschedule,
    runAbsenceMode,
  };
}
