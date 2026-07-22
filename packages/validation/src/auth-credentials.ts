import { isValidClientName, normalizeClientName } from './client-profile';
import { isStrongPassword, passwordPolicyMessage } from './password-policy';
import { getForbiddenInputMessage } from './safe-input';

export const normalizeAuthEmail = (value: string) => value.trim().toLowerCase();

export const isValidAuthEmail = (value: string) => {
  const normalized = normalizeAuthEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
};

export type SignInValidation =
  | { ok: true; email: string }
  | { ok: false; field: 'email' | 'password'; message: string };

export const validateSignInCredentials = (email: string, password: string): SignInValidation => {
  const normalizedEmail = normalizeAuthEmail(email);

  if (!normalizedEmail) {
    return { ok: false, field: 'email', message: 'Informe seu e-mail para continuar.' };
  }

  const unsafeEmailMessage = getForbiddenInputMessage(normalizedEmail);
  if (unsafeEmailMessage) return { ok: false, field: 'email', message: unsafeEmailMessage };

  if (!isValidAuthEmail(normalizedEmail)) {
    return { ok: false, field: 'email', message: 'Informe um e-mail válido.' };
  }

  if (!password) {
    return { ok: false, field: 'password', message: 'Informe sua senha para continuar.' };
  }

  const unsafePasswordMessage = getForbiddenInputMessage(password);
  if (unsafePasswordMessage) return { ok: false, field: 'password', message: unsafePasswordMessage };

  return { ok: true, email: normalizedEmail };
};

export type EmailValidation =
  | { ok: true; email: string }
  | { ok: false; field: 'email'; message: string };

export const validateAuthEmail = (email: string): EmailValidation => {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) return { ok: false, field: 'email', message: 'Informe seu e-mail para continuar.' };

  const unsafeMessage = getForbiddenInputMessage(normalizedEmail);
  if (unsafeMessage) return { ok: false, field: 'email', message: unsafeMessage };
  if (!isValidAuthEmail(normalizedEmail)) return { ok: false, field: 'email', message: 'Informe um e-mail válido.' };

  return { ok: true, email: normalizedEmail };
};

export type SignUpValidation =
  | { ok: true; name: string; email: string }
  | { ok: false; field: 'name' | 'email' | 'password' | 'confirmation'; message: string };

export const validateSignUpCredentials = (
  name: string,
  email: string,
  password: string,
  confirmation: string,
): SignUpValidation => {
  const normalizedName = normalizeClientName(name);
  if (!normalizedName) return { ok: false, field: 'name', message: 'Informe seu nome para criar a conta.' };

  const unsafeNameMessage = getForbiddenInputMessage(normalizedName);
  if (unsafeNameMessage) return { ok: false, field: 'name', message: unsafeNameMessage };
  if (!isValidClientName(normalizedName)) {
    return { ok: false, field: 'name', message: 'Informe um nome entre 2 e 80 caracteres.' };
  }

  const emailValidation = validateAuthEmail(email);
  if (!emailValidation.ok) return emailValidation;

  if (!password) return { ok: false, field: 'password', message: 'Crie uma senha para continuar.' };
  const unsafePasswordMessage = getForbiddenInputMessage(password);
  if (unsafePasswordMessage) return { ok: false, field: 'password', message: unsafePasswordMessage };
  if (!isStrongPassword(password)) return { ok: false, field: 'password', message: passwordPolicyMessage };

  if (!confirmation) return { ok: false, field: 'confirmation', message: 'Repita a senha para confirmar.' };
  const unsafeConfirmationMessage = getForbiddenInputMessage(confirmation);
  if (unsafeConfirmationMessage) return { ok: false, field: 'confirmation', message: unsafeConfirmationMessage };
  if (password !== confirmation) {
    return { ok: false, field: 'confirmation', message: 'As senhas não coincidem.' };
  }

  return { ok: true, name: normalizedName, email: emailValidation.email };
};

export type PasswordResetValidation =
  | { ok: true }
  | { ok: false; field: 'password' | 'confirmation'; message: string };

export const validatePasswordReset = (password: string, confirmation: string): PasswordResetValidation => {
  if (!password) return { ok: false, field: 'password', message: 'Crie uma nova senha para continuar.' };
  const unsafePasswordMessage = getForbiddenInputMessage(password);
  if (unsafePasswordMessage) return { ok: false, field: 'password', message: unsafePasswordMessage };
  if (!isStrongPassword(password)) return { ok: false, field: 'password', message: passwordPolicyMessage };

  if (!confirmation) return { ok: false, field: 'confirmation', message: 'Repita a nova senha.' };
  const unsafeConfirmationMessage = getForbiddenInputMessage(confirmation);
  if (unsafeConfirmationMessage) return { ok: false, field: 'confirmation', message: unsafeConfirmationMessage };
  if (password !== confirmation) return { ok: false, field: 'confirmation', message: 'As senhas não coincidem.' };

  return { ok: true };
};
