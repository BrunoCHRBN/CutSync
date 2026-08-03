export const MAX_OPAQUE_APPOINTMENT_ID_LENGTH = 160;

const FORBIDDEN_APPOINTMENT_ID_CHARACTERS = /[\/\\%?#\u0000-\u001f\u007f]/u;

export const normalizeOpaqueAppointmentId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > MAX_OPAQUE_APPOINTMENT_ID_LENGTH) return null;
  if (value !== value.trim() || value === '.' || value === '..') return null;
  if (FORBIDDEN_APPOINTMENT_ID_CHARACTERS.test(value)) return null;
  return value;
};

export const encodeOpaqueAppointmentIdPathSegment = (value: unknown): string | null => {
  const appointmentId = normalizeOpaqueAppointmentId(value);
  return appointmentId ? encodeURIComponent(appointmentId) : null;
};

export const decodeOpaqueAppointmentIdPathSegment = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return normalizeOpaqueAppointmentId(decodeURIComponent(value));
  } catch {
    return null;
  }
};
