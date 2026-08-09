import type {
  BusinessCapability,
  BusinessOperationalContext,
} from '@cutsync/database';

export type BusinessEntryState =
  | 'loading_session'
  | 'signed_out'
  | 'loading_context'
  | 'no_access'
  | 'select_establishment'
  | 'blocked'
  | 'operational';

export const resolveActiveEstablishmentId = (
  contexts: readonly Pick<BusinessOperationalContext, 'establishmentId'>[],
  candidates: readonly (string | null | undefined)[],
): string | null => {
  const allowedIds = new Set(contexts.map((context) => context.establishmentId));
  const selected = candidates.find((candidate) => Boolean(candidate && allowedIds.has(candidate)));

  if (selected) return selected;
  return contexts.length === 1 ? contexts[0]?.establishmentId ?? null : null;
};

export const resolveBusinessEntryState = ({
  sessionLoading,
  hasSession,
  contextLoading,
  contextCount,
  activeAccessMode,
}: {
  sessionLoading: boolean;
  hasSession: boolean;
  contextLoading: boolean;
  contextCount: number;
  activeAccessMode: BusinessOperationalContext['accessMode'] | null;
}): BusinessEntryState => {
  if (sessionLoading) return 'loading_session';
  if (!hasSession) return 'signed_out';
  if (contextLoading) return 'loading_context';
  if (contextCount === 0) return 'no_access';
  if (!activeAccessMode) return 'select_establishment';
  if (activeAccessMode === 'blocked') return 'blocked';
  return 'operational';
};

export const hasBusinessManagementNavigation = (
  capabilities: readonly BusinessCapability[] | null | undefined,
) => Boolean(capabilities?.some((capability) => (
  capability === 'view_unit_reports'
  || capability === 'manage_services'
  || capability === 'manage_team'
  || capability === 'manage_operational_settings'
)));

export const hasBusinessDecisionsNavigation = (
  capabilities: readonly BusinessCapability[] | null | undefined,
) => Boolean(capabilities?.some((capability) => (
  capability === 'request_appointment_reassignment'
  || capability === 'apply_appointment_reassignment'
)));

export const getActiveEstablishmentStorageKey = (
  userId: string,
) => `cutsync:business:active-establishment:${userId}`;
