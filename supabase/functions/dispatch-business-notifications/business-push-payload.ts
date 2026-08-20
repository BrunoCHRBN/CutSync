import {
  normalizeOpaquePushResourceId,
  pickStringPayload,
} from "../_shared/expo-push.ts";

export const BUSINESS_PUSH_EVENTS = [
  "appointment_created",
  "appointment_cancelled",
  "appointment_rescheduled",
  "invitation_created",
  "operational_conflict",
  "appointment_reassignment_action_required",
  "appointment_reassignment_updated",
] as const;

export const BUSINESS_PUSH_CHANNEL_IDS = {
  operations: "operations",
  invitations: "invitations",
  conflicts: "conflicts",
  decisions: "decisions",
} as const;

type BusinessPushEvent = typeof BUSINESS_PUSH_EVENTS[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => (
  typeof value === "string" && UUID_PATTERN.test(value.trim())
);

export const sanitizeBusinessPushPayload = (
  payload: Record<string, unknown>,
): Record<string, unknown> | null => {
  const eventType = typeof payload.eventType === "string"
    ? payload.eventType.trim() as BusinessPushEvent
    : null;
  if (!eventType || !BUSINESS_PUSH_EVENTS.includes(eventType)) return null;
  if (!isUuid(payload.establishmentId)) return null;

  if (eventType === "invitation_created") {
    if (!isUuid(payload.invitationId)) return null;
    return pickStringPayload(payload, [
      "eventType",
      "establishmentId",
      "invitationId",
    ]);
  }

  if (eventType === "operational_conflict") {
    if (!isUuid(payload.professionalId)) return null;
    if (
      payload.appointmentId !== undefined
      && payload.appointmentId !== null
      && !normalizeOpaquePushResourceId(payload.appointmentId)
    ) return null;
    return pickStringPayload(payload, [
      "eventType",
      "establishmentId",
      "professionalId",
      "appointmentId",
    ]);
  }

  if (
    eventType === "appointment_reassignment_action_required"
    || eventType === "appointment_reassignment_updated"
  ) {
    if (!isUuid(payload.reassignmentRequestId)) return null;
    if (!normalizeOpaquePushResourceId(payload.appointmentId)) return null;
    if (!isUuid(payload.correlationId)) return null;
    return pickStringPayload(payload, [
      "eventType",
      "establishmentId",
      "appointmentId",
      "reassignmentRequestId",
      "correlationId",
    ]);
  }

  if (!normalizeOpaquePushResourceId(payload.appointmentId)) return null;
  return pickStringPayload(payload, [
    "eventType",
    "establishmentId",
    "appointmentId",
  ]);
};

export const getBusinessPushChannelId = (payload: Record<string, unknown>) => {
  if (payload.eventType === "invitation_created") {
    return BUSINESS_PUSH_CHANNEL_IDS.invitations;
  }
  if (payload.eventType === "operational_conflict") {
    return BUSINESS_PUSH_CHANNEL_IDS.conflicts;
  }
  if (
    payload.eventType === "appointment_reassignment_action_required"
    || payload.eventType === "appointment_reassignment_updated"
  ) {
    return BUSINESS_PUSH_CHANNEL_IDS.decisions;
  }
  return BUSINESS_PUSH_CHANNEL_IDS.operations;
};
