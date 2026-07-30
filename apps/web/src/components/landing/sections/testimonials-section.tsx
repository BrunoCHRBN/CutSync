import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Quote } from 'lucide-react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { LandingPageAudience } from '../landing-content';
import { getApprovedTestimonials } from '../landing-testimonials';
import { LandingSectionShell } from './section-shell';

interface TestimonialsSectionProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const TestimonialsSection = ({ audience, onLayout, onReveal }: TestimonialsSectionProps) => {
  const testimonials = getApprovedTestimonials(audience);
  if (testimonials.length === 0) return null;

  return (
    <LandingSectionShell
      id="testimonials"
      testID={`landing-${audience}-testimonials`}
      eyebrow="DEPOIMENTOS"
      title="Quem já usa o CutSync."
      description="Publicamos apenas relatos reais com autorização editorial registrada."
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <View style={styles.grid}>
        {testimonials.map((testimonial) => (
          <View key={testimonial.id} testID={`landing-testimonial-${testimonial.id}`} style={styles.card}>
            <Quote size={18} color={landingColors.accent} />
            <Text style={styles.quote}>{testimonial.quote}</Text>
            <Text style={styles.person}>{testimonial.personName} · {testimonial.personRole}</Text>
          </View>
        ))}
      </View>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  card: {
    flex: 1,
    minWidth: 280,
    padding: 24,
    gap: 14,
    borderRadius: landingRadii.lg,
    borderWidth: 1,
    borderColor: landingColors.border,
    backgroundColor: landingColors.surface,
  },
  quote: { color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 24 },
  person: { color: landingColors.inkMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
