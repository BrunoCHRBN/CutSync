const toHex = (bytes: Uint8Array) => (
  Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
);

/**
 * Generates a UUID v4 before a mobile command is first attempted. The caller
 * must retain this value while retrying after a lost or ambiguous response.
 */
export const createMobileRequestId = () => {
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('secure_random_unavailable');
  }
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
};

export const MOBILE_REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

