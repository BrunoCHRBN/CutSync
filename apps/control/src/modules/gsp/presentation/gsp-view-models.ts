import type { ControlAccessUser } from '@/services/control-access';
import type { GovernanceRole } from '@/types/control';
import {
  accessStateLabels,
  labelForRole,
  type GspAccessState,
} from '@/modules/gsp/presentation/gsp-labels';
import { formatExpiry, formatRelative, initialsFromName } from '@/modules/gsp/presentation/gsp-formatters';
import { resolvePersonIdentity } from '@/modules/gsp/presentation/gsp-identities';
import { isControlAccessEffective } from '@/services/control-access';

export type GspAccessSummary = {
  profileId: string;
  name: string;
  email: string;
  initials: string;
  role: GovernanceRole;
  roleLabel: string;
  state: GspAccessState;
  stateLabel: string;
  expiresLabel: string;
  grantedLabel: string;
  isYou: boolean;
  raw: ControlAccessUser;
};

export function resolveAccessState(user: ControlAccessUser, now = Date.now()): GspAccessState {
  if (user.revokedAt) return 'revoked';
  if (!user.isActive) return 'inactive';
  if (user.expiresAt && new Date(user.expiresAt).getTime() <= now) return 'expired';
  if (isControlAccessEffective(user, now)) return 'active';
  return 'inactive';
}

export function toAccessSummary(
  user: ControlAccessUser,
  currentProfileId: string | null | undefined,
  now = Date.now(),
): GspAccessSummary {
  const identity = resolvePersonIdentity({
    displayName: user.name,
    email: user.email,
    profileId: user.profileId,
  });
  const state = resolveAccessState(user, now);
  return {
    profileId: user.profileId,
    name: identity.primary,
    email: user.email,
    initials: initialsFromName(user.name || user.email),
    role: user.role,
    roleLabel: labelForRole(user.role),
    state,
    stateLabel: accessStateLabels[state],
    expiresLabel: formatExpiry(user.expiresAt),
    grantedLabel: formatRelative(user.grantedAt, now),
    isYou: Boolean(currentProfileId && currentProfileId === user.profileId),
    raw: user,
  };
}

export type GspAuditEventSummary = {
  id: string;
  action: string;
  actionLabel: string;
  actorPrimary: string;
  targetPrimary: string;
  createdAt: string;
  createdLabel: string;
  originLabel: string;
  resultLabel: string;
  clientIpMasked: string | null;
};

export type GspPolicySummary = {
  id: string;
  category: string;
  title: string;
  stateLabel: string;
  application: string;
  updatedLabel: string;
  detail: string;
};
