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

const channelLuminance = (value: number) => {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
};

export const getLuminance = (hex: string): number => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return 0;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16));
  return channelLuminance(r) * 0.2126 + channelLuminance(g) * 0.7152 + channelLuminance(b) * 0.0722;
};

export const getContrastRatio = (foreground: string, background: string): number => {
  const values = [getLuminance(foreground), getLuminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
