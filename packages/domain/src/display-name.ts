const LOWERCASE_WORDS = new Set([
  'a', 'as', 'ao', 'aos', 'à', 'às',
  'o', 'os',
  'de', 'da', 'das', 'do', 'dos',
  'e', 'em', 'na', 'nas', 'no', 'nos',
  'por', 'para', 'com',
]);

const capitalizeWord = (word: string) => {
  if (!word) return word;
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR');
};

// Display-only title case for pt-BR names. Never mutate the persisted value.
export const formatDisplayName = (value: string | null | undefined) => {
  const trimmed = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (!trimmed) return '';

  return trimmed
    .split(' ')
    .map((word, index) => {
      const lower = word.toLocaleLowerCase('pt-BR');
      if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      if (word.includes('-')) {
        return word.split('-').map((part) => capitalizeWord(part)).join('-');
      }
      return capitalizeWord(word);
    })
    .join(' ');
};
