import {
  decodeOpaqueAppointmentIdPathSegment,
  encodeOpaqueAppointmentIdPathSegment,
  normalizeOpaqueAppointmentId,
} from '@cutsync/domain';

const BUSINESS_SCHEME = 'cutsync-business:';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const APPOINTMENT_NOTIFICATION_TYPES = new Set([
  'new_appointment',
  'appointment_created',
  'appointment_cancelled',
  'appointment_rescheduled',
  'operational_conflict',
]);

export type BusinessDeepLink =
  | {
      kind: 'invitation';
      href: `/invite/${string}`;
      invitationToken: string;
      requiresOperationalAccess: false;
    }
  | {
      kind: 'team_invitation';
      href: `/invitations/${string}`;
      invitationId: string;
      requiresOperationalAccess: false;
    }
  | {
      kind: 'appointment';
      href: `/appointments/${string}`;
      appointmentId: string;
      establishmentId: string | null;
      requiresOperationalAccess: true;
    }
  | {
      kind: 'agenda';
      href: '/agenda';
      establishmentId: string | null;
      requiresOperationalAccess: true;
    };

interface BusinessAppointmentLinkContext {
  establishmentId: string;
  accessMode: 'full' | 'read_only' | 'blocked';
}

interface ResolveBusinessAppointmentContextInput {
  appointmentId: string;
  activeEstablishmentId: string | null;
  contexts: readonly BusinessAppointmentLinkContext[];
  loadDetail: (establishmentId: string, appointmentId: string) => Promise<unknown>;
}

const getErrorCode = (error: unknown) => (
  typeof error === 'object'
  && error !== null
  && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : null
);

/**
 * Expo Router may surface a dynamic path segment already decoded or still
 * percent-encoded, depending on how the route was opened. Accept both forms,
 * but always finish with the shared opaque-id validator before any RPC or
 * Realtime filter receives the value.
 */
export const normalizeBusinessAppointmentRouteId = (value: unknown) => (
  normalizeOpaqueAppointmentId(value)
  ?? decodeOpaqueAppointmentIdPathSegment(value)
);

/**
 * Appointment URLs intentionally contain only the opaque appointment id. Resolve
 * the unit by asking the authorized detail RPC for each non-blocked context; the
 * mobile client never infers authorization from the identifier itself.
 */
export const resolveBusinessAppointmentContext = async ({
  appointmentId,
  activeEstablishmentId,
  contexts,
  loadDetail,
}: ResolveBusinessAppointmentContextInput): Promise<string | null> => {
  const normalizedAppointmentId = normalizeBusinessAppointmentRouteId(appointmentId);
  if (!normalizedAppointmentId) return null;
  const candidates = contexts
    .filter((context) => context.accessMode !== 'blocked')
    .map((context) => context.establishmentId);
  const orderedCandidates = [...new Set([
    ...(activeEstablishmentId ? [activeEstablishmentId] : []),
    ...candidates,
  ])].filter((establishmentId) => candidates.includes(establishmentId));

  for (const establishmentId of orderedCandidates) {
    try {
      await loadDetail(establishmentId, normalizedAppointmentId);
      return establishmentId;
    } catch (error) {
      const code = getErrorCode(error);
      if (code !== 'not_found' && code !== 'forbidden') throw error;
    }
  }
  return null;
};

const normalizePath = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith('/')) return trimmed;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== BUSINESS_SCHEME) return null;
    const host = parsed.hostname ? `/${parsed.hostname}` : '';
    return `${host}${parsed.pathname}` || '/';
  } catch {
    return null;
  }
};

export const resolveBusinessDeepLink = (value: unknown): BusinessDeepLink | null => {
  if (typeof value !== 'string') return null;
  const path = normalizePath(value);
  if (!path) return null;

  const invitation = /^\/invite\/([0-9a-f]{64})$/.exec(path);
  if (invitation) {
    return {
      kind: 'invitation',
      href: `/invite/${invitation[1]}`,
      invitationToken: invitation[1],
      requiresOperationalAccess: false,
    };
  }

  const teamInvitation = /^\/(?:invitations|invites)\/([0-9a-f-]+)$/i.exec(path);
  const invitationId = teamInvitation?.[1];
  if (invitationId && UUID_PATTERN.test(invitationId)) {
    return {
      kind: 'team_invitation',
      href: `/invitations/${invitationId.toLowerCase()}`,
      invitationId: invitationId.toLowerCase(),
      requiresOperationalAccess: false,
    };
  }

  if (path === '/agenda') {
    return {
      kind: 'agenda',
      href: '/agenda',
      establishmentId: null,
      requiresOperationalAccess: true,
    };
  }

  const appointment = /^\/appointments\/([^/]+)$/.exec(path);
  const appointmentId = decodeOpaqueAppointmentIdPathSegment(appointment?.[1]);
  const appointmentPathSegment = encodeOpaqueAppointmentIdPathSegment(appointmentId);
  if (!appointmentId || !appointmentPathSegment) return null;

  return {
    kind: 'appointment',
    href: `/appointments/${appointmentPathSegment}`,
    appointmentId,
    establishmentId: null,
    requiresOperationalAccess: true,
  };
};

const readString = (data: Record<string, unknown>, key: string) => {
  const value = data[key];
  return typeof value === 'string' ? value.trim() : null;
};

export const resolveBusinessNotificationLink = (
  data: Record<string, unknown>,
): BusinessDeepLink | null => {
  const type = readString(data, 'type');
  const eventType = readString(data, 'eventType') ?? type;
  const eventEstablishmentId = readString(data, 'establishmentId')
    ?? readString(data, 'establishment_id');
  if (
    eventType === 'operational_conflict'
    && (!eventEstablishmentId || !UUID_PATTERN.test(eventEstablishmentId))
  ) return null;

  const explicitUrl = resolveBusinessDeepLink(readString(data, 'url'));
  if (explicitUrl) {
    if (explicitUrl.kind === 'invitation' || explicitUrl.kind === 'team_invitation') return explicitUrl;
    const establishmentId = readString(data, 'establishmentId')
      ?? readString(data, 'establishment_id');
    if (establishmentId && !UUID_PATTERN.test(establishmentId)) return null;
    return {
      ...explicitUrl,
      establishmentId: establishmentId?.toLowerCase() ?? null,
    };
  }

  if (type === 'invitation') {
    const invitationToken = readString(data, 'invite_token');
    if (!invitationToken || !INVITATION_TOKEN_PATTERN.test(invitationToken)) return null;
    return {
      kind: 'invitation',
      href: `/invite/${invitationToken}`,
      invitationToken,
      requiresOperationalAccess: false,
    };
  }

  if (eventType === 'invitation_created') {
    const invitationId = readString(data, 'invitationId');
    if (!invitationId || !UUID_PATTERN.test(invitationId)) return null;
    return {
      kind: 'team_invitation',
      href: `/invitations/${invitationId.toLowerCase()}`,
      invitationId: invitationId.toLowerCase(),
      requiresOperationalAccess: false,
    };
  }

  if (!eventType || !APPOINTMENT_NOTIFICATION_TYPES.has(eventType)) return null;
  const appointmentId = normalizeOpaqueAppointmentId(
    readString(data, 'appointmentId') ?? readString(data, 'appointment_id'),
  );
  const establishmentId = readString(data, 'establishmentId') ?? readString(data, 'establishment_id');
  if (eventType === 'operational_conflict' && !appointmentId) {
    return {
      kind: 'agenda',
      href: '/agenda',
      establishmentId: eventEstablishmentId!.toLowerCase(),
      requiresOperationalAccess: true,
    };
  }
  const appointmentPathSegment = encodeOpaqueAppointmentIdPathSegment(appointmentId);
  if (!appointmentId || !appointmentPathSegment) return null;
  if (establishmentId && !UUID_PATTERN.test(establishmentId)) return null;

  return {
    kind: 'appointment',
    href: `/appointments/${appointmentPathSegment}`,
    appointmentId,
    establishmentId: establishmentId?.toLowerCase() ?? null,
    requiresOperationalAccess: true,
  };
};

export const getBusinessTeamInvitationShareUrl = (invitationId: string) => {
  const normalized = invitationId.trim().toLowerCase();
  return UUID_PATTERN.test(normalized)
    ? `cutsync-business://invitations/${normalized}`
    : null;
};

export const getBusinessInvitationShareUrl = (invitationToken: string) => {
  const normalized = invitationToken.trim().toLowerCase();
  return INVITATION_TOKEN_PATTERN.test(normalized)
    ? `cutsync-business://invite/${normalized}`
    : null;
};
