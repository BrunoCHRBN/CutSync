export type ForbiddenInputReason = 'emoji' | 'markup';

const emojiPattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u200D\uFE0F\u20E3]/u;
const markupPattern = /[<>]|data\s*:\s*image\s*\/\s*svg\+xml|\bxmlns\s*=|\bsvg\s*:/i;

export const getForbiddenInputReason = (value: string): ForbiddenInputReason | null => {
  if (emojiPattern.test(value)) return 'emoji';
  if (markupPattern.test(value)) return 'markup';
  return null;
};

export const isSafeFilledInput = (value: string) => getForbiddenInputReason(value) === null;

export const getForbiddenInputMessage = (value: string) => {
  const reason = getForbiddenInputReason(value);
  if (reason === 'emoji') return 'Emojis não são permitidos neste campo.';
  if (reason === 'markup') return 'Conteúdo HTML ou SVG não é permitido neste campo.';
  return null;
};
