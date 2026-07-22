import { getForbiddenInputMessage, isSafeFilledInput } from './safe-input';

export const CLIENT_NOTIFICATION_CHANNELS = ['email', 'whatsapp', 'push'] as const;
export type ClientNotificationChannel = typeof CLIENT_NOTIFICATION_CHANNELS[number];

export const CLIENT_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const CLIENT_AVATAR_MAX_BYTES = 5 * 1024 * 1024;

type ClientProfileValidationResult =
  | { ok: true; name: string; phone: string | null }
  | { ok: false; field: 'name' | 'phone'; message: string };

type ClientPreferencesValidationResult =
  | { ok: true; channels: ClientNotificationChannel[]; marketingAccepted: boolean }
  | { ok: false; message: string };

export const normalizeClientName = (value: string) => value.trim();

export const normalizeClientPhone = (value: string) => value.trim();

export const normalizeClientPhoneDigits = (value: string) => normalizeClientPhone(value).replace(/\D/g, '');

export const isValidClientName = (value: string) => {
  const normalized = normalizeClientName(value);
  return normalized.length >= 2 && normalized.length <= 80 && isSafeFilledInput(normalized);
};

export const isValidClientPhone = (value: string) => {
  const normalized = normalizeClientPhone(value);
  const digits = normalizeClientPhoneDigits(normalized);
  return isSafeFilledInput(normalized) && (digits.length === 0 || (digits.length >= 10 && digits.length <= 13));
};

export const formatClientPhone = (value: string | null | undefined) => {
  const digits = normalizeClientPhoneDigits(value ?? '').slice(0, 13);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return `+${digits.slice(0, digits.length - 11)} (${digits.slice(-11, -9)}) ${digits.slice(-9, -4)}-${digits.slice(-4)}`;
};

export const validateClientProfile = (name: string, phone: string): ClientProfileValidationResult => {
  const normalizedName = normalizeClientName(name);
  const normalizedPhone = normalizeClientPhone(phone);
  const unsafeName = getForbiddenInputMessage(normalizedName);
  if (unsafeName) return { ok: false, field: 'name', message: unsafeName };
  if (!isValidClientName(normalizedName)) {
    return { ok: false, field: 'name', message: 'Informe um nome entre 2 e 80 caracteres.' };
  }

  const unsafePhone = getForbiddenInputMessage(normalizedPhone);
  if (unsafePhone) return { ok: false, field: 'phone', message: unsafePhone };
  if (!isValidClientPhone(normalizedPhone)) {
    return { ok: false, field: 'phone', message: 'Informe um telefone válido com DDD.' };
  }

  const digits = normalizeClientPhoneDigits(normalizedPhone);
  return { ok: true, name: normalizedName, phone: digits || null };
};

export const validateClientPreferences = (
  channels: readonly string[],
  marketingAccepted: boolean,
): ClientPreferencesValidationResult => {
  if (channels.some((channel) => !CLIENT_NOTIFICATION_CHANNELS.includes(channel as ClientNotificationChannel))) {
    return { ok: false, message: 'Uma preferência de comunicação não é válida.' };
  }

  const normalized = CLIENT_NOTIFICATION_CHANNELS.filter((channel) => channels.includes(channel));
  return { ok: true, channels: normalized, marketingAccepted };
};

export const getClientAvatarValidationMessage = ({
  fileName,
  fileSize,
  mimeType,
}: {
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
}) => {
  const normalizedMime = mimeType?.trim().toLowerCase() ?? '';
  const normalizedName = fileName?.trim().toLowerCase() ?? '';
  if (normalizedMime.includes('svg') || normalizedName.endsWith('.svg') || normalizedName.endsWith('.svgz')) {
    return 'Arquivos SVG não são permitidos como foto de perfil.';
  }
  if (!CLIENT_AVATAR_MIME_TYPES.includes(normalizedMime as typeof CLIENT_AVATAR_MIME_TYPES[number])) {
    return 'Escolha uma imagem JPEG, PNG ou WebP.';
  }
  if (typeof fileSize === 'number' && fileSize > CLIENT_AVATAR_MAX_BYTES) {
    return 'A foto deve ter no máximo 5 MB.';
  }
  return null;
};
