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

export const resolveAppointmentOrderPrimaryAction = (input: {
  financialOpsEnabled: boolean;
  accessMode: 'full' | 'read_only' | 'blocked' | string;
  canManageOrder: boolean;
  appointmentStatus: AppointmentUiStatus | string | null | undefined;
  serviceOrderStatus: ServiceOrderUiStatus | string | null | undefined;
}): AppointmentOrderPrimaryAction => {
  if (!input.financialOpsEnabled) return 'none';
  if (input.accessMode !== 'full') return 'none';
  if (!input.canManageOrder) return 'none';

  if (!input.serviceOrderStatus) {
    if (input.appointmentStatus === 'confirmed') return 'open_order';
    return 'none';
  }

  if (input.serviceOrderStatus === 'open') return 'start_order';
  if (input.serviceOrderStatus === 'in_service') return 'finish_order';
  return 'none';
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
  'Atendimento finalizado. A resolução do pagamento será habilitada em uma próxima etapa.';
