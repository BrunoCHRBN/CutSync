import {
  mapEstablishmentClient,
  type EstablishmentClient,
  type EstablishmentClientConsentStatus,
  type EstablishmentClientLinkStatus,
  type EstablishmentClientStatus,
} from './mobile-operations';

export type {
  EstablishmentClient,
  EstablishmentClientConsentStatus,
  EstablishmentClientLinkStatus,
  EstablishmentClientStatus,
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const stringValue = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

const nullableString = (value: unknown) => {
  if (value == null) return null;
  return typeof value === 'string' ? value : null;
};

const timestampValue = (value: unknown) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return value;
};

export interface EstablishmentClientLink {
  id: string;
  profileId: string;
  matchKind: string;
  status: EstablishmentClientLinkStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface EstablishmentClientAppointmentHistory {
  appointmentId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  serviceId: string | null;
  serviceName: string;
  professionalId: string | null;
  professionalName: string;
}

export interface EstablishmentClientDetail extends EstablishmentClient {
  links: EstablishmentClientLink[];
  appointments: EstablishmentClientAppointmentHistory[];
  mergedIntoId: string | null;
  marketingConsentAt: string | null;
  externalId: string | null;
}

const mapLink = (value: unknown): EstablishmentClientLink | null => {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const profileId = stringValue(value.profileId ?? value.profile_id);
  const matchKind = stringValue(value.matchKind ?? value.match_kind) ?? 'manual';
  const status = value.status;
  const createdAt = timestampValue(value.createdAt ?? value.created_at);
  const rawRespondedAt = value.respondedAt ?? value.responded_at;
  const respondedAt = rawRespondedAt == null ? null : timestampValue(rawRespondedAt);
  if (
    !id || !profileId || !createdAt
    || (status !== 'unlinked' && status !== 'pending' && status !== 'confirmed' && status !== 'rejected')
    || (rawRespondedAt != null && !respondedAt)
  ) return null;
  return { id, profileId, matchKind, status, createdAt, respondedAt };
};

const mapAppointment = (value: unknown): EstablishmentClientAppointmentHistory | null => {
  if (!isRecord(value)) return null;
  const appointmentId = stringValue(value.appointmentId ?? value.appointment_id);
  const status = stringValue(value.status);
  const startsAt = timestampValue(value.startsAt ?? value.starts_at);
  const endsAt = timestampValue(value.endsAt ?? value.ends_at);
  const service = isRecord(value.service) ? value.service : null;
  const professional = isRecord(value.professional) ? value.professional : null;
  const serviceName = stringValue(service?.name)
    ?? stringValue(value.serviceName ?? value.service_name);
  const professionalName = stringValue(professional?.name)
    ?? stringValue(value.professionalName ?? value.professional_name);
  if (!appointmentId || !status || !startsAt || !endsAt || !serviceName || !professionalName) {
    return null;
  }
  return {
    appointmentId,
    status,
    startsAt,
    endsAt,
    serviceId: nullableString(service?.id ?? value.serviceId ?? value.service_id ?? null),
    serviceName,
    professionalId: nullableString(
      professional?.id ?? value.professionalId ?? value.professional_id ?? null,
    ),
    professionalName,
  };
};

const preferLink = (links: readonly EstablishmentClientLink[]) => {
  const rank: Record<EstablishmentClientLinkStatus, number> = {
    confirmed: 0,
    pending: 1,
    rejected: 2,
    unlinked: 3,
  };
  return [...links].sort((left, right) => rank[left.status] - rank[right.status])[0] ?? null;
};

export const mapEstablishmentClientDetail = (
  value: unknown,
): EstablishmentClientDetail | null => {
  const client = mapEstablishmentClient(value);
  if (!client || !isRecord(value) || !Array.isArray(value.appointments)) return null;

  const links = Array.isArray(value.links)
    ? value.links.flatMap((entry) => {
      const link = mapLink(entry);
      return link ? [link] : [];
    })
    : [];
  if (Array.isArray(value.links) && links.length !== value.links.length) return null;

  const appointments = value.appointments.flatMap((entry) => {
    const appointment = mapAppointment(entry);
    return appointment ? [appointment] : [];
  });
  if (appointments.length !== value.appointments.length) return null;

  const preferred = preferLink(links);
  const rawConsentAt = value.marketingConsentAt ?? value.marketing_consent_at;
  const marketingConsentAt = rawConsentAt == null ? null : timestampValue(rawConsentAt);
  if (rawConsentAt != null && !marketingConsentAt) return null;

  return {
    ...client,
    linkStatus: preferred?.status ?? client.linkStatus,
    linkedProfileId: preferred?.status === 'confirmed'
      ? preferred.profileId
      : client.linkedProfileId,
    links,
    appointments,
    mergedIntoId: nullableString(value.mergedIntoId ?? value.merged_into_id ?? null),
    marketingConsentAt,
    externalId: nullableString(value.externalId ?? value.external_id ?? null),
  };
};
