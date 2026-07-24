import { LandingCapabilityId } from './landing-capabilities';

export type LandingAudience = 'client' | 'business' | 'observer';
export type LandingPage = 'client' | 'business';
export type LandingCtaPosition = 'hero_primary' | 'hero_secondary' | 'final' | 'header' | 'footer';
export type LandingCtaDestination = 'search' | 'journey' | 'demo' | 'registration' | 'login' | 'client' | 'business' | 'privacy' | 'account_deletion';
export type LandingSection = 'search' | 'journey' | 'connected_platform' | 'comparison' | 'demo' | 'roles' | 'faq';

export type LandingEvent =
  | { name: 'landing_viewed'; page: LandingPage }
  | { name: 'cta_clicked'; page: LandingPage; position: LandingCtaPosition; destination: LandingCtaDestination }
  | { name: 'section_viewed'; page: LandingPage; section: LandingSection }
  | { name: 'scroll_depth_reached'; page: LandingPage; depth: 50 | 100 }
  | { name: 'access_selector_opened'; source: 'client' | 'business' }
  | { name: 'access_path_selected'; source: 'client' | 'business'; path: 'client' | 'business' | 'establishment' }
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
