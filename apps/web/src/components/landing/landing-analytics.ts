import { LandingCapabilityId } from './landing-capabilities';

export type LandingAudience = 'client' | 'business' | 'observer';

export type LandingEvent =
  | { name: 'landing_viewed'; page: 'client' | 'business' }
  /** @deprecated Compatibilidade temporária com integrações anteriores à navegação em duas rotas. */
  | { name: 'audience_selected'; audience: LandingAudience }
  | { name: 'search_started'; filterCount: number }
  | { name: 'establishment_opened'; establishmentId: string }
  | { name: 'booking_started'; establishmentId: string }
  | { name: 'business_preview_interacted'; preview: 'owner' | 'professional' }
  | { name: 'sandbox_tab_changed'; tab: LandingCapabilityId }
  | { name: 'registration_started'; source: 'client' | 'business' };

export type LandingAnalyticsAdapter = (event: LandingEvent) => void;

let adapter: LandingAnalyticsAdapter = () => undefined;

export const configureLandingAnalytics = (nextAdapter?: LandingAnalyticsAdapter) => {
  adapter = nextAdapter ?? (() => undefined);
};

export const trackLandingEvent = (event: LandingEvent) => {
  adapter(event);
};
