import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlobalSearch } from '@/components/cloud/global-search';
import { MetricCard } from '@/components/cloud/metric-card';
import { ModuleSwitcher } from '@/components/cloud/module-switcher';
import { StatusBadge } from '@/components/cloud/status-badge';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { isCloudFlagEnabled } from '@/features/cloud/cloud-feature-flags';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { modulesVisibleTo, type CloudModule } from '@/navigation/module-registry';
import { cloudTheme } from '@/theme/cloud-components';

const accentSoft: Record<CloudModule['accent'], string> = {
  blue: cloudTheme.colors.accentBlueSoft,
  green: cloudTheme.colors.accentGreenSoft,
  violet: cloudTheme.colors.accentVioletSoft,
  amber: cloudTheme.colors.accentAmberSoft,
};

const accentStrong: Record<CloudModule['accent'], string> = {
  blue: cloudTheme.colors.accentBlue,
  green: cloudTheme.colors.accentGreen,
  violet: cloudTheme.colors.accentViolet,
  amber: cloudTheme.colors.accentAmber,
};

export function CentralHub() {
  const { can, context } = useControlAuth();
  const modules = modulesVisibleTo(can);
  const centralEnabled = isCloudFlagEnabled('centralEnabled');

  if (!centralEnabled) {
    return (
      <SectionPage
        eyebrow="CENTRAL"
        title="Central temporariamente indisponível"
        description="A Central Cloud está desativada por feature flag."
      />
    );
  }

  const continueHref = modules[0]?.href ?? CLOUD_ROUTES.operacao.root;

  return (
    <SectionPage
      eyebrow="CUTSYNC CLOUD"
      title="Central"
      description="Escolha o módulo autorizado, continue o trabalho recente e acompanhe a disponibilidade técnica sem misturar com a situação operacional."
    >
      <View style={styles.searchRow}>
        <GlobalSearch placeholder="Buscar rotas e ações disponíveis" />
        <ModuleSwitcher />
      </View>

      <View style={styles.continueCard}>
        <StatusBadge label="CONTINUAR EM" tone="info" />
        <Text style={styles.continueTitle}>
          {modules[0]?.label ?? 'Operação'}
        </Text>
        <Text style={styles.continueDetail}>
          Sessão de {context?.name ?? 'operador'} com papel {context?.role ?? 'indefinido'}.
        </Text>
        <Link href={continueHref} asChild>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.primaryButtonText}>Continuar</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.metrics}>
        <MetricCard
          label="Ambientes autorizados"
          value={String(modules.length)}
          detail="Módulos liberados pela sessão atual"
          tone="info"
        />
        <MetricCard
          label="Prioridades"
          value={can('control.access.manage') ? 'GSP' : 'Operação'}
          detail="Fila sugerida com base no seu papel"
          tone="warning"
        />
        <MetricCard
          label="Disponibilidade técnica"
          value="Estável"
          detail="Separada da situação de trabalho dos módulos"
          tone="success"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Módulos</Text>
        <View style={styles.moduleGrid}>
          {modules.map((module) => (
            <Link key={module.id} href={module.href} asChild>
              <Pressable
                accessibilityRole="link"
                style={({ pressed }) => [
                  styles.moduleCard,
                  { backgroundColor: accentSoft[module.accent], borderColor: accentStrong[module.accent] },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.moduleLabel, { color: accentStrong[module.accent] }]}>
                  {module.label}
                </Text>
                <Text style={styles.moduleDescription}>{module.description}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ações rápidas</Text>
        <View style={styles.quickActions}>
          {can('control.live.read') ? (
            <Link href={CLOUD_ROUTES.operacao.tempoReal} asChild>
              <Pressable style={styles.quickAction}>
                <Text style={styles.quickActionText}>Tempo real</Text>
              </Pressable>
            </Link>
          ) : null}
          {can('control.support.read') ? (
            <Link href={CLOUD_ROUTES.suporte.root} asChild>
              <Pressable style={styles.quickAction}>
                <Text style={styles.quickActionText}>Fila de suporte</Text>
              </Pressable>
            </Link>
          ) : null}
          {can('control.billing.read') ? (
            <Link href={CLOUD_ROUTES.financeiro.root} asChild>
              <Pressable style={styles.quickAction}>
                <Text style={styles.quickActionText}>Financeiro</Text>
              </Pressable>
            </Link>
          ) : null}
          {can('control.access.manage') ? (
            <Link href={CLOUD_ROUTES.gsp.acessos} asChild>
              <Pressable style={styles.quickAction}>
                <Text style={styles.quickActionText}>Diretório de acessos</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Atividade recente</Text>
        <Text style={styles.muted}>
          A trilha de atividade recente permanece limitada às rotas e ações já autorizadas nesta sessão.
        </Text>
      </View>
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  searchRow: { gap: cloudTheme.spacing.md },
  continueCard: {
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.xl,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  continueTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  continueDetail: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  primaryButton: {
    alignSelf: 'flex-start',
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.lg,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.brand,
  },
  primaryButtonText: { ...cloudTheme.type.button, color: cloudTheme.colors.surface },
  pressed: { opacity: 0.88 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  section: { gap: cloudTheme.spacing.md },
  sectionTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  moduleCard: {
    minWidth: 220,
    minHeight: cloudTheme.layout.moduleCardMinHeight,
    flexGrow: 1,
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.lg,
  },
  moduleLabel: { ...cloudTheme.type.cardTitle },
  moduleDescription: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.sm },
  quickAction: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  quickActionText: { ...cloudTheme.type.button, color: cloudTheme.colors.brand },
  muted: { ...cloudTheme.type.body, color: cloudTheme.colors.textMuted },
});
