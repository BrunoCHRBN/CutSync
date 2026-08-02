import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MetricCard } from '@/components/cloud/metric-card';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import {
  ControlSupportError,
  getControlSupportOverview,
  type SupportOverview,
} from '@/services/control-support';
import { cloudTheme } from '@/theme/cloud-components';

function loadErrorMessage(error: unknown): string {
  if (!(error instanceof ControlSupportError)) {
    return 'Não foi possível carregar o resumo do suporte.';
  }
  if (error.code === 'forbidden') return 'Seu acesso atual não permite consultar o resumo.';
  if (error.code === 'aal2_required') return 'Confirme o autenticador para continuar.';
  return 'O resumo do suporte está temporariamente indisponível.';
}

export function SupportOverview() {
  const { can, context } = useControlAuth();
  const [overview, setOverview] = useState<SupportOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await getControlSupportOverview({
        status: null,
        priority: null,
        category: null,
        limit: 1,
      });
      if (id === requestId.current) setOverview(result);
    } catch (loadError) {
      if (id === requestId.current) {
        setOverview(null);
        setError(loadErrorMessage(loadError));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    if (can('control.support.read')) void load();
    return () => { requestId.current += 1; };
  }, [can, load]));

  const counts = overview?.counts;
  const capabilities = overview?.capabilities;
  const activeMember = Boolean(overview?.operator.active && overview.operator.memberRole);

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="SUPORTE"
        title="Visão geral"
        description="Resumo operacional da fila. A tabela completa e o detalhe dos chamados ficam em Atendimentos."
        badge="RESUMO"
        badgeTone="info"
        actions={(
          <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Abrir atendimentos</Text>
            </Pressable>
          </Link>
        )}
      />

      {loading && !overview ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>Carregando resumo...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {overview ? (
        <>
          <View style={styles.statusRow}>
            <View style={styles.statusBlock}>
              <Text style={styles.statusLabel}>Operador</Text>
              <Text style={styles.statusValue}>
                {overview.operator.name}
                {overview.operator.memberRole
                  ? ` · ${overview.operator.memberRole === 'lead' ? 'Liderança' : 'Agente'}`
                  : ''}
              </Text>
              <Text style={styles.muted}>
                {activeMember
                  ? (overview.operator.teamName ?? overview.operator.teamCode ?? 'Equipe vinculada')
                  : 'Equipe ainda não vinculada'}
              </Text>
            </View>
            {capabilities ? (
              <View style={styles.statusBlock}>
                <Text style={styles.statusLabel}>Disponibilidade</Text>
                <View style={styles.badgeRow}>
                  <StatusBadge
                    label={capabilities.enabled ? 'Módulo ativo' : 'Módulo pausado'}
                    tone={capabilities.enabled ? 'success' : 'warning'}
                  />
                  <StatusBadge
                    label={capabilities.allowNewTickets ? 'Novos liberados' : 'Novos bloqueados'}
                    tone={capabilities.allowNewTickets ? 'info' : 'warning'}
                  />
                  <StatusBadge
                    label={capabilities.syncEnabled ? 'Sync ativa' : 'Sync pausada'}
                    tone={capabilities.syncEnabled ? 'success' : 'warning'}
                  />
                </View>
                {context?.role === 'SaaS_Owner' && can('control.support.manage') ? (
                  <Text style={styles.muted}>
                    Controles avançados de runtime permanecem em Atendimentos.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.metrics}>
            <MetricCard
              label="Total na fila"
              value={(counts?.total ?? 0).toLocaleString('pt-BR')}
              detail="Chamados no filtro atual do resumo"
              emphasize
            />
            <MetricCard
              label="Em andamento"
              value={(counts?.inProgress ?? 0).toLocaleString('pt-BR')}
              detail="Atendimentos em progresso"
              tone="info"
              emphasize
            />
            <MetricCard
              label="Risco de SLA"
              value={(counts?.slaAtRisk ?? 0).toLocaleString('pt-BR')}
              detail="Fora do prazo de primeira resposta"
              tone={(counts?.slaAtRisk ?? 0) > 0 ? 'warning' : 'success'}
              emphasize
            />
            <MetricCard
              label="Críticos"
              value={(counts?.critical ?? 0).toLocaleString('pt-BR')}
              detail="Prioridade crítica"
              tone={(counts?.critical ?? 0) > 0 ? 'danger' : 'neutral'}
              emphasize
            />
            <MetricCard
              label="Falhas de sync"
              value={(counts?.syncFailed ?? 0).toLocaleString('pt-BR')}
              detail="Sincronização com JSM"
              tone={(counts?.syncFailed ?? 0) > 0 ? 'danger' : 'success'}
              emphasize
            />
          </View>

          <View style={styles.ctaCard}>
            <Text style={styles.cardTitle}>Fila operacional</Text>
            <Text style={styles.muted}>
              Filtros, tabela de chamados e painel de detalhe estão concentrados em Atendimentos para evitar duplicação desta visão.
            </Text>
            <Link href={CLOUD_ROUTES.suporte.atendimentos} asChild>
              <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Ir para a fila</Text>
              </Pressable>
            </Link>
          </View>
        </>
      ) : null}
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
  loading: { flexDirection: 'row', alignItems: 'center', gap: cloudTheme.spacing.sm },
  muted: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  errorCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.danger,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.dangerSoft,
  },
  errorText: { flex: 1, minWidth: 220, color: cloudTheme.colors.danger },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  statusBlock: {
    minWidth: 260,
    flexGrow: 1,
    gap: cloudTheme.spacing.xs,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  statusLabel: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  statusValue: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  ctaCard: {
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.xl,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  cardTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  primaryButton: {
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
    backgroundColor: cloudTheme.colors.surface,
  },
  secondaryButtonText: { ...cloudTheme.type.button, color: cloudTheme.colors.brand },
  pressed: { opacity: 0.88 },
});
