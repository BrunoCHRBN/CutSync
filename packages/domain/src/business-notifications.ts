export const BUSINESS_NOTIFICATION_EVENTS = [
  'appointment_created',
  'appointment_cancelled',
  'appointment_rescheduled',
  'invitation_created',
  'operational_conflict',
  'appointment_reassignment_action_required',
  'appointment_reassignment_updated',
] as const;

export type BusinessNotificationEvent = typeof BUSINESS_NOTIFICATION_EVENTS[number];

export type BusinessNotificationRoute = {
  pathname: '/(app)/appointments/[appointmentId]';
  params: { appointmentId: string };
  targetEstablishmentId: string;
} | {
  pathname: '/(app)/decisions/[requestId]';
  params: { requestId: string };
  targetEstablishmentId: string;
} | {
  pathname: '/establishments';
  targetEstablishmentId: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_RESOURCE_ID_CHARACTERS = /[\/\\%?#\u0000-\u001f\u007f]/u;

const uuidFrom = (value: unknown) => (
  typeof value === 'string' && UUID_PATTERN.test(value.trim()) ? value.trim() : null
);

const opaqueIdFrom = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > 160 || normalized === '.' || normalized === '..') return null;
  if (FORBIDDEN_RESOURCE_ID_CHARACTERS.test(normalized)) return null;
  return normalized;
};

export const getBusinessNotificationRoute = (
  payload: Record<string, unknown> | null | undefined,
): BusinessNotificationRoute | null => {
  if (!payload) return null;
  const eventType = typeof payload.eventType === 'string'
    ? payload.eventType.trim() as BusinessNotificationEvent
    : null;
  const establishmentId = uuidFrom(payload.establishmentId);
  if (!eventType || !BUSINESS_NOTIFICATION_EVENTS.includes(eventType) || !establishmentId) return null;

  if (
    eventType === 'appointment_reassignment_action_required'
    || eventType === 'appointment_reassignment_updated'
  ) {
    const requestId = uuidFrom(payload.reassignmentRequestId);
    if (!requestId) return null;
    return {
      pathname: '/(app)/decisions/[requestId]',
      params: { requestId },
      targetEstablishmentId: establishmentId,
    };
  }

  if (eventType === 'invitation_created') {
    if (!uuidFrom(payload.invitationId)) return null;
    return { pathname: '/establishments', targetEstablishmentId: establishmentId };
  }

  const appointmentId = opaqueIdFrom(payload.appointmentId);
  if (!appointmentId) {
    return eventType === 'operational_conflict'
      ? { pathname: '/establishments', targetEstablishmentId: establishmentId }
      : null;
  }
  return {
    pathname: '/(app)/appointments/[appointmentId]',
    params: { appointmentId },
    targetEstablishmentId: establishmentId,
  };
};
