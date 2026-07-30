import { normalizeAuthEmail, isValidAuthEmail } from './auth-credentials';
import { getForbiddenInputMessage } from './safe-input';

export type MarketingContactOrigin = 'client' | 'business';

export const MARKETING_CONTACT_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  emailMax: 180,
  establishmentNameMax: 140,
  messageMin: 12,
  messageMax: 1200,
  requestsPer24h: 3,
} as const;

export interface MarketingContactInput {
  origin: MarketingContactOrigin;
  name: string;
  email: string;
  establishmentName?: string;
  message: string;
  consent: boolean;
  honeypot?: string;
}

export interface MarketingContactValue {
  origin: MarketingContactOrigin;
  name: string;
  email: string;
  establishmentName: string | null;
  message: string;
}

export type MarketingContactField = 'name' | 'email' | 'establishmentName' | 'message' | 'consent';

export type MarketingContactValidation =
  | { ok: true; value: MarketingContactValue }
  | { ok: false; field: MarketingContactField; message: string };

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

export const validateMarketingContactRequest = (input: MarketingContactInput): MarketingContactValidation => {
  const name = collapse(input.name ?? '');
  const email = normalizeAuthEmail(input.email ?? '');
  const establishmentName = collapse(input.establishmentName ?? '');
  const message = (input.message ?? '').replace(/[ \t]+/g, ' ').trim();

  if (name.length < MARKETING_CONTACT_LIMITS.nameMin) {
    return { ok: false, field: 'name', message: 'Informe seu nome para que possamos responder.' };
  }
  if (name.length > MARKETING_CONTACT_LIMITS.nameMax) {
    return { ok: false, field: 'name', message: 'Use um nome mais curto.' };
  }
  const unsafeName = getForbiddenInputMessage(name);
  if (unsafeName) return { ok: false, field: 'name', message: unsafeName };

  if (!email) return { ok: false, field: 'email', message: 'Informe um e-mail de contato.' };
  if (email.length > MARKETING_CONTACT_LIMITS.emailMax || !isValidAuthEmail(email)) {
    return { ok: false, field: 'email', message: 'Informe um e-mail válido.' };
  }

  if (establishmentName.length > MARKETING_CONTACT_LIMITS.establishmentNameMax) {
    return { ok: false, field: 'establishmentName', message: 'Use um nome de estabelecimento mais curto.' };
  }
  const unsafeEstablishment = establishmentName ? getForbiddenInputMessage(establishmentName) : null;
  if (unsafeEstablishment) return { ok: false, field: 'establishmentName', message: unsafeEstablishment };

  if (message.length < MARKETING_CONTACT_LIMITS.messageMin) {
    return { ok: false, field: 'message', message: 'Descreva sua necessidade com pelo menos 12 caracteres.' };
  }
  if (message.length > MARKETING_CONTACT_LIMITS.messageMax) {
    return { ok: false, field: 'message', message: 'Reduza a mensagem para até 1200 caracteres.' };
  }
  const unsafeMessage = getForbiddenInputMessage(message);
  if (unsafeMessage) return { ok: false, field: 'message', message: unsafeMessage };

  if (!input.consent) {
    return { ok: false, field: 'consent', message: 'Confirme o consentimento para entrarmos em contato.' };
  }

  return {
    ok: true,
    value: {
      origin: input.origin,
      name,
      email,
      establishmentName: input.origin === 'business' && establishmentName ? establishmentName : null,
      message,
    },
  };
};
