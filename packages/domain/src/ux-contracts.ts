export type ProductSurface = 'web_client' | 'client_mobile' | 'web_business' | 'business_mobile' | 'professional';

export type ProductEventName =
  | 'discovery_viewed'
  | 'establishment_opened'
  | 'booking_started'
  | 'availability_empty'
  | 'availability_recovery_selected'
  | 'booking_confirmed'
  | 'booking_failed'
  | 'attention_viewed'
  | 'attention_action_started'
  | 'attention_action_succeeded'
  | 'attention_action_failed'
  | 'brand_draft_saved'
  | 'brand_published'
  | 'notification_opened';

export interface ProductEvent {
  name: ProductEventName;
  surface: ProductSurface;
  role: 'client' | 'professional' | 'admin' | 'owner' | 'manager' | 'finance' | 'unknown';
  route: string;
  experienceVersion: string;
  occurredAt: string;
  anonymousSessionId?: string;
  entityReference?: string;
  properties?: Readonly<Record<string, string | number | boolean | null>>;
}

export type AttentionPriority = 'critical' | 'high' | 'normal' | 'low';

export interface AttentionItem {
  id: string;
  type: string;
  priority: AttentionPriority;
  title: string;
  description: string;
  dueAt: string | null;
  destination: string;
  allowedActions: readonly string[];
}

export interface PublicationReadiness {
  eligible: boolean;
  bookingMode: 'instant' | 'request' | 'contact';
  completenessScore: number;
  blockers: readonly string[];
  recommendations: readonly string[];
}

export interface AvailabilityRecoverySlot {
  startsAt: string;
  localDate: string;
  localTime: string;
  durationMinutes: number;
  professionalId: string;
}

export interface AvailabilityRecovery {
  requestedDate: string;
  requestedProfessionalIds: readonly string[];
  slots: readonly AvailabilityRecoverySlot[];
  nextAvailableDate: string | null;
  nearbyDates: readonly string[];
  alternativeProfessionalIds: readonly string[];
  strategy: 'same_date' | 'next_date' | 'any_professional' | 'change_service' | 'none';
  emptyReason: string | null;
}

export const UX_EVENT_FORBIDDEN_PROPERTY_PATTERN = /(name|nome|email|phone|telefone|cpf|cnpj|address|endere[cç]o|document|token|password|senha|note|observa[cç][aã]o|message|mensagem|text|texto)/i;
export const UX_EVENT_ALLOWED_PROPERTY_KEYS = [
  'sessionHash',
  'establishmentHash',
  'appointmentHash',
  'reassignmentHash',
  'notificationHash',
  'recoveryStrategy',
] as const;

export function validateProductEvent(event: ProductEvent): readonly string[] {
  const errors: string[] = [];
  if (!event.name) errors.push('event_name_required');
  if (!event.surface) errors.push('event_surface_required');
  if (!event.route.startsWith('/')) errors.push('event_route_invalid');
  if (Number.isNaN(Date.parse(event.occurredAt))) errors.push('event_occurred_at_invalid');
  for (const key of Object.keys(event.properties ?? {})) {
    if (UX_EVENT_FORBIDDEN_PROPERTY_PATTERN.test(key)) errors.push(`event_property_forbidden:${key}`);
    if (!UX_EVENT_ALLOWED_PROPERTY_KEYS.includes(key as typeof UX_EVENT_ALLOWED_PROPERTY_KEYS[number])) {
      errors.push(`event_property_unsupported:${key}`);
    }
    const value = event.properties?.[key];
    if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(value)) {
      errors.push(`event_property_unsafe:${key}`);
    }
  }
  return errors;
}
