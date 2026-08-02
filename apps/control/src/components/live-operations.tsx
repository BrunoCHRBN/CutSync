import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useControlLive } from '@/hooks/use-control-live';
import {
  OpsCell,
  OpsDefList,
  OpsGrid,
  OpsHeadCell,
  OpsHeader,
  OpsInlineNotice,
  OpsMainCol,
  OpsPage,
  OpsPanel,
  OpsSecondaryButton,
  OpsSideCol,
  OpsStrip,
  OpsTableHead,
  OpsTableRow,
  OpsTableShell,
  opsGridStyle,
} from '@/modules/operation/ops-console';
import type {
  ControlLiveAppointments,
  ControlLiveEstablishments,
  ControlLiveSupport,
} from '@/services/control-live';
import { cloudTheme } from '@/theme/cloud-components';

const connectionLabels = {
  connecting: '○ Conectando',
  connected: '● Conectado',
  reconnecting: '○ Reconectando ao canal em tempo real…',
  stale: '△ Dados desatualizados',
} as const;

const matrixGrid = opsGridStyle('minmax(200px, 2fr) 100px 120px');
const watchGrid = opsGridStyle('minmax(140px, 1.4fr) minmax(160px, 2fr) 100px');

function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

type MatrixRow = {
  id: string;
  label: string;
  value: number;
  state: string;
  tone?: 'warning' | 'danger';
};

type WatchRow = {
  id: string;
  entity: string;
  reason: string;
  state: string;
  tone?: 'warning' | 'danger';
};

function buildAgendaRows(appointments: ControlLiveAppointments): MatrixRow[] {
  return [
    { id: 'total', label: 'Agendamentos previstos', value: appointments.todayTotal, state: 'Normal' },
    { id: 'next', label: 'Próximos 60 min', value: appointments.next60Minutes, state: 'Normal' },
    {
      id: 'pending',
      label: 'Pendências',
      value: appointments.pending,
      state: appointments.pending > 0 ? 'Atenção' : 'Normal',
      tone: appointments.pending > 0 ? 'warning' : undefined,
    },
    { id: 'confirmed', label: 'Confirmações', value: appointments.confirmed, state: 'Normal' },
    { id: 'completed', label: 'Concluídos', value: appointments.completed, state: 'Normal' },
    {
      id: 'cancelled',
      label: 'Cancelamentos',
      value: appointments.cancelled,
      state: appointments.cancelled > 0 ? 'Atenção' : 'Normal',
      tone: appointments.cancelled > 0 ? 'warning' : undefined,
    },
  ];
}

function buildWatchRows(
  appointments: ControlLiveAppointments,
  establishments: ControlLiveEstablishments,
  support: ControlLiveSupport | null,
): WatchRow[] {
  const rows: WatchRow[] = [];
  if (appointments.pending > 0) {
    rows.push({
      id: 'pending',
      entity: 'Agenda',
      reason: `${appointments.pending} confirmação(ões) pendente(s)`,
      state: 'Pendente',
      tone: 'warning',
    });
  }
  if (establishments.pendingRequests > 0) {
    rows.push({
      id: 'est-pending',
      entity: 'Estabelecimentos',
      reason: `${establishments.pendingRequests} solicitação(ões) aguardando análise`,
      state: 'Atenção',
      tone: 'warning',
    });
  }
  if (support) {
    if (support.slaAtRisk > 0) {
      rows.push({
        id: 'sla',
        entity: 'Suporte',
        reason: `${support.slaAtRisk} chamado(s) com risco de SLA`,
        state: 'Atenção',
        tone: 'warning',
      });
    }
    if (support.criticalOpen > 0) {
      rows.push({
        id: 'critical',
        entity: 'Suporte',
        reason: `${support.criticalOpen} crítico(s) abertos`,
        state: 'Crítico',
        tone: 'danger',
      });
    }
    if (support.syncFailed > 0) {
      rows.push({
        id: 'sync',
        entity: 'Sincronização',
        reason: `${support.syncFailed} falha(s) de sync`,
        state: 'Atenção',
        tone: 'danger',
      });
    }
    if (support.oldestPendingMinutes !== null && support.oldestPendingMinutes >= 5) {
      rows.push({
        id: 'ops',
        entity: 'Operações',
        reason: `Operação pendente há ${support.oldestPendingMinutes} min`,
        state: 'Atenção',
        tone: 'warning',
      });
    }
  }
  return rows;
}

export function LiveOperations() {
  const { width } = useWindowDimensions();
  const compact = width < 960;
  const {
    snapshot,
    connectionState,
    loading,
    refreshing,
    error,
    refresh,
  } = useControlLive();

  const agendaRows = useMemo(
    () => (snapshot ? buildAgendaRows(snapshot.appointments) : []),
    [snapshot],
  );
  const watchRows = useMemo(
    () => (snapshot
      ? buildWatchRows(snapshot.appointments, snapshot.establishments, snapshot.support)
      : []),
    [snapshot],
  );

  const stripItems = snapshot
    ? [
        {
          label: 'Canal',
          value: connectionLabels[connectionState],
          tone: connectionState === 'connected'
            ? undefined
            : connectionState === 'stale'
              ? 'danger' as const
              : 'warning' as const,
        },
        {
          label: 'Agendados',
          value: snapshot.appointments.todayTotal.toLocaleString('pt-BR'),
        },
        {
          label: 'Em andamento',
          value: snapshot.appointments.confirmed.toLocaleString('pt-BR'),
        },
        {
          label: 'Pendências',
          value: snapshot.appointments.pending.toLocaleString('pt-BR'),
          tone: snapshot.appointments.pending > 0 ? 'warning' as const : undefined,
        },
        {
          label: 'Fila suporte',
          value: snapshot.support
            ? snapshot.support.openQueue.toLocaleString('pt-BR')
            : '—',
        },
      ]
    : [
        {
          label: 'Canal',
          value: connectionLabels[connectionState],
          tone: 'warning' as const,
        },
      ];

  return (
    <OpsPage>
      <OpsHeader
        kicker="OPERAÇÃO / TEMPO REAL"
        title="Acompanhamento ao vivo"
        description="Painel vivo a partir de snapshots autoritativos. Eventos privados apenas solicitam a atualização dos dados."
        meta={(
          <Text style={styles.meta}>
            {snapshot
              ? `Último snapshot ${formatRelative(snapshot.generatedAt)} · ${snapshot.timezone}`
              : 'Aguardando primeiro snapshot'}
          </Text>
        )}
        actions={(
          <OpsSecondaryButton
            label={refreshing ? 'Atualizando…' : 'Atualizar agora'}
            disabled={refreshing}
            onPress={() => { void refresh(true); }}
          />
        )}
      />

      <OpsStrip items={stripItems} />

      {loading && !snapshot ? (
        <View style={styles.loading}>
          <ActivityIndicator color={cloudTheme.colors.brand} />
          <Text style={styles.muted}>{connectionLabels.reconnecting}</Text>
        </View>
      ) : null}

      {error ? (
        <OpsInlineNotice
          tone="danger"
          message={
            snapshot
              ? `${error} O último snapshot válido foi preservado.`
              : error
          }
        />
      ) : null}

      {snapshot ? (
        <OpsGrid compact={compact}>
          <OpsMainCol>
            <OpsPanel title="Operação de hoje">
              <OpsTableShell>
                <OpsTableHead gridStyle={matrixGrid}>
                  <OpsHeadCell>Indicador</OpsHeadCell>
                  <OpsHeadCell>Atual</OpsHeadCell>
                  <OpsHeadCell>Estado</OpsHeadCell>
                </OpsTableHead>
                {agendaRows.map((row) => (
                  <OpsTableRow key={row.id} gridStyle={matrixGrid} accent={Boolean(row.tone)}>
                    <OpsCell strong>{row.label}</OpsCell>
                    <OpsCell strong>{row.value.toLocaleString('pt-BR')}</OpsCell>
                    <OpsCell tone={row.tone}>{row.state}</OpsCell>
                  </OpsTableRow>
                ))}
              </OpsTableShell>
            </OpsPanel>

            <OpsPanel title="Estabelecimentos">
              <OpsTableShell>
                <OpsTableHead gridStyle={matrixGrid}>
                  <OpsHeadCell>Indicador</OpsHeadCell>
                  <OpsHeadCell>Atual</OpsHeadCell>
                  <OpsHeadCell>Estado</OpsHeadCell>
                </OpsTableHead>
                <OpsTableRow gridStyle={matrixGrid}>
                  <OpsCell strong>Ativos</OpsCell>
                  <OpsCell strong>{snapshot.establishments.active.toLocaleString('pt-BR')}</OpsCell>
                  <OpsCell>Normal</OpsCell>
                </OpsTableRow>
                <OpsTableRow
                  gridStyle={matrixGrid}
                  accent={snapshot.establishments.pendingRequests > 0}
                >
                  <OpsCell strong>Solicitações pendentes</OpsCell>
                  <OpsCell strong>
                    {snapshot.establishments.pendingRequests.toLocaleString('pt-BR')}
                  </OpsCell>
                  <OpsCell tone={snapshot.establishments.pendingRequests > 0 ? 'warning' : undefined}>
                    {snapshot.establishments.pendingRequests > 0 ? 'Atenção' : 'Normal'}
                  </OpsCell>
                </OpsTableRow>
              </OpsTableShell>
            </OpsPanel>
          </OpsMainCol>

          <OpsSideCol sticky={!compact}>
            <OpsPanel title="Fila de observação">
              {watchRows.length === 0 ? (
                <OpsInlineNotice message="Nenhum item exige acompanhamento agora." tone="success" />
              ) : (
                <OpsTableShell>
                  <OpsTableHead gridStyle={watchGrid}>
                    <OpsHeadCell>Entidade</OpsHeadCell>
                    <OpsHeadCell>Motivo</OpsHeadCell>
                    <OpsHeadCell>Estado</OpsHeadCell>
                  </OpsTableHead>
                  {watchRows.map((row) => (
                    <OpsTableRow key={row.id} gridStyle={watchGrid} accent={Boolean(row.tone)}>
                      <OpsCell strong>{row.entity}</OpsCell>
                      <OpsCell numberOfLines={2}>{row.reason}</OpsCell>
                      <OpsCell tone={row.tone}>{row.state}</OpsCell>
                    </OpsTableRow>
                  ))}
                </OpsTableShell>
              )}
            </OpsPanel>

            <OpsPanel title="Contexto do canal">
              {snapshot.support ? (
                <OpsDefList
                  rows={[
                    {
                      label: 'Runtime suporte',
                      value: snapshot.support.runtimeEnabled ? 'Ativo' : 'Pausado',
                    },
                    {
                      label: 'Sync JSM',
                      value: snapshot.support.syncEnabled ? 'Ativo' : 'Pausado',
                    },
                    {
                      label: 'Fila aberta',
                      value: snapshot.support.openQueue.toLocaleString('pt-BR'),
                    },
                    {
                      label: 'Aguardando usuário',
                      value: snapshot.support.waitingUser.toLocaleString('pt-BR'),
                    },
                    {
                      label: 'Risco de SLA',
                      value: snapshot.support.slaAtRisk.toLocaleString('pt-BR'),
                      tone: snapshot.support.slaAtRisk > 0 ? 'caution' : 'neutral',
                    },
                  ]}
                />
              ) : (
                <OpsInlineNotice message="Equipe de suporte não vinculada nesta sessão. A fila oficial permanece no módulo Suporte." />
              )}
            </OpsPanel>
          </OpsSideCol>
        </OpsGrid>
      ) : null}
    </OpsPage>
  );
}

const styles = StyleSheet.create({
  meta: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  muted: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
