export const clientCancellationReasons = [
  'Imprevisto de trabalho',
  'Questões de saúde',
  'Problema de transporte',
  'Vou reagendar',
  'Outro',
] as const;

export type ClientCancellationReason = (typeof clientCancellationReasons)[number];
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
