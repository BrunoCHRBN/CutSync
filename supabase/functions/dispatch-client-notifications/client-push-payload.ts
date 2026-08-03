import {
  normalizeOpaquePushResourceId,
  pickStringPayload,
} from "../_shared/expo-push.ts";

export const CLIENT_APPOINTMENT_PUSH_EVENTS = [
  "appointment_received",
  "appointment_confirmed",
  "appointment_rescheduled",
  "appointment_cancelled",
  "appointment_reminder",
  "appointment_no_show",
  "establishment_client_link_requested",
] as const;

export const CLIENT_SUPPORT_PUSH_EVENTS = [
  "support_reply_received",
  "support_waiting_user",
  "support_resolved",
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => (
  typeof value === "string" && UUID_PATTERN.test(value.trim())
);

export const sanitizeClientAppointmentPushPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> | null => {
  const eventType = typeof payload.eventType === "string"
    ? payload.eventType.trim()
    : "";
  if (!CLIENT_APPOINTMENT_PUSH_EVENTS.includes(
    eventType as typeof CLIENT_APPOINTMENT_PUSH_EVENTS[number],
  )) return null;

  if (eventType === "establishment_client_link_requested") {
    if (!isUuid(payload.linkId) || !isUuid(payload.establishmentId)) return null;
    return pickStringPayload(payload, ["eventType", "linkId", "establishmentId"]);
  }

  if (!normalizeOpaquePushResourceId(payload.appointmentId)) return null;
  return pickStringPayload(payload, ["eventType", "appointmentId"]);
};

export const sanitizeClientSupportPushPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> | null => {
  const eventType = typeof payload.eventType === "string"
    ? payload.eventType.trim()
    : "";
  if (!CLIENT_SUPPORT_PUSH_EVENTS.includes(
    eventType as typeof CLIENT_SUPPORT_PUSH_EVENTS[number],
  ) || !isUuid(payload.ticketId)) return null;
  return pickStringPayload(payload, ["eventType", "ticketId"]);
};
