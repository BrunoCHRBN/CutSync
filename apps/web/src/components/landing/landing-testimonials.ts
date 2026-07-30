import { LandingPageAudience } from './landing-content';

export interface LandingTestimonialApproval {
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
}

export interface LandingTestimonial {
  id: string;
  audience: LandingPageAudience;
  quote: string;
  personName: string;
  personRole: string;
  editorialApproval: LandingTestimonialApproval;
}

/** Vazio por decisão editorial: nenhum depoimento é publicado sem autorização real. */
export const LANDING_TESTIMONIALS: readonly LandingTestimonial[] = [] as const;

export const getApprovedTestimonials = (audience: LandingPageAudience): readonly LandingTestimonial[] =>
  LANDING_TESTIMONIALS.filter((testimonial) => (
    testimonial.audience === audience
    && testimonial.editorialApproval.approved === true
    && Boolean(testimonial.editorialApproval.approvedBy)
    && Boolean(testimonial.editorialApproval.approvedAt)
    && testimonial.quote.trim().length > 0
  ));
