import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  Award,
  Check,
  Scissors,
  UserRound,
  Zap,
} from 'lucide-react-native';
import { AppButton } from '../components/ui/AppButton';
import { AppCard } from '../components/ui/AppCard';
import { AgendaSandbox } from '../components/landing/sandbox/AgendaSandbox';
import { CommissionsSandbox } from '../components/landing/sandbox/CommissionsSandbox';
import { EmergencySwapSandbox } from '../components/landing/sandbox/EmergencySwapSandbox';
import { GspValidationSandbox } from '../components/landing/sandbox/GspValidationSandbox';
import { colors, layout, radii, typography, typeScale } from '../theme/tokens';

/* ────────────────────────────────────────────────────────────────────────────
   LANDING PAGE B2B — /para-estabelecimentos
   SaaS do Gestor: proposta de valor, live sandbox e onboarding.
   ──────────────────────────────────────────────────────────────────────────── */

const SANDBOX_TABS = [
  { id: 'agenda', label: 'Agenda de Balcão' },
  { id: 'comissoes', label: 'Comissões' },
  { id: 'contingencia', label: 'Contingência' },
  { id: 'antifraude', label: 'Antifraude GSP' },
] as const;

type SandboxTabId = (typeof SANDBOX_TABS)[number]['id'];

export default function BusinessLandingPage() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.mobileBreakpoint;

  // Sandbox tab state
  const [activeSandboxTab, setActiveSandboxTab] = useState<SandboxTabId>('agenda');

  // ROI Simulator
  const [roiStaffCount, setRoiStaffCount] = useState(4);
  const hoursSaved = roiStaffCount * 18;
  const revenueGain = roiStaffCount * 1450;

  // Triage
  const [triageInput, setTriageInput] = useState('');

  return (
    <View style={styles.root}>
      {/* ─── HEADER ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.logoRow}>
            <Scissors size={22} color={colors.brandPrimary} />
            <Text style={styles.logoText}>
              Cut<Text style={styles.logoAccent}>Sync</Text>
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>PARA NEGÓCIOS</Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            {isDesktop && (
              <Pressable
                style={styles.headerLink}
                onPress={() => router.push('/' as any)}
              >
                <UserRound size={14} color={colors.textSecondary} />
                <Text style={styles.headerLinkText}>Sou Cliente</Text>
              </Pressable>
            )}

            <AppButton
              testID="b2b-panel-btn"
              label="Acessar Painel"
              variant="secondary"
              size="sm"
              onPress={() => router.push('/(auth)/login' as any)}
            />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* ─── HERO ──────────────────────────────────────────────── */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>
              Menos ruído na recepção.{'\n'}
              <Text style={styles.heroHighlight}>Mais cadeira ocupada.</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              Automatize agendamentos, comissões, faltas e validações antifraude.{'\n'}
              Concentre sua equipe no que gera receita.
            </Text>
            <View style={styles.heroCtas}>
              <AppButton
                label="Cadastrar Meu Estabelecimento"
                icon={<ArrowRight size={16} color={colors.ink} />}
                iconPosition="right"
                onPress={() => router.push('/(auth)/register' as any)}
              />
              <AppButton
                label="Experimentar Demonstração"
                variant="secondary"
                onPress={() => setActiveSandboxTab('agenda')}
              />
            </View>
          </View>

          {/* ─── LIVE SANDBOX ──────────────────────────────────────── */}
          <View style={styles.sandboxSection}>
            <View style={styles.sandboxHeader}>
              <View style={styles.liveTag}>
                <Zap size={13} color={colors.brandPrimary} />
                <Text style={styles.liveTagText}>LIVE SANDBOX</Text>
              </View>
              <Text style={styles.sandboxTitle}>
                Teste com Componentes React Reais
              </Text>
              <Text style={styles.sandboxSubtitle}>
                Zero imagens estáticas. Interaja com a agenda, comissões, contingência e validação.
              </Text>
            </View>

            {/* Tab Switcher */}
            <View style={styles.tabsRow}>
              {SANDBOX_TABS.map((tab) => (
                <Pressable
                  key={tab.id}
                  style={[
                    styles.tab,
                    activeSandboxTab === tab.id && styles.tabActive,
                  ]}
                  onPress={() => setActiveSandboxTab(tab.id)}
                >
                  <Text
                    style={[
                      styles.tabText,
                      activeSandboxTab === tab.id && styles.tabTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Sandbox Frame */}
            <View style={styles.sandboxFrame}>
              {activeSandboxTab === 'agenda' && <AgendaSandbox />}
              {activeSandboxTab === 'comissoes' && <CommissionsSandbox />}
              {activeSandboxTab === 'contingencia' && <EmergencySwapSandbox />}
              {activeSandboxTab === 'antifraude' && <GspValidationSandbox />}
            </View>
          </View>

          {/* ─── ROI SIMULATOR ─────────────────────────────────────── */}
          <AppCard style={styles.roiCard} elevated>
            <Text style={styles.roiTitle}>Simulador de Retorno (ROI)</Text>
            <Text style={styles.roiSubtitle}>
              Calcule a economia mensal de tempo e ganho de receita.
            </Text>

            <View style={styles.roiControlRow}>
              <Text style={styles.roiLabel}>Profissionais na Equipe:</Text>
              <Text style={styles.roiValue}>{roiStaffCount}</Text>
            </View>

            <View style={styles.roiChipsRow}>
              {[1, 2, 4, 6, 8, 10].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRoiStaffCount(n)}
                  style={[styles.roiChip, roiStaffCount === n && styles.roiChipActive]}
                >
                  <Text style={[styles.roiChipText, roiStaffCount === n && styles.roiChipTextActive]}>
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.roiResults}>
              <View style={styles.roiResultBox}>
                <Text style={styles.roiResultNum}>{hoursSaved}h</Text>
                <Text style={styles.roiResultLabel}>Horas de Gestão Economizadas / Mês</Text>
              </View>
              <View style={styles.roiResultBox}>
                <Text style={styles.roiResultNum}>R$ {revenueGain.toLocaleString('pt-BR')}</Text>
                <Text style={styles.roiResultLabel}>Ganho Estimado em Faturamento</Text>
              </View>
            </View>
          </AppCard>

          {/* ─── PLANS ─────────────────────────────────────────────── */}
          <View style={styles.plansSection}>
            <Text style={styles.sectionTitle}>Planos de Assinatura</Text>

            <View style={styles.plansGrid}>
              {/* Essencial */}
              <View style={styles.planCard}>
                <Text style={styles.planBadge}>STARTUP</Text>
                <Text style={styles.planName}>Essencial</Text>
                <Text style={styles.planPrice}>
                  R$ 49<Text style={styles.planPeriod}>/mês</Text>
                </Text>
                <Text style={styles.planDesc}>
                  Para profissionais autônomos e barbearias individuais.
                </Text>
                <View style={styles.planFeatures}>
                  {['Até 2 Agendas', 'Link Público de Agendamento', 'Notificações e Lembretes'].map((f) => (
                    <View key={f} style={styles.planFeatureRow}>
                      <Check size={14} color={colors.success} />
                      <Text style={styles.planFeatureText}>{f}</Text>
                    </View>
                  ))}
                </View>
                <AppButton
                  label="Começar Agora"
                  fullWidth
                  style={{ marginTop: 16 }}
                  onPress={() => router.push('/(auth)/register' as any)}
                />
              </View>

              {/* Pro */}
              <View style={[styles.planCard, styles.planCardFeatured]}>
                <Text style={styles.planBadgeFeatured}>MAIS POPULAR</Text>
                <Text style={styles.planNameFeatured}>Profissional Pro</Text>
                <Text style={styles.planPriceFeatured}>
                  R$ 119<Text style={styles.planPeriodFeatured}>/mês</Text>
                </Text>
                <Text style={styles.planDescFeatured}>
                  Para salões e barbearias com equipe consolidada.
                </Text>
                <View style={styles.planFeatures}>
                  {['Até 8 Agendas Sincronizadas', 'Divisão de Comissão Automática', 'Contingência de Ausência'].map((f) => (
                    <View key={f} style={styles.planFeatureRow}>
                      <Check size={14} color="#F5A524" />
                      <Text style={styles.planFeatureTextFeatured}>{f}</Text>
                    </View>
                  ))}
                </View>
                <AppButton
                  label="Criar Conta Pro"
                  fullWidth
                  style={{ marginTop: 16, backgroundColor: '#F5A524' }}
                  onPress={() => router.push('/(auth)/register' as any)}
                />
              </View>
            </View>
          </View>

          {/* ─── TRIAGE CNPJ ───────────────────────────────────────── */}
          <View style={styles.triageCard}>
            <Award size={24} color={colors.brandSecondary} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.triageTitle}>
                Verifique Elegibilidade para Auto-Ativação
              </Text>
              <Text style={styles.triageDesc}>
                Insira seu CNPJ ou CPF e receba ativação assistida em menos de 5 minutos.
              </Text>
              <View style={styles.triageRow}>
                <TextInput
                  style={styles.triageInput}
                  placeholder="Digite seu CNPJ ou CPF..."
                  placeholderTextColor={colors.textMuted}
                  value={triageInput}
                  onChangeText={setTriageInput}
                />
                <AppButton
                  label="Verificar"
                  onPress={() => router.push('/(auth)/register' as any)}
                />
              </View>
            </View>
          </View>

          {/* ─── MOBILE CLIENT LINK ────────────────────────────────── */}
          {!isDesktop && (
            <Pressable
              style={styles.mobileClientLink}
              onPress={() => router.push('/' as any)}
            >
              <UserRound size={16} color={colors.brandPrimary} />
              <Text style={styles.mobileClientText}>
                É cliente? Acesse o Marketplace de Agendamento →
              </Text>
            </Pressable>
          )}

          {/* ─── FOOTER ─────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              © {new Date().getFullYear()} CutSync — Plataforma de Agendamento Universal
            </Text>
            <View style={styles.footerLinks}>
              <Pressable onPress={() => router.push('/' as any)}>
                <Text style={styles.footerLink}>Marketplace</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(auth)/login' as any)}>
                <Text style={styles.footerLink}>Acessar Painel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   STYLES — Off-White Premium
   ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },

  /* Header */
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 14,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontSize: 22,
    fontFamily: typography.display,
    color: colors.brandPrimary,
  },
  logoAccent: {
    color: '#F5A524',
  },
  badge: {
    backgroundColor: colors.brandSecondarySoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
    letterSpacing: 0.8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  headerLinkText: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
  },

  /* Scroll */
  scroll: {
    paddingBottom: 48,
  },
  content: {
    maxWidth: layout.contentMax,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    gap: 32,
  },

  /* Hero */
  hero: {
    alignItems: 'center',
    gap: 14,
    paddingTop: 48,
    paddingBottom: 8,
  },
  heroTitle: {
    ...typeScale.displayLarge,
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -1.2,
  },
  heroHighlight: {
    color: colors.brandPrimary,
  },
  heroSubtitle: {
    ...typeScale.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 560,
  },
  heroCtas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    justifyContent: 'center',
  },

  /* Sandbox */
  sandboxSection: {
    gap: 16,
  },
  sandboxHeader: {
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandSecondarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  liveTagText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
    letterSpacing: 1,
  },
  sandboxTitle: {
    ...typeScale.sectionTitle,
    color: colors.text,
    textAlign: 'center',
  },
  sandboxSubtitle: {
    ...typeScale.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 540,
  },
  tabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  tabText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  tabTextActive: {
    color: colors.ink,
  },
  sandboxFrame: {
    marginTop: 4,
  },

  /* ROI */
  roiCard: {
    padding: 24,
    gap: 14,
  },
  roiTitle: {
    ...typeScale.sectionTitle,
    color: colors.brandPrimary,
  },
  roiSubtitle: {
    ...typeScale.small,
    color: colors.textSecondary,
  },
  roiControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roiLabel: {
    ...typeScale.bodyStrong,
    color: colors.text,
  },
  roiValue: {
    ...typeScale.sectionTitle,
    color: colors.brandPrimary,
  },
  roiChipsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roiChip: {
    flex: 1,
    height: 36,
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roiChipActive: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  roiChipText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  roiChipTextActive: {
    color: colors.ink,
  },
  roiResults: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  roiResultBox: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  roiResultNum: {
    fontSize: 20,
    fontFamily: typography.display,
    color: colors.brandPrimary,
  },
  roiResultLabel: {
    ...typeScale.label,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* Plans */
  plansSection: {
    gap: 16,
  },
  sectionTitle: {
    ...typeScale.sectionTitle,
    color: colors.text,
  },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  planCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 12,
  },
  planCardFeatured: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  planBadge: {
    ...typeScale.label,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  planBadgeFeatured: {
    ...typeScale.label,
    color: '#F5A524',
    letterSpacing: 1,
  },
  planName: {
    fontSize: 20,
    fontFamily: typography.display,
    color: colors.text,
  },
  planNameFeatured: {
    fontSize: 20,
    fontFamily: typography.display,
    color: colors.ink,
  },
  planPrice: {
    fontSize: 32,
    fontFamily: typography.display,
    color: colors.brandPrimary,
  },
  planPriceFeatured: {
    fontSize: 32,
    fontFamily: typography.display,
    color: colors.ink,
  },
  planPeriod: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  planPeriodFeatured: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.brandSecondary,
  },
  planDesc: {
    ...typeScale.small,
    color: colors.textSecondary,
  },
  planDescFeatured: {
    ...typeScale.small,
    color: colors.brandSecondary,
  },
  planFeatures: {
    gap: 8,
    marginTop: 8,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planFeatureText: {
    ...typeScale.small,
    color: colors.text,
  },
  planFeatureTextFeatured: {
    ...typeScale.small,
    color: colors.ink,
  },

  /* Triage */
  triageCard: {
    backgroundColor: colors.brandPrimary,
    borderRadius: radii.lg,
    padding: 24,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  triageTitle: {
    fontSize: 15,
    fontFamily: typography.display,
    color: colors.ink,
  },
  triageDesc: {
    ...typeScale.small,
    color: colors.brandSecondary,
  },
  triageRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  triageInput: {
    flex: 1,
    height: 42,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.text,
  },

  /* Mobile Client Link */
  mobileClientLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brandSecondarySoft,
    borderRadius: radii.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  mobileClientText: {
    flex: 1,
    ...typeScale.small,
    fontFamily: typography.bodyStrong,
    color: colors.brandPrimary,
  },

  /* Footer */
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 24,
    marginTop: 8,
    alignItems: 'center',
    gap: 12,
  },
  footerText: {
    ...typeScale.small,
    color: colors.textMuted,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: 24,
  },
  footerLink: {
    ...typeScale.small,
    fontFamily: typography.bodyStrong,
    color: colors.textSecondary,
  },
});
