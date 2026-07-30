import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowUpRight } from 'lucide-react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingPageAudience, LandingSectionId } from '../landing-content';
import { LandingSectionShell } from './section-shell';

interface ResourcesHubProps {
  audience: LandingPageAudience;
  onNavigate: (section: LandingSectionId) => void;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const ResourcesHub = ({ audience, onNavigate, onLayout, onReveal }: ResourcesHubProps) => {
  const router = useRouter();
  const content = LANDING_CONTENT[audience].resources;

  return (
    <LandingSectionShell
      id="resources"
      testID={`landing-${audience}-resources`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <StaggerGroup style={styles.grid}>
        {content.cards.map((card, index) => (
          <StaggerItem key={card.id} index={index % 5} style={styles.cell}>
            <Pressable
              testID={`landing-${audience}-resource-${card.id}`}
              accessibilityRole="link"
              accessibilityLabel={`${card.title}: ${card.action}`}
              onPress={() => {
                if (card.target === 'route') router.push(card.reference as never);
                else onNavigate(card.reference as LandingSectionId);
              }}
              style={({ hovered, pressed }: any) => [styles.card, hovered && styles.cardHovered, pressed && styles.cardPressed]}
            >
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardText}>{card.description}</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardAction}>{card.action}</Text>
                <ArrowUpRight size={15} color={landingColors.brand} />
              </View>
            </Pressable>
          </StaggerItem>
        ))}
      </StaggerGroup>
      <Text style={styles.note}>Esta central reúne orientações desta página e documentos públicos. Não é um blog nem um catálogo de conteúdo externo.</Text>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cell: { flex: 1, minWidth: 240 },
  card: {
    minHeight: 190,
    padding: 22,
    gap: 10,
    borderRadius: landingRadii.lg,
    borderWidth: 1,
    borderColor: landingColors.border,
    backgroundColor: landingColors.surface,
  },
  cardHovered: { transform: [{ translateY: -3 }], borderColor: landingColors.brand },
  cardPressed: { opacity: 0.85 },
  cardTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 19 },
  cardText: { flex: 1, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardAction: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  note: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 19 },
});
