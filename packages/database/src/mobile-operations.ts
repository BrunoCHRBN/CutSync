import type { BusinessAgendaStatus, BusinessInvitationRole } from './business';

type UnknownRecord = Record<string, unknown>;

export type BusinessAppointmentAction =
  | 'confirm'
  | 'complete'
  | 'cancel'
  | 'reschedule'
  | 'no_show';

export interface BusinessAppointmentEvent {
  id: string;
  eventType: string;
  actorId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface BusinessAppointmentDetail {
  id: string;
  establishmentId: string;
  establishmentClientId: string | null;
  clientId: string | null;
  clientDisplayName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  serviceListPrice: number;
  startsAt: string;
  endsAt: string;
  updatedAt: string;
  status: BusinessAgendaStatus;
  notes: string | null;
  allowedActions: BusinessAppointmentAction[];
  history: BusinessAppointmentEvent[];
}

export interface BusinessScheduleBlock {
  id: string;
  establishmentId: string;
  professionalId: string;
  professionalName: string | null;
  startsAt: string;
  endsAt: string;
  kind: 'break' | 'time_off' | 'blocked';
  reason: string | null;
  allDay: boolean;
  localDate: string | null;
}

export type EstablishmentClientStatus = 'active' | 'archived' | 'merged';
export type EstablishmentClientConsentStatus = 'unknown' | 'granted' | 'revoked';
export type EstablishmentClientLinkStatus = 'unlinked' | 'pending' | 'confirmed' | 'rejected';

export interface EstablishmentClient {
  id: string;
  establishmentId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  status: EstablishmentClientStatus;
  source: string;
  sourceProvider: string | null;
  marketingConsentStatus: EstablishmentClientConsentStatus;
  linkedProfileId: string | null;
  linkStatus: EstablishmentClientLinkStatus;
  firstAppointmentAt: string | null;
  lastAppointmentAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EstablishmentClientLinkRequest {
  id: string;
  establishmentClientId: string;
  establishmentId: string;
  establishmentName: string;
  displayName: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
}

export interface BusinessService {
  id: string;
  establishmentId: string;
  name: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
  sortOrder: number;
  professionalServices: BusinessProfessionalService[];
}

export interface BusinessProfessionalService {
  professionalId: string;
  price: number;
  durationMinutes: number;
  isActive: boolean;
}

export interface BusinessTeamMember {
  membershipId: string;
  profileId: string;
  establishmentId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'professional';
  status: 'active' | 'suspended';
  commissionRate: number;
}

export interface BusinessTeamInvitation {
  id: string;
  establishmentId: string;
  targetContact: string;
  invitedRole: BusinessInvitationRole;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
}

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const stringValue = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const nullableString = (value: unknown) => (
  value === null ? null : stringValue(value)
);

const numberValue = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const timestampValue = (value: unknown) => {
  const candidate = stringValue(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
};

const stringArray = (value: unknown) => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value as string[]
    : null
);

const property = (
  value: UnknownRecord,
  snakeCase: string,
  camelCase: string,
) => value[snakeCase] ?? value[camelCase];

const appointmentStatus = (value: unknown): BusinessAgendaStatus | null => (
  value === 'pending'
  || value === 'confirmed'
  || value === 'cancelled'
  || value === 'completed'
  || value === 'no_show'
    ? value
    : null
);

const appointmentAction = (value: unknown): value is BusinessAppointmentAction => (
  value === 'confirm'
  || value === 'complete'
  || value === 'cancel'
  || value === 'reschedule'
  || value === 'no_show'
);

const mapAppointmentEvent = (value: unknown): BusinessAppointmentEvent | null => {
  if (!isRecord(value)) return null;
  const id = typeof value.id === 'number' && Number.isSafeInteger(value.id)
    ? String(value.id)
    : stringValue(value.id);
  const eventType = stringValue(property(value, 'event_type', 'eventType'));
  const actorId = nullableString(property(value, 'actor_id', 'actorId') ?? null);
  const createdAt = timestampValue(property(value, 'created_at', 'createdAt'));
  if (!id || !eventType || !createdAt) return null;
  return {
    id,
    eventType,
    actorId,
    createdAt,
    metadata: isRecord(value.metadata) ? value.metadata : {},
  };
};

export const mapBusinessAppointmentDetail = (value: unknown): BusinessAppointmentDetail | null => {
  if (!isRecord(value)) return null;
  const service = isRecord(value.service) ? value.service : {};
  const professional = isRecord(value.professional) ? value.professional : {};
  const client = isRecord(value.client) ? value.client : {};
  const id = stringValue(value.id ?? property(value, 'appointment_id', 'appointmentId'));
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const clientDisplayName = stringValue(
    property(value, 'client_display_name', 'clientDisplayName')
      ?? property(client, 'display_name', 'displayName'),
  );
  const professionalId = stringValue(
    property(value, 'professional_id', 'professionalId') ?? professional.id,
  );
  const professionalName = stringValue(
    property(value, 'professional_name', 'professionalName') ?? professional.name,
  );
  const serviceId = stringValue(property(value, 'service_id', 'serviceId') ?? service.id);
  const serviceName = stringValue(property(value, 'service_name', 'serviceName') ?? service.name);
  const serviceListPrice = numberValue(
    property(value, 'service_list_price', 'serviceListPrice')
      ?? property(service, 'list_price', 'listPrice'),
  );
  const startsAt = timestampValue(property(value, 'starts_at', 'startsAt'));
  const endsAt = timestampValue(property(value, 'ends_at', 'endsAt'));
  const updatedAt = timestampValue(property(value, 'updated_at', 'updatedAt'));
  const status = appointmentStatus(value.status ?? property(value, 'appointment_status', 'appointmentStatus'));
  const rawActions = property(value, 'allowed_actions', 'allowedActions');
  const actions = Array.isArray(rawActions)
    ? rawActions.filter(appointmentAction)
    : null;
  const history = Array.isArray(value.history)
    ? value.history.map(mapAppointmentEvent).filter((item): item is BusinessAppointmentEvent => Boolean(item))
    : null;
  if (
    !id || !establishmentId || !clientDisplayName || !professionalId || !professionalName
    || !serviceId || !serviceName || serviceListPrice === null || !startsAt || !endsAt || !updatedAt
    || !status || !actions || !history || Date.parse(endsAt) <= Date.parse(startsAt)
  ) return null;

  return {
    id,
    establishmentId,
    establishmentClientId: nullableString(
      property(value, 'establishment_client_id', 'establishmentClientId')
        ?? property(client, 'establishment_client_id', 'establishmentClientId')
        ?? null,
    ),
    clientId: nullableString(
      property(value, 'client_id', 'clientId')
        ?? property(client, 'profile_id', 'profileId')
        ?? null,
    ),
    clientDisplayName,
    clientPhone: nullableString(
      property(value, 'client_phone', 'clientPhone') ?? client.phone ?? null,
    ),
    clientEmail: nullableString(
      property(value, 'client_email', 'clientEmail') ?? client.email ?? null,
    ),
    professionalId,
    professionalName,
    serviceId,
    serviceName,
    serviceListPrice,
    startsAt,
    endsAt,
    updatedAt,
    status,
    notes: nullableString(value.notes ?? client.notes ?? null),
    allowedActions: actions,
    history,
  };
};

export const mapEstablishmentClient = (value: unknown): EstablishmentClient | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const displayName = stringValue(property(value, 'display_name', 'displayName'));
  const tags = stringArray(value.tags);
  const rawFirstAppointmentAt = property(value, 'first_appointment_at', 'firstAppointmentAt');
  const rawLastAppointmentAt = property(value, 'last_appointment_at', 'lastAppointmentAt');
  const rawArchivedAt = property(value, 'archived_at', 'archivedAt');
  const firstAppointmentAt = rawFirstAppointmentAt == null
    ? null
    : timestampValue(rawFirstAppointmentAt);
  const lastAppointmentAt = rawLastAppointmentAt == null
    ? null
    : timestampValue(rawLastAppointmentAt);
  const archivedAt = rawArchivedAt == null ? null : timestampValue(rawArchivedAt);
  const updatedAt = timestampValue(property(value, 'updated_at', 'updatedAt'));
  const createdAt = timestampValue(property(value, 'created_at', 'createdAt')) ?? updatedAt;
  const linkStatus = property(value, 'link_status', 'linkStatus') ?? 'unlinked';
  const status = property(value, 'status', 'status') ?? 'active';
  const consent = property(value, 'marketing_consent_status', 'marketingConsentStatus')
    ?? 'unknown';
  const source = stringValue(property(value, 'source', 'source')) ?? 'manual';
  if (
    !id || !establishmentId || !displayName || !tags || !createdAt || !updatedAt
    || (rawFirstAppointmentAt != null && !firstAppointmentAt)
    || (rawLastAppointmentAt != null && !lastAppointmentAt)
    || (rawArchivedAt != null && !archivedAt)
    || (linkStatus !== 'unlinked' && linkStatus !== 'pending' && linkStatus !== 'confirmed' && linkStatus !== 'rejected')
    || (status !== 'active' && status !== 'archived' && status !== 'merged')
    || (consent !== 'unknown' && consent !== 'granted' && consent !== 'revoked')
  ) return null;
  return {
    id,
    establishmentId,
    displayName,
    phone: nullableString(value.phone),
    email: nullableString(value.email),
    notes: nullableString(value.notes),
    tags,
    status,
    source,
    sourceProvider: nullableString(
      property(value, 'source_provider', 'sourceProvider') ?? null,
    ),
    marketingConsentStatus: consent,
    linkedProfileId: nullableString(property(value, 'linked_profile_id', 'linkedProfileId') ?? null),
    linkStatus,
    firstAppointmentAt,
    lastAppointmentAt,
    archivedAt,
    createdAt,
    updatedAt,
  };
};

export const mapEstablishmentClientLinkRequest = (
  value: unknown,
): EstablishmentClientLinkRequest | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id ?? property(value, 'link_id', 'linkId'));
  const establishmentClientId = stringValue(property(value, 'establishment_client_id', 'establishmentClientId'));
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const establishmentName = stringValue(property(value, 'establishment_name', 'establishmentName'));
  const displayName = stringValue(
    property(value, 'display_name', 'displayName')
      ?? property(value, 'client_display_name', 'clientDisplayName'),
  );
  const createdAt = timestampValue(property(value, 'created_at', 'createdAt'));
  const status = value.status;
  if (
    !id || !establishmentClientId || !establishmentId || !establishmentName
    || !displayName || !createdAt
    || (status !== 'pending' && status !== 'confirmed' && status !== 'rejected')
  ) return null;
  return { id, establishmentClientId, establishmentId, establishmentName, displayName, status, createdAt };
};

export const mapBusinessService = (value: unknown): BusinessService | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const name = stringValue(value.name);
  const price = numberValue(value.price);
  const durationMinutes = numberValue(property(value, 'duration_minutes', 'durationMinutes'));
  const sortOrder = numberValue(property(value, 'sort_order', 'sortOrder'));
  const rawProfessionalServices = property(value, 'professional_services', 'professionalServices');
  const professionalServices = Array.isArray(rawProfessionalServices)
    ? rawProfessionalServices.flatMap((entry): BusinessProfessionalService[] => {
      if (!isRecord(entry)) return [];
      const professionalId = stringValue(property(entry, 'professional_id', 'professionalId'));
      const professionalPrice = numberValue(entry.price);
      const professionalDuration = numberValue(property(entry, 'duration_minutes', 'durationMinutes'));
      const professionalActive = property(entry, 'is_active', 'isActive');
      if (
        !professionalId || professionalPrice === null || professionalDuration === null
        || typeof professionalActive !== 'boolean'
      ) return [];
      return [{
        professionalId,
        price: professionalPrice,
        durationMinutes: professionalDuration,
        isActive: professionalActive,
      }];
    })
    : null;
  const isActive = property(value, 'is_active', 'isActive');
  if (
    !id || !establishmentId || !name || price === null || durationMinutes === null
    || sortOrder === null || !professionalServices || typeof isActive !== 'boolean'
    || professionalServices.length !== (rawProfessionalServices as unknown[]).length
  ) return null;
  return { id, establishmentId, name, price, durationMinutes, sortOrder, professionalServices, isActive };
};

export const mapBusinessTeamMember = (value: unknown): BusinessTeamMember | null => {
  if (!isRecord(value)) return null;
  const membershipId = stringValue(property(value, 'membership_id', 'membershipId'));
  const profileId = stringValue(property(value, 'profile_id', 'profileId'));
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const name = stringValue(value.name);
  const commissionRate = numberValue(property(value, 'commission_rate', 'commissionRate'));
  const role = value.role;
  const status = value.status;
  if (
    !membershipId || !profileId || !establishmentId || !name || commissionRate === null
    || (role !== 'admin' && role !== 'professional')
    || (status !== 'active' && status !== 'suspended')
  ) return null;
  return {
    membershipId,
    profileId,
    establishmentId,
    name,
    email: nullableString(value.email ?? null),
    phone: nullableString(value.phone ?? null),
    commissionRate,
    role,
    status,
  };
};

export const mapBusinessTeamInvitation = (value: unknown): BusinessTeamInvitation | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id ?? property(value, 'invitation_id', 'invitationId'));
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const targetContact = stringValue(property(value, 'target_contact', 'targetContact'));
  const expiresAt = timestampValue(property(value, 'expires_at', 'expiresAt') ?? value.expiration);
  const invitedRole = property(value, 'invited_role', 'invitedRole') ?? value.role;
  const status = value.status ?? property(value, 'invitation_status', 'invitationStatus');
  if (
    !id || !establishmentId || !targetContact || !expiresAt
    || (invitedRole !== 'admin' && invitedRole !== 'professional')
    || (status !== 'pending' && status !== 'accepted' && status !== 'revoked' && status !== 'expired')
  ) return null;
  return { id, establishmentId, targetContact, expiresAt, invitedRole, status };
};

export const mapBusinessScheduleBlock = (value: unknown): BusinessScheduleBlock | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const establishmentId = stringValue(property(value, 'establishment_id', 'establishmentId'));
  const professionalId = stringValue(property(value, 'professional_id', 'professionalId'));
  const professionalName = nullableString(property(value, 'professional_name', 'professionalName') ?? null);
  const startsAt = timestampValue(property(value, 'starts_at', 'startsAt'));
  const endsAt = timestampValue(property(value, 'ends_at', 'endsAt'));
  const kind = value.kind;
  if (
    !id || !establishmentId || !professionalId || !startsAt || !endsAt
    || Date.parse(endsAt) <= Date.parse(startsAt)
    || (kind !== 'break' && kind !== 'time_off' && kind !== 'blocked')
  ) return null;
  const allDay = property(value, 'all_day', 'allDay') ?? false;
  const localDate = nullableString(property(value, 'local_date', 'localDate') ?? null);
  if (typeof allDay !== 'boolean') return null;
  return {
    id,
    establishmentId,
    professionalId,
    professionalName,
    startsAt,
    endsAt,
    kind,
    reason: nullableString(value.reason),
    allDay,
    localDate,
  };
};
