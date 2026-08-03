export const cancellationReasonLabels = {
  client_work_conflict: 'Imprevisto de trabalho',
  client_health: 'Questões de saúde',
  client_transport: 'Problema de transporte',
  client_reschedule: 'Vou reagendar',
  client_other: 'Outro',
  establishment_cancelled: 'Cancelado pelo estabelecimento',
  professional_cancelled: 'Cancelado pelo profissional',
} as const;

export type CancellationReasonCode = keyof typeof cancellationReasonLabels;

export const clientCancellationReasonCodes = [
  'client_work_conflict',
  'client_health',
  'client_transport',
  'client_reschedule',
  'client_other',
] as const satisfies readonly CancellationReasonCode[];

export type ClientCancellationReasonCode = (typeof clientCancellationReasonCodes)[number];

export const clientCancellationReasonOptions = clientCancellationReasonCodes.map((code) => ({
  code,
  label: cancellationReasonLabels[code],
}));

export const clientCancellationReasons = [
  'Imprevisto de trabalho',
  'Questões de saúde',
  'Problema de transporte',
  'Vou reagendar',
  'Outro',
] as const;

export type ClientCancellationReason = (typeof clientCancellationReasons)[number];

const legacyCancellationReasonCodes: Record<string, CancellationReasonCode> = {
  'Imprevisto de trabalho': 'client_work_conflict',
  'Questões de saúde': 'client_health',
  'Problema de transporte': 'client_transport',
  'Vou reagendar': 'client_reschedule',
  Outro: 'client_other',
};

export const clientCancellationReasonCodeFromLabel = (
  label: string,
): ClientCancellationReasonCode => legacyCancellationReasonCodes[label] as ClientCancellationReasonCode
  ?? 'client_other';

export const getPublicCancellationReasonCode = (
  code?: string | null,
  legacyReason?: string | null,
  cancelledByRole?: string | null,
): CancellationReasonCode => {
  if (code && code in cancellationReasonLabels) return code as CancellationReasonCode;
  if (legacyReason && legacyCancellationReasonCodes[legacyReason]) return legacyCancellationReasonCodes[legacyReason];
  if (cancelledByRole === 'professional') return 'professional_cancelled';
  return 'establishment_cancelled';
};

export const getPublicCancellationReasonLabel = (
  code?: string | null,
  legacyReason?: string | null,
  cancelledByRole?: string | null,
) => cancellationReasonLabels[getPublicCancellationReasonCode(code, legacyReason, cancelledByRole)];
export type ClientAppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';
export type ClientAppointmentBlockReason =
  | 'appointment_status_immutable'
  | 'appointment_already_started'
  | 'cancellation_window_closed'
  | 'reschedule_limit_reached'
  | 'establishment_unavailable';

export interface ClientAppointmentTimelineItem {
  startsAt: string;
  status: ClientAppointmentStatus;
}

export const partitionClientAppointments = <T extends ClientAppointmentTimelineItem>(
  appointments: T[],
  now = new Date(),
) => {
  const reference = now.getTime();
  const upcoming = appointments
    .filter((item) => (
      (item.status === 'pending' || item.status === 'confirmed')
      && new Date(item.startsAt).getTime() >= reference
    ))
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  const history = appointments
    .filter((item) => !upcoming.includes(item))
    .sort((left, right) => new Date(right.startsAt).getTime() - new Date(left.startsAt).getTime());

  return { upcoming, history };
};

export const clientAppointmentStatusLabels: Record<ClientAppointmentStatus, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  completed: 'Concluído',
};

export const getClientAppointmentBlockMessage = (
  reason: string | null,
  minCancellationHours: number,
) => {
  if (reason === 'cancellation_window_closed') {
    return `Alterações pelo aplicativo encerram ${minCancellationHours}h antes do atendimento.`;
  }
  if (reason === 'reschedule_limit_reached') return 'Este atendimento já atingiu o limite de dois reagendamentos.';
  if (reason === 'establishment_unavailable') return 'Este estabelecimento não está disponível para reagendamentos.';
  if (reason === 'appointment_already_started') return 'Este atendimento já começou ou está no passado.';
  if (reason === 'appointment_status_immutable') return 'Atendimentos concluídos ou cancelados não podem ser alterados.';
  return null;
};

export const formatClientAppointmentDateTime = (startsAt: string, timezone: string) => {
  const value = new Date(startsAt);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(value);
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(value);

  return { dateLabel, timeLabel };
};
