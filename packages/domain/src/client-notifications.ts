import { normalizeOpaqueAppointmentId } from './appointment-id';

export const CLIENT_APPOINTMENT_NOTIFICATION_EVENTS = [
  'appointment_received',
  'appointment_confirmed',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_no_show',
  'appointment_reminder',
] as const;

export type ClientAppointmentNotificationEvent =
  typeof CLIENT_APPOINTMENT_NOTIFICATION_EVENTS[number];

export interface ClientAppointmentNotificationRoute {
  pathname: '/appointments/[id]';
  params: { id: string };
}

export const CLIENT_SUPPORT_NOTIFICATION_EVENTS = [
  'support_reply_received',
  'support_waiting_user',
  'support_resolved',
] as const;

export type ClientSupportNotificationEvent =
  typeof CLIENT_SUPPORT_NOTIFICATION_EVENTS[number];

export interface ClientSupportNotificationRoute {
  pathname: '/support/[id]';
  params: { id: string };
}

export interface ClientEstablishmentLinkNotificationRoute {
  pathname: '/establishment-links';
}

export type ClientNotificationRoute =
  | ClientAppointmentNotificationRoute
  | ClientSupportNotificationRoute
  | ClientEstablishmentLinkNotificationRoute;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ticketIdPattern = uuidPattern;

export const getClientAppointmentNotificationRoute = (
  payload: Record<string, unknown> | null | undefined,
): ClientAppointmentNotificationRoute | null => {
  if (!payload) return null;

  const appointmentId = normalizeOpaqueAppointmentId(payload.appointmentId);
  const eventType = typeof payload.eventType === 'string'
    ? payload.eventType.trim()
    : '';

  if (!appointmentId) return null;
  if (!CLIENT_APPOINTMENT_NOTIFICATION_EVENTS.includes(
    eventType as ClientAppointmentNotificationEvent,
  )) return null;

  return {
    pathname: '/appointments/[id]',
    params: { id: appointmentId },
  };
};

export const getClientSupportNotificationRoute = (
  payload: Record<string, unknown> | null | undefined,
): ClientSupportNotificationRoute | null => {
  if (!payload) return null;

  const ticketId = typeof payload.ticketId === 'string'
    ? payload.ticketId.trim()
    : '';
  const eventType = typeof payload.eventType === 'string'
    ? payload.eventType.trim()
    : '';

  if (!ticketIdPattern.test(ticketId)) return null;
  if (!CLIENT_SUPPORT_NOTIFICATION_EVENTS.includes(
    eventType as ClientSupportNotificationEvent,
  )) return null;

  return {
    pathname: '/support/[id]',
    params: { id: ticketId },
  };
};

export const getClientEstablishmentLinkNotificationRoute = (
  payload: Record<string, unknown> | null | undefined,
): ClientEstablishmentLinkNotificationRoute | null => {
  if (!payload || payload.eventType !== 'establishment_client_link_requested') return null;
  const linkId = typeof payload.linkId === 'string' ? payload.linkId.trim() : '';
  const establishmentId = typeof payload.establishmentId === 'string'
    ? payload.establishmentId.trim()
    : '';
  if (!uuidPattern.test(linkId) || !uuidPattern.test(establishmentId)) return null;
  return { pathname: '/establishment-links' };
};

export const getClientNotificationRoute = (
  payload: Record<string, unknown> | null | undefined,
): ClientNotificationRoute | null => (
  getClientAppointmentNotificationRoute(payload)
  ?? getClientSupportNotificationRoute(payload)
  ?? getClientEstablishmentLinkNotificationRoute(payload)
);
