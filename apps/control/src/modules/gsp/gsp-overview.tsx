import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { MetricCard } from '@/components/cloud/metric-card';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { cloudTheme } from '@/theme/cloud-components';

const riskFactors = [
  {
    id: 'elevated',
    label: 'Permissões elevadas',
    detail: 'Aguarda consolidação do indicador de privilégio.',
  },
  {
    id: 'mfa',
    label: 'Usuários sem MFA',
    detail: 'TOTP é obrigatório no Cloud; inventário amplo ainda não é exposto.',
  },
  {
    id: 'reviews',
    label: 'Revisões vencendo',
    detail: 'Ciclos de revisão permanecem em preparação.',
  },
  {
    id: 'sessions',
    label: 'Sessões anômalas',
    detail: 'Sem fonte homologada de anomalia de sessão nesta etapa.',
  },
] as const;

export function GspOverview() {
  const { can } = useControlAuth();
  const canUseAccessWorkflow = can('control.access.request')
    || can('control.access.approve')
    || can('control.access.apply')
    || can('control.access.manage');
  const accessWorkflowHref = can('control.access.request')
    ? CLOUD_ROUTES.gsp.minhasSolicitacoes
    : can('control.access.approve')
      ? CLOUD_ROUTES.gsp.aprovacoes
      : can('control.access.apply')
        ? CLOUD_ROUTES.gsp.aplicacao
        : CLOUD_ROUTES.gsp.acessos;

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP"
        title="Governança, Segurança e Plataforma"
        description="Risco, acessos, revisões, políticas e auditoria. Somente superfícies com fonte real ou estado preparado são exibidas."
        badge="GOVERNANÇA"
        badgeTone="info"
      />

      <View style={styles.metrics}>
        <MetricCard
          label="Risco geral"
          value="—"
          detail="Indicador composto aguarda fontes homologadas"
          tone="warning"
        />
        <MetricCard
          label="Usuários"
          value={canUseAccessWorkflow ? 'Fluxo ativo' : '—'}
          detail={canUseAccessWorkflow ? 'Solicitações e acessos autorizados' : 'Sem permissão de acesso'}
          tone="info"
        />
        <MetricCard
          label="Revisões"
          value="Preparadas"
          detail="Sem registros simulados"
        />
        <MetricCard
          label="Eventos sensíveis"
          value="—"
          detail="Auditoria em preparação"
        />
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Composição do risco</Text>
          <StatusBadge label="EXPLICATIVO" tone="neutral" />
        </View>
        <Text style={styles.panelDetail}>
          O indicador geral só será calculado quando houver fontes reais para cada fator abaixo.
        </Text>
        <View style={styles.factorGrid}>
          {riskFactors.map((factor) => (
            <View key={factor.id} style={styles.factorCard}>
              <Text style={styles.factorLabel}>{factor.label}</Text>
              <Text style={styles.factorDetail}>{factor.detail}</Text>
              <StatusBadge label="SEM FONTE" tone="warning" />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Distribuição de acessos</Text>
        {canUseAccessWorkflow ? (
          <View style={styles.actions}>
            <Link href={accessWorkflowHref} asChild>
              <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>Abrir fluxo de acessos</Text>
              </Pressable>
            </Link>
            <Text style={styles.panelDetail}>
              Solicitação, aprovação e aplicação usam permissões independentes e RPCs auditadas.
            </Text>
          </View>
        ) : (
          <FeedbackState
            kind="partial"
            title="Acessos restritos"
            message="Seu perfil atual não inclui participação no fluxo de acessos."
          />
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Auditoria recente</Text>
        <FeedbackState
          kind="partial"
          title="Fonte de auditoria em preparação"
          message="Eventos com ator, ação, alvo e origem aparecerão aqui sem dados simulados."
        />
        {can('control.governance.read') ? (
          <Link href={CLOUD_ROUTES.gsp.auditoria} asChild>
            <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonText}>Abrir Auditoria</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>

      <View style={styles.quickLinks}>
        {can('control.governance.read') ? (
          <Link href={CLOUD_ROUTES.gsp.revisoes} asChild>
            <Pressable style={styles.quickLink}>
              <Text style={styles.quickLinkText}>Revisões de acesso</Text>
            </Pressable>
          </Link>
        ) : null}
        {can('control.governance.read') ? (
          <Link href={CLOUD_ROUTES.gsp.politicas} asChild>
            <Pressable style={styles.quickLink}>
              <Text style={styles.quickLinkText}>Políticas</Text>
            </Pressable>
          </Link>
        ) : null}
        {can('control.knowledge.read') ? (
          <Link href={CLOUD_ROUTES.gsp.conhecimento} asChild>
            <Pressable style={styles.quickLink}>
              <Text style={styles.quickLinkText}>Conhecimento</Text>
            </Pressable>
          </Link>
        ) : null}
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
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  panel: {
    gap: cloudTheme.spacing.md,
    padding: cloudTheme.spacing.xl,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  panelHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
  },
  panelTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  panelDetail: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  factorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  factorCard: {
    minWidth: 200,
    flexGrow: 1,
    gap: cloudTheme.spacing.xs,
    padding: cloudTheme.spacing.md,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surfaceMuted,
  },
  factorLabel: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  factorDetail: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  actions: { gap: cloudTheme.spacing.sm },
  primaryButton: {
    alignSelf: 'flex-start',
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.lg,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.brand,
  },
  primaryButtonText: { ...cloudTheme.type.button, color: cloudTheme.colors.surface },
  secondaryButton: {
    alignSelf: 'flex-start',
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brand,
    borderRadius: cloudTheme.radii.md,
  },
  secondaryButtonText: { ...cloudTheme.type.button, color: cloudTheme.colors.brand },
  pressed: { opacity: 0.88 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.sm },
  quickLink: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  quickLinkText: { ...cloudTheme.type.button, color: cloudTheme.colors.brand },
});
