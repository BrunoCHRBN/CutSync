const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isStringArray = (value: unknown): value is string[] => (
  Array.isArray(value) && value.every((item) => typeof item === 'string')
);

export interface BusinessAttentionReadModelItem {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  dueAt: string | null;
  title: string;
  description: string;
  route: string;
  allowedActions: string[];
}

export interface BusinessCommandCenterReadModel {
  establishmentId: string;
  localDate: string;
  generatedAt: string;
  allowedActions: string[];
  items: BusinessAttentionReadModelItem[];
}

const parseAttentionItem = (value: unknown): BusinessAttentionReadModelItem | null => {
  if (!isRecord(value)) return null;
  const priorities = ['critical', 'high', 'normal', 'low'] as const;
  if (
    typeof value.id !== 'string'
    || typeof value.type !== 'string'
    || !priorities.includes(value.priority as typeof priorities[number])
    || (value.dueAt !== null && typeof value.dueAt !== 'string')
    || typeof value.title !== 'string'
    || typeof value.description !== 'string'
    || typeof value.route !== 'string'
    || !isStringArray(value.allowedActions)
  ) return null;
  return value as unknown as BusinessAttentionReadModelItem;
};

export function parseBusinessCommandCenter(value: unknown): BusinessCommandCenterReadModel | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const items = value.items.map(parseAttentionItem);
  if (
    items.some((item) => item === null)
    || typeof value.establishmentId !== 'string'
    || typeof value.localDate !== 'string'
    || typeof value.generatedAt !== 'string'
    || !isStringArray(value.allowedActions)
  ) return null;
  return { ...value, items } as BusinessCommandCenterReadModel;
}

export interface ProfessionalDailyFocusItem {
  appointmentId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  updatedAt: string;
  durationMinutes: number;
  status: 'pending' | 'confirmed';
  clientDisplayName: string;
  serviceName: string;
  allowedActions: string[];
}

export function parseProfessionalDailyFocus(value: unknown): ProfessionalDailyFocusItem[] | null {
  if (!isRecord(value) || !Array.isArray(value.appointments)) return null;
  const appointments = value.appointments.filter((item): item is ProfessionalDailyFocusItem => {
    if (!isRecord(item)) return false;
    return typeof item.appointmentId === 'string'
      && typeof item.serviceId === 'string'
      && typeof item.startsAt === 'string'
      && typeof item.endsAt === 'string'
      && typeof item.updatedAt === 'string'
      && typeof item.durationMinutes === 'number'
      && (item.status === 'pending' || item.status === 'confirmed')
      && typeof item.clientDisplayName === 'string'
      && typeof item.serviceName === 'string'
      && isStringArray(item.allowedActions);
  });
  return appointments.length === value.appointments.length ? appointments : null;
}

export interface PublicationReadinessReadModel {
  eligible: boolean;
  bookingMode: 'instant' | 'request' | 'contact';
  completenessScore: number;
  blockers: string[];
  recommendations: string[];
  discoveryStatus?: string;
  publishedAt?: string | null;
}

export function parsePublicationReadiness(value: unknown): PublicationReadinessReadModel | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.eligible !== 'boolean'
    || !['instant', 'request', 'contact'].includes(String(value.bookingMode))
    || typeof value.completenessScore !== 'number'
    || value.completenessScore < 0
    || value.completenessScore > 100
    || !isStringArray(value.blockers)
    || !isStringArray(value.recommendations)
  ) return null;
  return value as unknown as PublicationReadinessReadModel;
}

export interface AvailabilityRecoveryReadModelRow {
  professionalId: string;
  localDate: string;
  startsAt: string;
  localTime: string;
  durationMinutes: number;
  recoveryRank: number;
}

export function parseAvailabilityRecoveryRows(value: unknown): AvailabilityRecoveryReadModelRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value.flatMap((item): AvailabilityRecoveryReadModelRow[] => {
    if (!isRecord(item)) return [];
    const professionalId = item.professional_id;
    const localDate = item.local_date;
    const startsAt = item.starts_at;
    const localTime = item.local_time;
    const durationMinutes = Number(item.duration_minutes);
    const recoveryRank = Number(item.recovery_rank);
    if (
      typeof professionalId !== 'string'
      || typeof localDate !== 'string'
      || typeof startsAt !== 'string'
      || typeof localTime !== 'string'
      || !Number.isFinite(durationMinutes)
      || !Number.isFinite(recoveryRank)
    ) return [];
    return [{ professionalId, localDate, startsAt, localTime, durationMinutes, recoveryRank }];
  });
  return rows.length === value.length ? rows : null;
}

export interface PublicEstablishmentExperienceReadModel {
  establishment: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    slogan: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    galleryUrls: unknown[];
    primaryColor: string | null;
    address: string | null;
    phone: string | null;
    timezone: string;
    currency: string;
    openingHours: string | null;
    instantBookingEnabled: boolean;
    publishedAt: string | null;
  };
  services: unknown[];
  team: unknown[];
  bookingMode: 'instant' | 'request' | 'contact';
}

export function parsePublicEstablishmentExperience(value: unknown): PublicEstablishmentExperienceReadModel | null {
  if (!isRecord(value) || !isRecord(value.establishment)) return null;
  const establishment = value.establishment;
  if (
    typeof establishment.id !== 'string'
    || typeof establishment.slug !== 'string'
    || typeof establishment.name !== 'string'
    || !Array.isArray(establishment.galleryUrls)
    || typeof establishment.timezone !== 'string'
    || typeof establishment.currency !== 'string'
    || typeof establishment.instantBookingEnabled !== 'boolean'
    || !Array.isArray(value.services)
    || !Array.isArray(value.team)
    || !['instant', 'request', 'contact'].includes(String(value.bookingMode))
  ) return null;
  const nullableStrings = [
    establishment.description,
    establishment.slogan,
    establishment.logoUrl,
    establishment.bannerUrl,
    establishment.primaryColor,
    establishment.address,
    establishment.phone,
    establishment.openingHours,
    establishment.publishedAt,
  ];
  if (nullableStrings.some((item) => item !== null && typeof item !== 'string')) return null;
  return value as unknown as PublicEstablishmentExperienceReadModel;
}
