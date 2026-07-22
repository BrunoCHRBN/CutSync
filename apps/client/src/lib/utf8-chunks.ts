const utf8ByteLengthForCodePoint = (codePoint: number) => {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

export const utf8ByteLength = (value: string) => {
  let bytes = 0;

  for (const character of value) {
    bytes += utf8ByteLengthForCodePoint(character.codePointAt(0) ?? 0);
  }

  return bytes;
};

export const splitUtf8Chunks = (value: string, maxBytes = 1800) => {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
    throw new Error('maxBytes deve ser um inteiro positivo.');
  }

  if (!value) return [''];

  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = utf8ByteLengthForCodePoint(character.codePointAt(0) ?? 0);

    if (characterBytes > maxBytes) {
      throw new Error('maxBytes é menor que um único caractere UTF-8.');
    }

    if (current && currentBytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }

    current += character;
    currentBytes += characterBytes;
  }

  chunks.push(current);
  return chunks;
};
