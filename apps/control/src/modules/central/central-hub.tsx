import { Link, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { MetricCard } from '@/components/cloud/metric-card';
import { ModuleCard } from '@/components/cloud/module-card';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { useControlAuth } from '@/contexts/control-auth-context';
import { isCloudFlagEnabled } from '@/features/cloud/cloud-feature-flags';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import {
  CLOUD_NAV_MODULES,
  getLastModuleId,
} from '@/navigation/module-nav';
import { modulesVisibleTo } from '@/navigation/module-registry';
import { cloudTheme } from '@/theme/cloud-components';

export function CentralHub() {
  const { can, context } = useControlAuth();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const modules = modulesVisibleTo(can);
  const centralEnabled = isCloudFlagEnabled('centralEnabled');
  const lastModuleId = getLastModuleId();
  const continueModule = CLOUD_NAV_MODULES.find((module) => module.id === lastModuleId)
    ?? CLOUD_NAV_MODULES.find((module) => module.id === modules[0]?.id)
    ?? CLOUD_NAV_MODULES.find((module) => module.id === 'operation')
    ?? CLOUD_NAV_MODULES[0];

  if (!centralEnabled) {
    return (
      <View style={styles.page}>
        <FeedbackState
          kind="maintenance"
          title="Central temporariamente indisponível"
          message="A Central Cloud está desativada por feature flag."
        />
      </View>
    );
  }

  if (section === 'recent') {
    return (
      <View style={styles.page}>
        <PageHeader
          eyebrow="CENTRAL"
          title="Acessos recentes"
          description="Histórico dos ambientes visitados nesta sessão. Nada é persistido fora da aba."
        />
        <FeedbackState
          kind="partial"
          title="Trilha limitada à sessão"
          message="Use Continuar na visão geral para retomar o último módulo desta aba. Nenhum histórico simulado é exibido."
        />
        <Link href={CLOUD_ROUTES.central} asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Voltar à visão geral</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  if (section === 'preferences') {
    return (
      <View style={styles.page}>
        <PageHeader
          eyebrow="CENTRAL"
          title="Preferências"
          description="Preferências do operador no CutSync Cloud. Persistência de perfil ainda não está homologada."
        />
        <FeedbackState
          kind="partial"
          title="Preferências em preparação"
          message="Sessão, MFA e timeout continuam geridos pela política de autenticação atual."
        />
        <Link href={CLOUD_ROUTES.central} asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Voltar à visão geral</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="CUTSYNC CLOUD"
        title="Central"
        description="Retome o trabalho, priorize o que importa hoje e entre nos ambientes autorizados pela sua sessão."
        badge={context?.role?.replace('SaaS_', '') ?? 'Sessão'}
        badgeTone="info"
      />

      <View style={styles.continueCard}>
        <StatusBadge label="CONTINUAR EM" tone="info" />
        <Text style={styles.continueTitle}>{continueModule.label}</Text>
        <Text style={styles.continueDetail}>
          Último ambiente da sessão de {context?.name ?? 'operador'}.
        </Text>
        <View style={styles.continueMeta}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Disponibilidade técnica</Text>
            <Text style={styles.metaValue}>Operacional</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Situação de trabalho</Text>
            <Text style={styles.metaValue}>
              {can('control.live.read') ? 'Ver alertas em Tempo real' : 'Sem alertas carregados'}
            </Text>
          </View>
        </View>
        <View style={styles.continueActions}>
          <Link href={continueModule.href} asChild>
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Continuar</Text>
            </Pressable>
          </Link>
          {can('control.live.read') ? (
            <Link href={CLOUD_ROUTES.operacao.tempoReal} asChild>
              <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Ver alertas</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Prioridades de hoje</Text>
        <View style={styles.metrics}>
          <MetricCard
            label="Impacto operacional"
            value={can('control.live.read') ? 'Tempo real' : '—'}
            detail="Fonte: painel ao vivo autorizado"
            tone="warning"
            emphasize
          />
          <MetricCard
            label="Suporte"
            value={can('control.support.read') ? 'Fila' : '—'}
            detail="Somente se houver permissão de leitura"
            tone="info"
            emphasize
          />
          <MetricCard
            label="Governança"
            value={can('control.access.manage') ? 'Acessos' : '—'}
            detail="Owner revisa diretório quando necessário"
            tone="success"
            emphasize
          />
        </View>
        {!can('control.live.read') && !can('control.support.read') ? (
          <FeedbackState
            kind="empty"
            title="Nenhuma prioridade carregada"
            message="Não há filas ou alertas autorizados para montar prioridades nesta sessão."
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ambientes disponíveis</Text>
        <View style={styles.moduleGrid}>
          {modules.map((module) => (
            <ModuleCard
              key={module.id}
              href={module.href}
              label={module.label}
              description={module.description}
              accent={module.accent}
              availabilityLabel="Operacional"
              workLabel={
                module.id === 'support'
                  ? 'Fila de atendimentos'
                  : module.id === 'operation'
                    ? 'Indicadores e tempo real'
                    : module.id === 'gsp'
                      ? 'Governança e acessos'
                      : 'Cobrança da plataforma'
              }
            />
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
        <FeedbackState
          kind="partial"
          title="Trilha limitada à sessão"
          message="A atividade recente permanece restrita às rotas e ações já autorizadas. Nenhum histórico simulado é exibido."
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
    padding: cloudTheme.layout.contentPadding,
  },
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
  continueMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  metaBlock: {
    minWidth: 180,
    flexGrow: 1,
    gap: 2,
    padding: cloudTheme.spacing.md,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surfaceMuted,
  },
  metaLabel: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  metaValue: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  continueActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.sm,
    marginTop: cloudTheme.spacing.xs,
  },
  primaryButton: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.xl,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.brand,
  },
  primaryButtonText: { ...cloudTheme.type.button, color: cloudTheme.colors.surface },
  secondaryButton: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brand,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  secondaryButtonText: { ...cloudTheme.type.button, color: cloudTheme.colors.brand },
  pressed: { opacity: 0.88 },
  section: { gap: cloudTheme.spacing.md },
  sectionTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
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
});
