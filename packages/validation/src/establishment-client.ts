export const ESTABLISHMENT_CLIENT_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  phoneMin: 8,
  phoneMax: 32,
  emailMax: 254,
  tagMax: 40,
  tagsMax: 20,
  notesMax: 2000,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mirrors `public.normalize_establishment_client_phone`. Any change here must be applied to
 * the SQL function in the same commit: a divergence between the two makes the
 * same contact normalize differently depending on who wrote the row, which
 * silently splits a client into duplicates during an import.
 *
 * Returns `null` when the input cannot be normalized with confidence. A local
 * number without area code is never completed with a guessed DDD.
 */
export const normalizeEstablishmentClientPhone = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return `+${digits}`;
  return null;
};

/** Mirrors `public.normalize_establishment_client_email`. */
export const normalizeEstablishmentClientEmail = (value: string | null | undefined): string | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized || normalized.length > ESTABLISHMENT_CLIENT_LIMITS.emailMax) return null;
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
};

/**
 * Accent- and case-insensitive key for filtering an already loaded list in the
 * UI. Server-side search stays with the RPC, which applies its own rules.
 */
export const buildClientSearchKey = (value: string | null | undefined) => (
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

export type EstablishmentClientField = 'name' | 'phone' | 'email' | 'tags' | 'notes';

export interface EstablishmentClientInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  tags?: readonly string[];
  notes?: string | null;
}

export interface EstablishmentClientValue {
  name: string;
  phone: string | null;
  normalizedPhone: string | null;
  email: string | null;
  normalizedEmail: string | null;
  tags: string[];
  notes: string | null;
}

export type EstablishmentClientValidation =
  | { ok: true; value: EstablishmentClientValue }
  | { ok: false; field: EstablishmentClientField; message: string };

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

export const validateEstablishmentClient = (
  input: EstablishmentClientInput,
): EstablishmentClientValidation => {
  const name = collapse(input.name ?? '');
  if (name.length < ESTABLISHMENT_CLIENT_LIMITS.nameMin
    || name.length > ESTABLISHMENT_CLIENT_LIMITS.nameMax) {
    return { ok: false, field: 'name', message: 'Informe um nome entre 2 e 120 caracteres.' };
  }

  const rawPhone = (input.phone ?? '').trim() || null;
  if (rawPhone && (rawPhone.length < ESTABLISHMENT_CLIENT_LIMITS.phoneMin
    || rawPhone.length > ESTABLISHMENT_CLIENT_LIMITS.phoneMax)) {
    return { ok: false, field: 'phone', message: 'Informe um telefone válido.' };
  }

  const rawEmail = (input.email ?? '').trim().toLowerCase() || null;
  if (rawEmail && !normalizeEstablishmentClientEmail(rawEmail)) {
    return { ok: false, field: 'email', message: 'Informe um e-mail válido.' };
  }

  const tags = Array.from(new Set(
    (input.tags ?? []).map((tag) => collapse(tag)).filter((tag) => tag.length > 0),
  )).sort();
  if (tags.length > ESTABLISHMENT_CLIENT_LIMITS.tagsMax
    || tags.some((tag) => tag.length > ESTABLISHMENT_CLIENT_LIMITS.tagMax)) {
    return { ok: false, field: 'tags', message: 'Revise as etiquetas do cliente.' };
  }

  const notes = (input.notes ?? '').trim() || null;
  if (notes && notes.length > ESTABLISHMENT_CLIENT_LIMITS.notesMax) {
    return { ok: false, field: 'notes', message: 'Reduza as observações para até 2000 caracteres.' };
  }

  return {
    ok: true,
    value: {
      name,
      phone: rawPhone,
      normalizedPhone: normalizeEstablishmentClientPhone(rawPhone),
      email: rawEmail,
      normalizedEmail: normalizeEstablishmentClientEmail(rawEmail),
      tags,
      notes,
    },
  };
};

/**
 * Duplicate hints only. A shared contact is common between relatives and
 * dependants, so a match never merges rows on its own.
 */
export const areLikelyDuplicateClients = (
  left: Pick<EstablishmentClientValue, 'normalizedPhone' | 'normalizedEmail' | 'name'>,
  right: Pick<EstablishmentClientValue, 'normalizedPhone' | 'normalizedEmail' | 'name'>,
) => {
  if (left.normalizedPhone && left.normalizedPhone === right.normalizedPhone) return true;
  if (left.normalizedEmail && left.normalizedEmail === right.normalizedEmail) return true;
  return false;
};
