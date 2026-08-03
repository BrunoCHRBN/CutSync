export const parseOptionalCoordinate = (
  value: string,
  kind: 'latitude' | 'longitude',
): { ok: true; value: number | null } | { ok: false; message: string } => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  const numeric = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(numeric)) {
    return { ok: false, message: `${kind === 'latitude' ? 'Latitude' : 'Longitude'} inválida.` };
  }
  if (kind === 'latitude' && (numeric < -90 || numeric > 90)) {
    return { ok: false, message: 'Latitude deve estar entre -90 e 90.' };
  }
  if (kind === 'longitude' && (numeric < -180 || numeric > 180)) {
    return { ok: false, message: 'Longitude deve estar entre -180 e 180.' };
  }
  return { ok: true, value: numeric };
};
