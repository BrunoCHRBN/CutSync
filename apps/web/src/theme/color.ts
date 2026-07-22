export const readableForeground = (hex?: string | null): string => {
  const normalized = (hex || '').replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return '#FFFFFF';
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16));
  return ((r * 299 + g * 587 + b * 114) / 1000) > 160 ? '#171717' : '#FFFFFF';
};

export const initialsOf = (name?: string | null): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '•';
  return parts.slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
};
