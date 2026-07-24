const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToHex = (value: ArrayBuffer) =>
  Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");

const bytesToBase64 = (value: Uint8Array) => {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error("identity_service_not_configured");
  return value;
};

export type DocumentType = "CPF" | "CNPJ";

export const normalizeCpf = (value: string) => value.replace(/\D/g, "");
export const normalizeCnpj = (value: string) =>
  value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
export const normalizeDocument = (type: DocumentType, value: string) =>
  type === "CPF" ? normalizeCpf(value) : normalizeCnpj(value);

const allDigitsEqual = (value: string) => /^(\d)\1+$/.test(value);

export const isValidCpf = (value: string) => {
  const digits = normalizeCpf(value);
  if (digits.length !== 11 || allDigitsEqual(digits)) return false;
  for (let position = 9; position <= 10; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(digits[index]) * (position + 1 - index);
    }
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(digits[position])) return false;
  }
  return true;
};

export const isValidCnpj = (value: string) => {
  const document = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(document) || /^([A-Z0-9])\1{11}/.test(document)) {
    return false;
  }
  const characterValue = (character: string) => character.charCodeAt(0) - 48;
  const calculate = (length: number) => {
    let factor = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += characterValue(document[index]) * factor--;
      if (factor < 2) factor = 9;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(document[12]) && calculate(13) === Number(document[13]);
};

export const normalizeBrazilPhone = (value: string) => {
  if (!value.trim()) return "";
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55")) digits = digits.slice(2);
  if (digits.length !== 10 && digits.length !== 11) throw new Error("invalid_phone");
  if (digits.slice(0, 2) === "00" || /^(\d)\1+$/.test(digits)) throw new Error("invalid_phone");
  return `+55${digits}`;
};

export const fingerprintDocument = async (document: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(requiredSecret("DOCUMENT_FINGERPRINT_KEY")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(await crypto.subtle.sign("HMAC", key, encoder.encode(document)));
};

const getEncryptionKey = async () => {
  const raw = base64ToBytes(requiredSecret("DOCUMENT_ENCRYPTION_KEY"));
  if (raw.byteLength !== 32) throw new Error("identity_service_not_configured");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export const encryptDocument = async (document: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getEncryptionKey(),
    encoder.encode(document),
  );
  return {
    encryptedDocument: bytesToBase64(new Uint8Array(encrypted)),
    encryptionIv: bytesToBase64(iv),
    encryptionKeyVersion: requiredSecret("DOCUMENT_KEY_VERSION"),
  };
};

export const decryptDocument = async (
  encryptedDocument: string,
  encryptionIv: string,
  encryptionKeyVersion: string,
) => {
  if (encryptionKeyVersion !== requiredSecret("DOCUMENT_KEY_VERSION")) {
    throw new Error("unsupported_identity_key_version");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encryptionIv) },
    await getEncryptionKey(),
    base64ToBytes(encryptedDocument),
  );
  return decoder.decode(decrypted);
};
