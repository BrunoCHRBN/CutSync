import { getForbiddenInputMessage } from './safe-input';

export const CLIENT_SUPPORT_SUBJECT_MIN_LENGTH = 5;
export const CLIENT_SUPPORT_SUBJECT_MAX_LENGTH = 120;
export const CLIENT_SUPPORT_MESSAGE_MIN_LENGTH = 20;
export const CLIENT_SUPPORT_MESSAGE_MAX_LENGTH = 4000;
export const CLIENT_SUPPORT_REPLY_MIN_LENGTH = 1;

export const CLIENT_SUPPORT_CATEGORY_VALUES = [
  'access_identity',
  'booking',
  'marketplace',
  'security_privacy',
  'product_feedback',
  'other',
] as const;

export type ValidClientSupportCategory = typeof CLIENT_SUPPORT_CATEGORY_VALUES[number];

export const CLIENT_SUPPORT_IMPACT_VALUES = ['low', 'normal', 'high', 'critical'] as const;
export type ValidClientSupportImpact = typeof CLIENT_SUPPORT_IMPACT_VALUES[number];

export const normalizeClientSupportSubject = (value: string) => (
  value.trim().replace(/\s+/g, ' ')
);

export const normalizeClientSupportMessage = (value: string) => (
  value.replace(/\r\n?/g, '\n').trim()
);

type ClientSupportTicketValidationResult =
  | {
      ok: true;
      category: ValidClientSupportCategory;
      impact: ValidClientSupportImpact;
      subject: string;
      message: string;
      appointmentId: string | null;
    }
  | {
      ok: false;
      field: 'category' | 'impact' | 'subject' | 'message' | 'appointmentId';
      message: string;
    };

type ClientSupportReplyValidationResult =
  | { ok: true; message: string }
  | { ok: false; field: 'message'; message: string };

const validateMessage = (
  value: string,
  minimumLength: number,
): ClientSupportReplyValidationResult => {
  const message = normalizeClientSupportMessage(value);
  const unsafeMessage = getForbiddenInputMessage(message);
  if (unsafeMessage) return { ok: false, field: 'message', message: unsafeMessage };
  if (
    message.length < minimumLength
    || message.length > CLIENT_SUPPORT_MESSAGE_MAX_LENGTH
  ) {
    return {
      ok: false,
      field: 'message',
      message: `Escreva uma mensagem entre ${minimumLength} e ${CLIENT_SUPPORT_MESSAGE_MAX_LENGTH} caracteres.`,
    };
  }
  return { ok: true, message };
};

export const validateClientSupportTicket = ({
  category,
  impact,
  subject: rawSubject,
  message: rawMessage,
  appointmentId: rawAppointmentId,
}: {
  category: string;
  impact: string;
  subject: string;
  message: string;
  appointmentId?: string | null;
}): ClientSupportTicketValidationResult => {
  if (!CLIENT_SUPPORT_CATEGORY_VALUES.includes(category as ValidClientSupportCategory)) {
    return { ok: false, field: 'category', message: 'Escolha uma área válida para o chamado.' };
  }
  if (!CLIENT_SUPPORT_IMPACT_VALUES.includes(impact as ValidClientSupportImpact)) {
    return { ok: false, field: 'impact', message: 'Escolha um impacto válido.' };
  }

  const subject = normalizeClientSupportSubject(rawSubject);
  const unsafeSubject = getForbiddenInputMessage(subject);
  if (unsafeSubject) return { ok: false, field: 'subject', message: unsafeSubject };
  if (
    subject.length < CLIENT_SUPPORT_SUBJECT_MIN_LENGTH
    || subject.length > CLIENT_SUPPORT_SUBJECT_MAX_LENGTH
  ) {
    return {
      ok: false,
      field: 'subject',
      message: `Informe um assunto entre ${CLIENT_SUPPORT_SUBJECT_MIN_LENGTH} e ${CLIENT_SUPPORT_SUBJECT_MAX_LENGTH} caracteres.`,
    };
  }

  const messageValidation = validateMessage(rawMessage, CLIENT_SUPPORT_MESSAGE_MIN_LENGTH);
  if (!messageValidation.ok) return messageValidation;

  const appointmentId = rawAppointmentId?.trim() || null;
  const unsafeAppointmentId = appointmentId
    ? getForbiddenInputMessage(appointmentId)
    : null;
  if (unsafeAppointmentId || (appointmentId && appointmentId.length > 128)) {
    return {
      ok: false,
      field: 'appointmentId',
      message: unsafeAppointmentId ?? 'O atendimento relacionado não é válido.',
    };
  }

  return {
    ok: true,
    category: category as ValidClientSupportCategory,
    impact: impact as ValidClientSupportImpact,
    subject,
    message: messageValidation.message,
    appointmentId,
  };
};

export const validateClientSupportReply = (message: string) => (
  validateMessage(message, CLIENT_SUPPORT_REPLY_MIN_LENGTH)
);
