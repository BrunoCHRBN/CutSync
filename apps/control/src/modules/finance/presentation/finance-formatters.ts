export function formatFinanceDate(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export function formatFinanceDateTime(value: string | null | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

export function formatFinanceRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function maskFinanceId(value: string | null | undefined, visible = 8): string | null {
  if (!value) return null;
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…`;
}

export function formatUnitCount(count: number): string {
  const normalized = Number.isFinite(count) ? count : 0;
  return `${normalized.toLocaleString('pt-BR')} unidade${normalized === 1 ? '' : 's'}`;
}
