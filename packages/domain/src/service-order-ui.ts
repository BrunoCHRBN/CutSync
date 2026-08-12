/**
 * Presentation helpers for appointment ↔ service_order integration (P0 Etapa 4).
 * Authorization remains server-side; these helpers only drive UI affordances.
 */

export type AppointmentOrderPrimaryAction =
  | 'open_order'
  | 'start_order'
  | 'finish_order'
  | 'none';

export type ServiceOrderUiStatus =
  | 'open'
  | 'in_service'
  | 'awaiting_payment'
  | 'closed'
  | 'voided';

export type AppointmentUiStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed'
  | 'no_show';

const localDateKey = (value: Date, timeZone: string): string => new Intl.DateTimeFormat(
  'en-CA',
  { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' },
).format(value);

export const appointmentIsOperationalToday = (input: {
  appointmentStartsAt: Date | string | null | undefined;
  timeZone: string | null | undefined;
  now?: Date;
}): boolean => {
  if (!input.appointmentStartsAt || !input.timeZone) return false;
  const startsAt = input.appointmentStartsAt instanceof Date
    ? input.appointmentStartsAt
    : new Date(input.appointmentStartsAt);
  if (!Number.isFinite(startsAt.getTime())) return false;
  try {
    return localDateKey(startsAt, input.timeZone)
      <= localDateKey(input.now ?? new Date(), input.timeZone);
  } catch {
    return false;
  }
};

export const resolveAppointmentOrderPrimaryAction = (input: {
  financialOpsEnabled: boolean;
  accessMode: 'full' | 'read_only' | 'blocked' | string;
  canManageOrder: boolean;
  appointmentStatus: AppointmentUiStatus | string | null | undefined;
  serviceOrderStatus: ServiceOrderUiStatus | string | null | undefined;
  appointmentStartsAt?: Date | string | null;
  timeZone?: string | null;
  now?: Date;
}): AppointmentOrderPrimaryAction => {
  if (!input.financialOpsEnabled) return 'none';
  if (input.accessMode !== 'full') return 'none';
  if (!input.canManageOrder) return 'none';
  if (input.appointmentStartsAt && !appointmentIsOperationalToday({
    appointmentStartsAt: input.appointmentStartsAt,
    timeZone: input.timeZone,
    now: input.now,
  })) return 'none';

  if (!input.serviceOrderStatus) {
    if (input.appointmentStatus === 'confirmed') return 'open_order';
    return 'none';
  }

  if (input.serviceOrderStatus === 'open') return 'start_order';
  if (input.serviceOrderStatus === 'in_service') return 'finish_order';
  return 'none';
};

export const getAppointmentOrderUnavailableMessage = (input: {
  financialOpsEnabled: boolean;
  accessMode: 'full' | 'read_only' | 'blocked' | string;
  canManageOrder: boolean;
  appointmentStatus: AppointmentUiStatus | string | null | undefined;
  serviceOrderStatus: ServiceOrderUiStatus | string | null | undefined;
  appointmentStartsAt?: Date | string | null;
  timeZone?: string | null;
  now?: Date;
}): string | null => {
  if (!input.financialOpsEnabled) return null;
  if (input.accessMode !== 'full') {
    return 'A comanda está disponível apenas em um contexto operacional com escrita liberada.';
  }
  if (!input.canManageOrder) {
    return 'Seu acesso permite consultar este atendimento, mas não operar a comanda.';
  }
  if (input.appointmentStartsAt && !input.timeZone) {
    return 'Aguarde a sincronização do fuso horário da unidade para operar a comanda.';
  }
  if (input.appointmentStartsAt && !appointmentIsOperationalToday({
    appointmentStartsAt: input.appointmentStartsAt,
    timeZone: input.timeZone,
    now: input.now,
  })) {
    return 'O check-in será liberado no dia do atendimento, conforme o fuso horário da unidade.';
  }
  if (!input.serviceOrderStatus && input.appointmentStatus !== 'confirmed') {
    return 'Confirme o agendamento antes de fazer o check-in.';
  }
  return null;
};

export const appointmentIsLockedByServiceOrder = (input: {
  financialOpsEnabled: boolean;
  serviceOrderStatus: ServiceOrderUiStatus | string | null | undefined;
}): boolean => (
  Boolean(input.financialOpsEnabled && input.serviceOrderStatus)
);

export const getServiceOrderStatusLabel = (
  status: ServiceOrderUiStatus | string | null | undefined,
): string => {
  switch (status) {
    case 'open':
      return 'Comanda aberta';
    case 'in_service':
      return 'Em atendimento';
    case 'awaiting_payment':
      return 'Aguardando pagamento';
    case 'closed':
      return 'Comanda encerrada';
    case 'voided':
      return 'Comanda anulada';
    default:
      return 'Comanda ainda não aberta';
  }
};

export const getAppointmentOrderActionLabel = (
  action: AppointmentOrderPrimaryAction,
): string | null => {
  switch (action) {
    case 'open_order':
      return 'Fazer check-in';
    case 'start_order':
      return 'Iniciar atendimento';
    case 'finish_order':
      return 'Finalizar atendimento';
    default:
      return null;
  }
};

/** Copy for awaiting_payment — never imply payment settled. */
export const AWAITING_PAYMENT_NOTICE =
  'Atendimento finalizado. Registre os recebimentos separadamente e feche a comanda somente após saldo zero.';
