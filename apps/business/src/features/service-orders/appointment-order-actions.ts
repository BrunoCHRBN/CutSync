import type {
  BusinessCapability,
  BusinessOperationalContext,
  ServiceOrderStatus,
} from '@cutsync/database';
import {
  appointmentIsLockedByServiceOrder,
  getAppointmentOrderActionLabel,
  resolveAppointmentOrderPrimaryAction,
  type AppointmentOrderPrimaryAction,
} from '@cutsync/domain';

const hasCapability = (
  context: BusinessOperationalContext | null | undefined,
  capability: BusinessCapability,
): boolean => Boolean(context?.capabilities.includes(capability));

export const canManageAppointmentOrder = ({
  context,
  appointmentProfessionalId,
  actorUserId,
}: {
  context: BusinessOperationalContext | null | undefined;
  appointmentProfessionalId: string | null | undefined;
  actorUserId: string | null | undefined;
}): boolean => {
  if (!context || !actorUserId) return false;
  if (hasCapability(context, 'manage_team_orders')) return true;
  return hasCapability(context, 'manage_own_orders')
    && Boolean(appointmentProfessionalId)
    && appointmentProfessionalId === actorUserId;
};

export const resolveBusinessAppointmentOrderAction = ({
  context,
  appointmentStatus,
  serviceOrderStatus,
  appointmentProfessionalId,
  actorUserId,
}: {
  context: BusinessOperationalContext | null | undefined;
  appointmentStatus: string | null | undefined;
  serviceOrderStatus: ServiceOrderStatus | null | undefined;
  appointmentProfessionalId: string | null | undefined;
  actorUserId: string | null | undefined;
}): AppointmentOrderPrimaryAction => resolveAppointmentOrderPrimaryAction({
  financialOpsEnabled: Boolean(context?.financialOpsEnabled),
  accessMode: context?.accessMode ?? 'blocked',
  canManageOrder: canManageAppointmentOrder({
    context,
    appointmentProfessionalId,
    actorUserId,
  }),
  appointmentStatus,
  serviceOrderStatus,
});

export const getBusinessOrderActionLabel = getAppointmentOrderActionLabel;

export const isAppointmentLockedByOrder = ({
  financialOpsEnabled,
  serviceOrderStatus,
}: {
  financialOpsEnabled: boolean;
  serviceOrderStatus: ServiceOrderStatus | string | null | undefined;
}): boolean => appointmentIsLockedByServiceOrder({
  financialOpsEnabled,
  serviceOrderStatus,
});
