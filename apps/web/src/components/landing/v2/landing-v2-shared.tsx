// Design: primitivos de landing v2 — hierarquia editorial (Fraunces) + grids fluidos
// 1/2/3, espaçamento vertical responsivo (sectionGap) e reveal sutil estilo Superhuman.
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronDown,
  LogIn,
  Scissors,
  ShieldCheck,
  Star,
} from 'lucide-react-native';
import {
  landingColors,
  landingLayout,
  landingRadii,
  landingTypography,
} from '../../../theme/landing-tokens';
import { resolveCellWidth, resolveTypeSize, useLandingLayout } from '../landing-layout';
import { MagneticButton, MaskedReveal, SectionReveal, StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LandingSectionId } from '../landing-content';

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

export interface V2NavItem {
  id: LandingSectionId;
  label: string;
}

/** Largura útil centralizada. Todas as seções usam isto para respeitar o maxWidth. */
export const V2Container = ({ children, style }: { children: React.ReactNode; style?: any }) => {
  const { paddingX } = useLandingLayout();
  return (
    <View style={[styles.container, { paddingHorizontal: paddingX }, style]}>
      <View style={styles.containerInner}>{children}</View>
    </View>
  );
};

export const V2Eyebrow = ({ children, tone = 'brand' }: { children: React.ReactNode; tone?: 'brand' | 'accent' | 'muted' }) => (
  <Text style={[styles.eyebrow, tone === 'accent' && styles.eyebrowAccent, tone === 'muted' && styles.eyebrowMuted]}>{children}</Text>
);

export const V2SectionHeading = ({
  eyebrow,
  title,
  description,
  align = 'left',
  detail,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  align?: 'left' | 'center';
  detail?: React.ReactNode;
}) => {
  const { breakpoint } = useLandingLayout();
  const titleSize = resolveTypeSize('sectionTitle', breakpoint);
  const headingGap = breakpoint === 'desktop' ? 48 : breakpoint === 'tablet' ? 42 : 34;
  return (
    <View style={[styles.heading, align === 'center' && styles.headingCenter, { marginBottom: headingGap }]}>
      {eyebrow ? <V2Eyebrow>{eyebrow}</V2Eyebrow> : null}
      {title ? (
        <MaskedReveal>
          <Text style={[styles.headingTitle, { fontSize: titleSize, lineHeight: titleSize * 1.16, letterSpacing: titleSize * -0.028 }]}>{title}</Text>
        </MaskedReveal>
      ) : null}
      {description ? <Text style={[styles.headingDescription, align === 'center' && styles.headingDescriptionCenter]}>{description}</Text> : null}
      {detail}
    </View>
  );
};

export const V2Section = ({
  id,
  eyebrow,
  title,
  description,
  align = 'left',
  children,
  onLayout,
  onReveal,
  testID,
  detail,
}: {
  id: LandingSectionId;
  eyebrow?: string;
  title?: string;
  description?: string;
  align?: 'left' | 'center';
  children?: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  onReveal?: () => void;
  testID?: string;
  detail?: React.ReactNode;
}) => {
  const { sectionGap, gutter } = useLandingLayout();
  const sectionPad = Math.round(sectionGap * 0.8);
  return (
    <SectionReveal testID={testID} onLayout={onLayout} onReveal={onReveal} style={[styles.section, { paddingVertical: sectionPad, gap: gutter * 1.5 }]}>
      {(eyebrow || title || description) && (
        <V2SectionHeading eyebrow={eyebrow} title={title} description={description} align={align} detail={detail} />
      )}
      {children}
    </SectionReveal>
  );
};

export const V2BrandMark = () => (
  <View style={styles.brandRow}>
    <View style={styles.brandMark}><Scissors size={17} color={landingColors.white} /></View>
    <Text style={styles.brand}>CutSync</Text>
  </View>
);

export const V2Header = ({
  audience,
  navItems,
  onNavigate,
}: {
  audience: 'client' | 'business';
  navItems: readonly V2NavItem[];
  onNavigate: (section: LandingSectionId) => void;
}) => {
  const router = useRouter();
  const { isDesktop, paddingX } = useLandingLayout();
  return (
    <View style={styles.header} testID={`v2-landing-${audience}-header`}>
      <View style={[styles.headerInner, { paddingHorizontal: paddingX }]}>
        <V2BrandMark />
        {isDesktop && (
          <View style={styles.nav}>
            {navItems.map((item) => (
              <Pressable
                key={item.id}
                testID={`v2-nav-${item.id}`}
                accessibilityRole="link"
                onPress={() => onNavigate(item.id)}
                style={styles.navLink}
              >
                <Text style={styles.navLinkText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <View style={styles.headerActions}>
          {audience === 'business' && isDesktop && (
            <Pressable testID="v2-business-client-link" accessibilityRole="link" onPress={() => router.push('/' as never)} style={styles.headerLink}>
              <Text style={styles.headerLinkText}>Encontrar um serviço</Text>
            </Pressable>
          )}
          {audience === 'client' && isDesktop && (
            <Pressable testID="v2-client-business-link" accessibilityRole="link" onPress={() => router.push('/para-estabelecimentos' as never)} style={styles.headerLink}>
              <BriefcaseBusiness size={16} color={landingColors.inkSecondary} />
              <Text style={styles.headerLinkText}>Para estabelecimentos</Text>
            </Pressable>
          )}
          <Pressable
            testID={`v2-${audience}-account-button`}
            accessibilityRole="button"
            onPress={() => router.push((audience === 'business'
              ? { pathname: '/(auth)/login', params: { audience: 'business' } }
              : { pathname: '/(auth)/login', params: { audience: 'client' } }) as never)}
            style={styles.accountButton}
          >
            <LogIn size={16} color={landingColors.brand} />
            <Text style={styles.accountButtonText}>{audience === 'business' ? 'Acessar painel' : 'Entrar'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export const V2Footer = ({ audience, onNavigate }: { audience: 'client' | 'business'; onNavigate?: (section: LandingSectionId) => void }) => {
  const router = useRouter();
  const { paddingX } = useLandingLayout();
  const columns: { title: string; links: { label: string; onPress: () => void }[] }[] = [
    {
      title: 'Produto',
      links: [
        { label: audience === 'business' ? 'Recursos' : 'Como funciona', onPress: () => onNavigate?.('how_to_start') },
        { label: 'Segurança', onPress: () => onNavigate?.('security') },
        { label: 'Perguntas frequentes', onPress: () => onNavigate?.('faq') },
        { label: 'Contato', onPress: () => onNavigate?.('contact') },
      ],
    },
    {
      title: 'Para você',
      links: [
        { label: 'Explorar serviços', onPress: () => (audience === 'client' ? onNavigate?.('search') : router.push('/' as never)) },
        { label: 'Abrir minha conta', onPress: () => router.push({ pathname: '/(auth)/login', params: { audience: 'client' } } as never) },
        { label: 'Privacidade', onPress: () => router.push('/privacy' as never) },
        { label: 'Excluir conta', onPress: () => router.push('/account-deletion' as never) },
      ],
    },
    {
      title: 'Para negócios',
      links: [
        { label: 'Criar estabelecimento', onPress: () => router.push({ pathname: '/(auth)/register', params: { intent: 'establishment', redirect: '/(client)/request-establishment' } } as never) },
        { label: 'Acessar painel', onPress: () => router.push({ pathname: '/(auth)/login', params: { audience: 'business' } } as never) },
        { label: 'Página para negócios', onPress: () => router.push('/para-estabelecimentos' as never) },
      ],
    },
  ];
  return (
    <View testID={`v2-landing-${audience}-footer`} style={[styles.footer, { paddingHorizontal: paddingX }]}>
      <View style={styles.footerInner}>
        <View style={styles.footerBrand}>
          <V2BrandMark />
          <Text style={styles.footerTagline}>Agendamento que respeita o tempo de todos.</Text>
        </View>
        <View style={styles.footerColumns}>
          {columns.map((column) => (
            <View key={column.title} style={styles.footerColumn}>
              <Text style={styles.footerColumnTitle}>{column.title}</Text>
              {column.links.map((link) => (
                <Pressable key={link.label} onPress={link.onPress} style={styles.footerLink}>
                  <Text style={styles.footerLinkText}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.footerBase}>
        <Text style={styles.footerCopy}>© {new Date().getFullYear()} CutSync</Text>
        <View style={styles.footerBaseLinks}>
          <Pressable onPress={() => router.push('/privacy' as never)}><Text style={styles.footerCopy}>Privacidade</Text></Pressable>
          <Text style={styles.footerDot}>·</Text>
          <Pressable onPress={() => router.push('/security' as never)}><Text style={styles.footerCopy}>Segurança</Text></Pressable>
        </View>
      </View>
    </View>
  );
};

export const V2StepList = ({ steps }: { steps: readonly { title: string; description: string }[] }) => {
  const { gutter, contentWidth, columns } = useLandingLayout();
  const cellWidth = resolveCellWidth(contentWidth, Math.min(steps.length, columns), gutter, 3);
  return (
    <StaggerGroup style={[styles.stepGrid, { gap: gutter }]}>
      {steps.map((step, index) => (
        <StaggerItem key={step.title} index={index} style={[styles.stepItem, { width: cellWidth }]}>
          <View style={styles.stepIndex}><Text style={styles.stepIndexText}>{`0${index + 1}`}</Text></View>
          <Text style={styles.stepTitle}>{step.title}</Text>
          <Text style={styles.stepDescription}>{step.description}</Text>
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
};

export const V2FeatureGrid = ({ items }: { items: readonly { title: string; description: string; icon?: IconComponent }[] }) => {
  const { gutter, contentWidth, columns } = useLandingLayout();
  const cellWidth = resolveCellWidth(contentWidth, Math.min(items.length, columns), gutter, 3);
  return (
    <StaggerGroup style={[styles.featureGrid, { gap: gutter }]}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <StaggerItem key={item.title} index={index} style={[styles.featureCard, { width: cellWidth }]}>
            {Icon ? (
              <View style={styles.featureIcon}><Icon size={20} color={landingColors.brand} strokeWidth={1.7} /></View>
            ) : null}
            <Text style={styles.featureTitle}>{item.title}</Text>
            <Text style={styles.featureDescription}>{item.description}</Text>
          </StaggerItem>
        );
      })}
    </StaggerGroup>
  );
};

export const V2Ecosystem = ({ steps, note }: { steps: readonly { role: string; title: string; description: string }[]; note?: string }) => {
  const { gutter, contentWidth, columns } = useLandingLayout();
  const cellWidth = resolveCellWidth(contentWidth, Math.min(steps.length, columns), gutter, 3);
  return (
    <View>
      <StaggerGroup style={[styles.ecosystemGrid, { gap: gutter }]}>
        {steps.map((step, index) => (
          <StaggerItem key={step.title} index={index} style={[styles.ecosystemCard, { width: cellWidth }]}>
            <View style={styles.ecosystemStep}><Text style={styles.ecosystemStepText}>{`0${index + 1}`}</Text></View>
            <View style={styles.ecosystemRoleChip}><Text style={styles.ecosystemRoleText}>{step.role}</Text></View>
            <Text style={styles.ecosystemTitle}>{step.title}</Text>
            <Text style={styles.ecosystemDescription}>{step.description}</Text>
          </StaggerItem>
        ))}
      </StaggerGroup>
      {note ? <Text style={styles.ecosystemNote}>{note}</Text> : null}
    </View>
  );
};

export const V2SecurityList = ({ items }: { items: readonly { title: string; description: string }[] }) => {
  const { gutter } = useLandingLayout();
  return (
    <StaggerGroup style={[styles.securityList, { gap: gutter }]}>
      {items.map((item, index) => (
        <StaggerItem key={item.title} index={index} style={styles.securityItem}>
          <View style={styles.securityIcon}><ShieldCheck size={18} color={landingColors.brand} strokeWidth={1.7} /></View>
          <View style={styles.securityCopy}>
            <Text style={styles.securityTitle}>{item.title}</Text>
            <Text style={styles.securityDescription}>{item.description}</Text>
          </View>
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
};

export const V2BrandValues = ({ values }: { values: readonly { title: string; description: string }[] }) => {
  const { breakpoint, gutter, contentWidth, columns } = useLandingLayout();
  const valueColumns = breakpoint === 'phone' ? 1 : 2;
  const cellWidth = resolveCellWidth(contentWidth, Math.min(values.length, valueColumns), gutter, 2);
  return (
    <StaggerGroup style={[styles.valuesGrid, { gap: gutter }]}>
      {values.map((value, index) => (
        <StaggerItem key={value.title} index={index} style={[styles.valueCard, { width: cellWidth }]}>
          <Text style={styles.valueTitle}>{value.title}</Text>
          <Text style={styles.valueDescription}>{value.description}</Text>
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
};

export const V2Faq = ({ entries }: { entries: readonly { question: string; answer: string }[] }) => {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <View style={styles.faqList}>
      {entries.map((entry, index) => {
        const isOpen = open === index;
        return (
          <View key={entry.question} style={[styles.faqItem, isOpen && styles.faqItemOpen]}>
            <Pressable
              testID={`v2-faq-${index}`}
              accessibilityRole="button"
              onPress={() => setOpen(isOpen ? null : index)}
              style={styles.faqQuestion}
            >
              <Text style={styles.faqQuestionText}>{entry.question}</Text>
              <ChevronDown size={18} color={landingColors.inkSecondary} style={isOpen ? { transform: [{ rotate: '180deg' }] } : undefined} />
            </Pressable>
            {isOpen && <Text style={styles.faqAnswer}>{entry.answer}</Text>}
          </View>
        );
      })}
    </View>
  );
};

export const V2CtaBand = ({
  eyebrow,
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  variant = 'light',
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  variant?: 'light' | 'brand';
}) => (
  <View style={[styles.ctaBand, variant === 'brand' ? styles.ctaBandBrand : null]}>
    <View style={styles.ctaCopy}>
      {eyebrow ? <V2Eyebrow tone={variant === 'brand' ? 'accent' : 'brand'}>{eyebrow}</V2Eyebrow> : null}
      <Text style={[styles.ctaTitle, variant === 'brand' && styles.ctaTitleBrand]}>{title}</Text>
      {description ? <Text style={[styles.ctaDescription, variant === 'brand' && styles.ctaDescriptionBrand]}>{description}</Text> : null}
    </View>
    <View style={styles.ctaActions}>
      <MagneticButton label={primaryLabel} onPress={onPrimary} testID="v2-cta-primary" inverse={variant === 'brand'} />
      {secondaryLabel && onSecondary ? (
        <MagneticButton label={secondaryLabel} secondary onPress={onSecondary} testID="v2-cta-secondary" />
      ) : null}
    </View>
  </View>
);

export const V2Testimonial = ({ quote, author }: { quote: string; author: string }) => (
  <View style={styles.testimonial}>
    <Star size={20} color={landingColors.accent} fill={landingColors.accent} />
    <Text style={styles.testimonialQuote}>{quote}</Text>
    <Text style={styles.testimonialAuthor}>{author}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { width: '100%' },
  containerInner: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center' },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11.5, letterSpacing: 2, textTransform: 'uppercase' },
  eyebrowAccent: { color: landingColors.accent },
  eyebrowMuted: { color: landingColors.inkMuted },
  heading: { maxWidth: 760, gap: 14 },
  headingCenter: { maxWidth: 760, alignSelf: 'center', alignItems: 'center', textAlign: 'center' },
  headingTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold },
  headingDescription: { maxWidth: 640, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 16, lineHeight: 26 },
  headingDescriptionCenter: { textAlign: 'center' },
  section: { width: '100%' },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brand },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 21 },

  header: { borderBottomWidth: 1, borderColor: landingColors.border, backgroundColor: landingColors.surface, zIndex: 20 },
  headerInner: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 66, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navLink: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  navLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13.5 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  headerLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  accountButton: { minHeight: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: landingColors.borderStrong, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  accountButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },

  footer: { borderTopWidth: 1, borderTopColor: landingColors.border, backgroundColor: landingColors.canvasWarm },
  footerInner: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', paddingVertical: 48, flexDirection: 'row', flexWrap: 'wrap', gap: 40 },
  footerBrand: { flex: 1, minWidth: 220, gap: 14 },
  footerTagline: { maxWidth: 260, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
  footerColumns: { flex: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  footerColumn: { minWidth: 150, gap: 12 },
  footerColumnTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  footerLink: { paddingVertical: 4 },
  footerLinkText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 13 },
  footerBase: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', paddingVertical: 20, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  footerCopy: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerBaseLinks: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerDot: { color: landingColors.inkMuted },

  stepGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  stepItem: { padding: 22, gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  stepIndex: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  stepIndexText: { color: landingColors.brand, fontFamily: landingTypography.mono, fontSize: 14 },
  stepTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 17 },
  stepDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },

  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  featureCard: { padding: 22, gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  featureIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  featureTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  featureDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13.5, lineHeight: 21 },

  ecosystemGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  ecosystemCard: { padding: 22, gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  ecosystemStep: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.canvasWarm },
  ecosystemStepText: { color: landingColors.inkMuted, fontFamily: landingTypography.mono, fontSize: 12 },
  ecosystemRoleChip: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 5, borderRadius: landingRadii.pill, backgroundColor: landingColors.accentSoft },
  ecosystemRoleText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11.5, letterSpacing: 0.4 },
  ecosystemTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  ecosystemDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13.5, lineHeight: 21 },
  ecosystemNote: { marginTop: 18, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 13 },

  securityList: { flexDirection: 'row', flexWrap: 'wrap' },
  securityItem: { flex: 1, minWidth: 260, flexDirection: 'row', gap: 14, padding: 18, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  securityIcon: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  securityCopy: { flex: 1, gap: 5 },
  securityTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  securityDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13.5, lineHeight: 20 },

  valuesGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  valueCard: { padding: 22, gap: 9, borderLeftWidth: 2, borderLeftColor: landingColors.accent, borderRadius: landingRadii.md, backgroundColor: landingColors.surfaceSoft },
  valueTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 19 },
  valueDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13.5, lineHeight: 21 },

  faqList: { gap: 12 },
  faqItem: { borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface, overflow: 'hidden' },
  faqItemOpen: { borderColor: landingColors.borderStrong },
  faqQuestion: { minHeight: 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  faqQuestionText: { flex: 1, color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 14.5, lineHeight: 20 },
  faqAnswer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 2, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },

  ctaBand: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24, paddingVertical: 40, paddingHorizontal: 40, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surfaceSoft },
  ctaBandBrand: { backgroundColor: landingColors.brandStrong },
  ctaCopy: { flex: 1, minWidth: 240, gap: 12, maxWidth: 620 },
  ctaTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.8 },
  ctaTitleBrand: { color: landingColors.white },
  ctaDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 23 },
  ctaDescriptionBrand: { color: landingColors.onBrand },
  ctaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  testimonial: { flex: 1, minWidth: 260, padding: 24, gap: 14, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  testimonialQuote: { color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 24 },
  testimonialAuthor: { color: landingColors.inkMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 12.5 },
});

export const V2Arrow = () => <ArrowRight size={16} color={landingColors.white} />;
