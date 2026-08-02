import type { SupportTicketSummary } from '@/services/control-support';

export type SupportIdentity = {
  primary: string;
  secondary: string | null;
  idHint: string | null;
  kind: 'person' | 'team' | 'org' | 'unknown';
};

const TEAM_LABELS: Record<string, string> = {
  SUPORTE_GERAL: 'Suporte Geral',
  suporte_geral: 'Suporte Geral',
};

function looksLikeOpaqueId(value: string): boolean {
  return /^[0-9a-f]{6,}$/i.test(value.replace(/-/g, ''));
}

export function formatTeamLabel(teamCode: string | null | undefined): string | null {
  if (!teamCode) return null;
  if (TEAM_LABELS[teamCode]) return TEAM_LABELS[teamCode];
  return teamCode
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolvePersonIdentity(input: {
  displayName?: string | null;
  profileId?: string | null;
  fallbackPrimary?: string;
}): SupportIdentity {
  const name = input.displayName?.trim() || null;
  const id = input.profileId?.trim() || null;
  const idHint = id ? id.slice(0, 8) : null;

  if (name && !looksLikeOpaqueId(name)) {
    return {
      primary: name,
      secondary: idHint ? `ID ${idHint}` : null,
      idHint,
      kind: 'person',
    };
  }

  if (id) {
    return {
      primary: input.fallbackPrimary ?? 'Usuário interno',
      secondary: `ID ${idHint}`,
      idHint,
      kind: 'person',
    };
  }

  return {
    primary: input.fallbackPrimary ?? 'Não informado',
    secondary: null,
    idHint: null,
    kind: 'unknown',
  };
}

export function resolveAssigneeIdentity(ticket: Pick<
  SupportTicketSummary,
  'assigneeProfileId'
>): SupportIdentity {
  if (!ticket.assigneeProfileId) {
    return {
      primary: 'Sem responsável',
      secondary: null,
      idHint: null,
      kind: 'unknown',
    };
  }
  return resolvePersonIdentity({
    profileId: ticket.assigneeProfileId,
    fallbackPrimary: 'Usuário interno',
  });
}

export function resolveRequesterIdentity(ticket: Pick<
  SupportTicketSummary,
  'requesterDisplayName' | 'locationLabel'
>): SupportIdentity {
  return resolvePersonIdentity({
    displayName: ticket.requesterDisplayName,
    fallbackPrimary: ticket.locationLabel ?? 'Cliente não identificado',
  });
}

export function resolveTeamIdentity(input: {
  teamCode?: string | null;
  teamId?: string | null;
}): SupportIdentity {
  const label = formatTeamLabel(input.teamCode);
  if (label) {
    return {
      primary: label,
      secondary: input.teamId ? `ID ${input.teamId.slice(0, 8)}` : (input.teamCode ?? null),
      idHint: input.teamId?.slice(0, 8) ?? null,
      kind: 'team',
    };
  }
  if (input.teamId) {
    return {
      primary: 'Equipe interna',
      secondary: `ID ${input.teamId.slice(0, 8)}`,
      idHint: input.teamId.slice(0, 8),
      kind: 'team',
    };
  }
  return {
    primary: 'Equipe não informada',
    secondary: null,
    idHint: null,
    kind: 'unknown',
  };
}

export function assigneeLabel(ticket: SupportTicketSummary): string {
  return resolveAssigneeIdentity(ticket).primary;
}

export function clientLabel(ticket: SupportTicketSummary): string {
  return resolveRequesterIdentity(ticket).primary;
}

/** Mask long opaque identifiers for technical panels. */
export function maskIdentifier(value: string | null | undefined, visible = 8): string | null {
  if (!value) return null;
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…`;
}
