export type LandingAudience = 'client' | 'business' | 'observer';

export type LandingEvent =
  | { name: 'landing_viewed'; page: 'client' | 'business' }
  | { name: 'audience_selected'; audience: LandingAudience }
  | { name: 'search_started'; filterCount: number }
  | { name: 'establishment_opened'; establishmentId: string }
  | { name: 'booking_started'; establishmentId: string }
  | { name: 'business_preview_interacted'; preview: 'owner' | 'professional' }
  | { name: 'sandbox_tab_changed'; tab: string }
  | { name: 'pricing_cta_clicked'; plan: string }
  | { name: 'registration_started'; source: 'client' | 'business' | 'pricing' };

export type LandingAnalyticsAdapter = (event: LandingEvent) => void;

let adapter: LandingAnalyticsAdapter = () => undefined;

export const configureLandingAnalytics = (nextAdapter?: LandingAnalyticsAdapter) => {
  adapter = nextAdapter ?? (() => undefined);
};

export const trackLandingEvent = (event: LandingEvent) => {
  adapter(event);
};

