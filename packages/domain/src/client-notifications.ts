export const CLIENT_APPOINTMENT_NOTIFICATION_EVENTS = [
  'appointment_received',
  'appointment_confirmed',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_reminder',
] as const;

export type ClientAppointmentNotificationEvent =
  typeof CLIENT_APPOINTMENT_NOTIFICATION_EVENTS[number];

export interface ClientAppointmentNotificationRoute {
  pathname: '/appointments/[id]';
  params: { id: string };
}

const appointmentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getClientAppointmentNotificationRoute = (
  payload: Record<string, unknown> | null | undefined,
): ClientAppointmentNotificationRoute | null => {
  if (!payload) return null;

  const appointmentId = typeof payload.appointmentId === 'string'
    ? payload.appointmentId.trim()
    : '';
  const eventType = typeof payload.eventType === 'string'
    ? payload.eventType.trim()
    : '';

  if (!appointmentIdPattern.test(appointmentId)) return null;
  if (!CLIENT_APPOINTMENT_NOTIFICATION_EVENTS.includes(
    eventType as ClientAppointmentNotificationEvent,
  )) return null;

  return {
    pathname: '/appointments/[id]',
    params: { id: appointmentId },
  };
};
