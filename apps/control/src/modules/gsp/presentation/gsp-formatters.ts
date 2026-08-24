export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(ts));
}

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(ts));
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
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

export function formatExpiry(value: string | null | undefined): string {
  if (!value) return 'Sem expiração';
  return formatDate(value) ?? 'Data indisponível';
}

export function maskIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').filter(Boolean);
    if (parts.length < 2) return '••••';
    return `${parts.slice(0, 2).join(':')}:••••`;
  }
  const octets = trimmed.split('.');
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.•••.•••`;
  if (trimmed.length <= 4) return '••••';
  return `${trimmed.slice(0, 4)}…`;
}

export function maskIdentifier(value: string | null | undefined, visible = 8): string | null {
  if (!value) return null;
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…`;
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name?.trim()) return '·';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}
