import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { landingColors, landingLayout, landingTypography } from '../../../theme/landing-tokens';
import { LandingPageAudience } from '../landing-content';

const FOOTER_LINKS = [
  { label: 'Cliente', href: '/', id: 'client' },
  { label: 'Estabelecimento', href: '/para-estabelecimentos', id: 'business' },
  { label: 'Entrar', href: '/(auth)/login', id: 'login' },
  { label: 'Segurança', href: null, id: 'security' },
  { label: 'Privacidade', href: '/privacy', id: 'privacy' },
  { label: 'Exclusão de conta', href: '/account-deletion', id: 'account-deletion' },
  { label: 'Contato', href: null, id: 'contact' },
] as const;

interface LandingFooterProps {
  audience: LandingPageAudience;
  onNavigate: (section: 'security' | 'contact') => void;
}

export const LandingFooter = ({ audience, onNavigate }: LandingFooterProps) => {
  const router = useRouter();

  return (
    <View testID={`landing-${audience}-footer`} style={styles.footer}>
      <View style={styles.identity}>
        <Text style={styles.brand}>CutSync</Text>
        <Text style={styles.text}>© {new Date().getFullYear()} · Vitrine e operação conectadas.</Text>
      </View>
      <View style={styles.links} {...({ role: 'navigation', 'aria-label': 'Links institucionais' } as any)}>
        {FOOTER_LINKS.map((link) => (
          <Pressable
            key={link.id}
            testID={`landing-${audience}-footer-${link.id}-link`}
            accessibilityRole="link"
            accessibilityLabel={link.label}
            onPress={() => {
              if (link.href) router.push(link.href as never);
              else onNavigate(link.id as 'security' | 'contact');
            }}
            style={styles.link}
          >
            <Text style={styles.linkText}>{link.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  footer: {
    width: '100%',
    maxWidth: landingLayout.maxWidth,
    minHeight: 160,
    paddingTop: 34,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 28,
    borderTopWidth: 1,
    borderTopColor: landingColors.border,
  },
  identity: { gap: 8 },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  text: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  links: { maxWidth: 640, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  link: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  linkText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12.5 },
});
