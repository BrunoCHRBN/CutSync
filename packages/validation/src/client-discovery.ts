import { getForbiddenInputMessage } from './safe-input';

export const CLIENT_DISCOVERY_QUERY_MAX_LENGTH = 80;

export type ClientDiscoveryQueryValidation =
  | { ok: true; query: string }
  | { ok: false; message: string };

export const normalizeClientDiscoveryQuery = (value: string) => value.trim().replace(/\s+/g, ' ');

export const validateClientDiscoveryQuery = (value: string): ClientDiscoveryQueryValidation => {
  const unsafeMessage = getForbiddenInputMessage(value);
  if (unsafeMessage) return { ok: false, message: unsafeMessage };

  const query = normalizeClientDiscoveryQuery(value);
  if (query.length > CLIENT_DISCOVERY_QUERY_MAX_LENGTH) {
    return {
      ok: false,
      message: `Busque usando no máximo ${CLIENT_DISCOVERY_QUERY_MAX_LENGTH} caracteres.`,
    };
  }

  return { ok: true, query };
};
