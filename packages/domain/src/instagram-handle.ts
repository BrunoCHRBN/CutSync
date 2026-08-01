// Strip URL wrappers and leading @ so UI can render a single "@handle".
export const normalizeInstagramHandle = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;

  const withoutUrl = trimmed
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\/+$/, '');

  const handle = withoutUrl.replace(/^@+/, '').trim();
  return handle || null;
};
