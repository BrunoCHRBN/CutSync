import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FileLock2, KeyRound, ShieldCheck, UserCog } from 'lucide-react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

const ICONS = [UserCog, ShieldCheck, KeyRound, FileLock2] as const;

interface SecurityPrivacyProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const SecurityPrivacy = ({ audience, onLayout, onReveal }: SecurityPrivacyProps) => {
  const router = useRouter();
  const content = LANDING_CONTENT[audience].security;

  return (
    <LandingSectionShell
      id="security"
      testID={`landing-${audience}-security`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <StaggerGroup style={styles.grid}>
        {content.items.map((item, index) => {
          const Icon = ICONS[index % ICONS.length];
          return (
            <StaggerItem key={item.title} index={index} style={styles.item}>
              <Icon size={19} color={landingColors.accent} />
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemText}>{item.description}</Text>
            </StaggerItem>
          );
        })}
      </StaggerGroup>
      <View style={styles.links}>
        {[
          ['Política de privacidade', '/privacy', `landing-${audience}-privacy-link`],
          ['Exclusão de conta', '/account-deletion', `landing-${audience}-account-deletion-link`],
        ].map(([label, href, testID]) => (
          <Pressable key={label} testID={testID} accessibilityRole="link" onPress={() => router.push(href as never)} style={styles.link}>
            <Text style={styles.linkText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  item: {
    flex: 1,
    minWidth: 240,
    minHeight: 180,
    padding: 22,
    gap: 11,
    borderRadius: landingRadii.lg,
    backgroundColor: landingColors.brandStrong,
  },
  itemTitle: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  itemText: { color: landingColors.onBrand, fontFamily: landingTypography.body, fontSize: 12.5, lineHeight: 19 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  link: {
    minHeight: 44,
    paddingHorizontal: 18,
    justifyContent: 'center',
    borderRadius: landingRadii.pill,
    borderWidth: 1,
    borderColor: landingColors.borderStrong,
    backgroundColor: landingColors.surface,
  },
  linkText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
});
