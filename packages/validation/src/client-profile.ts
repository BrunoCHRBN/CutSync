export const normalizeClientName = (value: string) => value.trim();

export const normalizeClientPhone = (value: string) => value.trim();

export const isValidClientName = (value: string) => normalizeClientName(value).length >= 2;

export const isValidClientPhone = (value: string) => {
  const digits = normalizeClientPhone(value).replace(/\D/g, '');
  return digits.length === 0 || (digits.length >= 10 && digits.length <= 13);
};
