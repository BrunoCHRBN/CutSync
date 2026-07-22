import { isSafeFilledInput } from './safe-input';

export interface PasswordRule {
  id: 'length' | 'uppercase' | 'lowercase' | 'number' | 'symbol';
  label: string;
  isMet: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'length', label: 'Pelo menos 8 caracteres', isMet: (password) => password.length >= 8 },
  { id: 'uppercase', label: 'Uma letra maiúscula', isMet: (password) => /[A-Z]/.test(password) },
  { id: 'lowercase', label: 'Uma letra minúscula', isMet: (password) => /[a-z]/.test(password) },
  { id: 'number', label: 'Um número', isMet: (password) => /\d/.test(password) },
  { id: 'symbol', label: 'Um símbolo especial', isMet: (password) => /[!@#$%^&*()_+=[\]{};:'",.?/\\|`~-]/.test(password) },
];

export const isStrongPassword = (password: string) => (
  isSafeFilledInput(password) && PASSWORD_RULES.every((rule) => rule.isMet(password))
);

export const passwordPolicyMessage = 'Use 8 ou mais caracteres, incluindo maiúscula, minúscula, número e símbolo.';
