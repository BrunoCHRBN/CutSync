import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  OpsCell,
  OpsChip,
  OpsDefList,
  OpsGrid,
  OpsHeadCell,
  OpsInlineNotice,
  OpsMainCol,
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
  ControlExecutiveDashboard,
  ControlMetricRangeDays,
  ControlMetricScopeOption,
  MetricComparison,
} from '@/services/control-executive';
import { cloudTheme } from '@/theme/cloud-components';

interface ExecutiveDashboardProps {
  snapshot: ControlExecutiveDashboard;
  rangeDays: ControlMetricRangeDays;
  scopes: ControlMetricScopeOption[];
  selectedScope: ControlMetricScopeOption;
  onRangeChange: (days: ControlMetricRangeDays) => void;
  onScopeChange: (scope: ControlMetricScopeOption) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

type MetricFormat = 'integer' | 'percent' | 'days';
type DomainTab = 'operacao' | 'atendimento' | 'pessoas' | 'qualidade';

function formatValue(value: number | null, format: MetricFormat): string {
  if (value === null) return '—';
  if (format === 'percent') {
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  }
  if (format === 'days') {
    return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} d`;
  }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function formatDate(value: string | null): string {
  return value ? value.split('-').reverse().join('/') : '—';
}

function metricState(metric: MetricComparison, inverse = false): {
  label: string;
  tone?: 'warning' | 'danger';
} {
  if (metric.value === null) return { label: 'Sem leitura' };
  if (metric.comparisonStatus === 'source_unavailable') return { label: 'Sem cobertura' };
  if (metric.comparisonStatus === 'current_incomplete') {
    return { label: 'Período incompleto', tone: 'warning' };
  }
  if (inverse && typeof metric.value === 'number' && metric.value > 0) {
    return { label: 'Atenção', tone: 'warning' };
  }
  return { label: 'Normal' };
}

function formatRelative(iso: string, now = Date.now()): string {
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

type IndicatorRow = {
  id: string;
  label: string;
  metric: MetricComparison;
  format?: MetricFormat;
  inverse?: boolean;
};

const indicatorGrid = opsGridStyle('minmax(220px, 2fr) 110px 110px 140px');
const sourceGrid = opsGridStyle('minmax(180px, 2fr) 110px 120px');

function IndicatorTable({ rows }: { rows: IndicatorRow[] }) {
  return (
    <OpsTableShell>
      <OpsTableHead gridStyle={indicatorGrid}>
        <OpsHeadCell>Indicador</OpsHeadCell>
        <OpsHeadCell>Atual</OpsHeadCell>
        <OpsHeadCell>Anterior</OpsHeadCell>
        <OpsHeadCell>Estado</OpsHeadCell>
      </OpsTableHead>
      {rows.map((row) => {
        const state = metricState(row.metric, row.inverse);
        return (
          <OpsTableRow key={row.id} gridStyle={indicatorGrid} accent={Boolean(state.tone)}>
            <OpsCell strong numberOfLines={2}>{row.label}</OpsCell>
            <OpsCell strong>{formatValue(row.metric.value, row.format ?? 'integer')}</OpsCell>
            <OpsCell muted>{formatValue(row.metric.previous, row.format ?? 'integer')}</OpsCell>
            <OpsCell tone={state.tone}>{state.label}</OpsCell>
          </OpsTableRow>
        );
      })}
    </OpsTableShell>
  );
}

function TrendBars({ snapshot }: { snapshot: ControlExecutiveDashboard }) {
  const series = snapshot.series;
  const availableValues = series.flatMap((point) => (
    point.completedAppointments === null ? [] : [point.completedAppointments]
  ));
  const maxValue = Math.max(1, ...availableValues);
  const missingDays = series.length - availableValues.length;

  return (
    <View style={styles.chartBlock}>
      <View
        accessibilityLabel={
          `Série diária de atendimentos concluídos, máximo de ${maxValue}`
          + (missingDays ? `, ${missingDays} dia(s) sem snapshot` : '')
        }
        accessible
        style={styles.chart}
      >
        {series.map((point) => (
          <View key={point.date} style={styles.barSlot}>
            {point.completedAppointments === null ? (
              <View style={styles.missingBar} />
            ) : (
              <View
                style={[
                  styles.bar,
                  { height: Math.max(4, Math.round((point.completedAppointments / maxValue) * 88)) },
                ]}
              />
            )}
          </View>
        ))}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.chartAxisText}>{formatDate(snapshot.period.start)}</Text>
        <Text style={styles.chartAxisText}>{series.length} dias · máx. {maxValue.toLocaleString('pt-BR')}</Text>
        <Text style={styles.chartAxisText}>{formatDate(snapshot.period.end)}</Text>
      </View>
    </View>
  );
}

export function ExecutiveDashboard({
  snapshot,
  rangeDays,
  scopes,
  selectedScope,
  onRangeChange,
  onScopeChange,
  onRefresh,
  refreshing = false,
}: ExecutiveDashboardProps) {
  const { width } = useWindowDimensions();
  const compact = width < 960;
  const [domain, setDomain] = useState<DomainTab>('operacao');

  const globalScope = scopes.find((scope) => scope.type === 'global') ?? {
    type: 'global' as const,
    id: null,
    parentId: null,
    label: 'Toda a plataforma',
  };
  const organizations = scopes.filter((scope) => scope.type === 'organization');
  const selectedOrganizationId = selectedScope.type === 'organization'
    ? selectedScope.id
    : selectedScope.type === 'establishment'
      ? selectedScope.parentId
      : null;
  const establishments = scopes.filter(
    (scope) => scope.type === 'establishment' && scope.parentId === selectedOrganizationId,
  );

  const attentionItems = useMemo(() => {
    const items: { id: string; label: string; detail: string }[] = [];
    if (snapshot.dataQuality.missingDays > 0) {
      items.push({
        id: 'missing',
        label: `${snapshot.dataQuality.missingDays} dia(s) sem snapshot`,
        detail: 'Comparações podem ficar incompletas',
      });
    }
    if (!snapshot.dataQuality.comparisonAvailable) {
      items.push({
        id: 'comparison',
        label: 'Base comparável incompleta',
        detail: 'Consulte Saúde dos dados',
      });
    }
    if ((snapshot.guardrails.slaAtRisk.value ?? 0) > 0) {
      items.push({
        id: 'sla',
        label: `${snapshot.guardrails.slaAtRisk.value} SLA comprometido`,
        detail: 'Primeira resposta vencida no período',
      });
    }
    if ((snapshot.guardrails.syncFailed.value ?? 0) > 0) {
      items.push({
        id: 'sync',
        label: `${snapshot.guardrails.syncFailed.value} falhas de sync`,
        detail: 'Exigem investigação operacional',
      });
    }
    if ((snapshot.guardrails.criticalTickets.value ?? 0) > 0) {
      items.push({
        id: 'critical',
        label: `${snapshot.guardrails.criticalTickets.value} tickets críticos`,
        detail: 'Criados no período',
      });
    }
    return items;
  }, [snapshot]);

  const domainRows: Record<DomainTab, IndicatorRow[]> = {
    operacao: [
      { id: 'completed', label: 'Atendimentos concluídos', metric: snapshot.kpis.completedAppointments },
      { id: 'units', label: 'Unidades em operação', metric: snapshot.kpis.operatingEstablishments },
      { id: 'created', label: 'Agendamentos criados', metric: snapshot.drivers.appointmentsCreated },
      { id: 'confirmed', label: 'Agendamentos confirmados', metric: snapshot.drivers.appointmentsConfirmed },
      { id: 'completion', label: 'Taxa de conclusão', metric: snapshot.drivers.completionRate, format: 'percent' },
      { id: 'approved', label: 'Estabelecimentos aprovados', metric: snapshot.drivers.approvedEstablishments },
      { id: 'activated', label: 'Ativações em 14 dias', metric: snapshot.drivers.activatedEstablishments14d },
      { id: 'ttv', label: 'Tempo até valor', metric: snapshot.drivers.averageDaysToFirstCompletion, format: 'days', inverse: true },
    ],
    atendimento: [
      { id: 'completed2', label: 'Atendimentos concluídos', metric: snapshot.kpis.completedAppointments },
      { id: 'completion2', label: 'Taxa de conclusão', metric: snapshot.drivers.completionRate, format: 'percent' },
      { id: 'cancel', label: 'Taxa de cancelamento', metric: snapshot.guardrails.cancellationRate, format: 'percent', inverse: true },
      { id: 'sla', label: 'SLA comprometido', metric: snapshot.guardrails.slaAtRisk, inverse: true },
      { id: 'critical', label: 'Tickets críticos', metric: snapshot.guardrails.criticalTickets, inverse: true },
      { id: 'sync', label: 'Falhas de sincronização', metric: snapshot.guardrails.syncFailed, inverse: true },
    ],
    pessoas: [
      { id: 'returning', label: 'Recorrência identificada', metric: snapshot.kpis.returningClientsRate, format: 'percent' },
      { id: 'new', label: 'Clientes novos', metric: snapshot.drivers.newClients },
      { id: 'ret', label: 'Clientes recorrentes', metric: snapshot.drivers.returningClients },
      { id: 'activeClients', label: 'Clientes ativos', metric: snapshot.drivers.activeClients },
      { id: 'pros', label: 'Profissionais ativos', metric: snapshot.drivers.activeProfessionals },
      { id: 'owners', label: 'Proprietários ativos', metric: snapshot.drivers.activeOwners },
      { id: 'idcov', label: 'Cobertura de identificação', metric: snapshot.guardrails.identifiedClientCoverage, format: 'percent' },
    ],
    qualidade: [
      { id: 'cancel2', label: 'Taxa de cancelamento', metric: snapshot.guardrails.cancellationRate, format: 'percent', inverse: true },
      { id: 'idcov2', label: 'Cobertura de identificação', metric: snapshot.guardrails.identifiedClientCoverage, format: 'percent' },
      { id: 'critical2', label: 'Tickets críticos', metric: snapshot.guardrails.criticalTickets, inverse: true },
      { id: 'sla2', label: 'SLA comprometido', metric: snapshot.guardrails.slaAtRisk, inverse: true },
      { id: 'sync2', label: 'Falhas de sincronização', metric: snapshot.guardrails.syncFailed, inverse: true },
    ],
  };

  const stripItems = [
    {
      label: 'Estado geral',
      value: attentionItems.length ? 'Atenção' : 'Operacional',
      tone: attentionItems.length ? 'warning' as const : 'neutral' as const,
    },
    {
      label: 'Serviços',
      value: 'Em preparação',
    },
    {
      label: 'Incidentes',
      value: '0 ativos',
    },
    {
      label: 'Fila / risco',
      value: String(snapshot.guardrails.slaAtRisk.value ?? '—'),
      detail: 'SLA',
      tone: (snapshot.guardrails.slaAtRisk.value ?? 0) > 0 ? 'warning' as const : undefined,
    },
    {
      label: 'Dados',
      value: snapshot.dataQuality.missingDays > 0 ? 'Lacunas' : 'Atualizados',
      detail: formatDate(snapshot.dataQuality.latestCompleteDate),
      tone: snapshot.dataQuality.missingDays > 0 ? 'warning' as const : undefined,
    },
  ];

  return (
    <View style={styles.dashboard}>
      <View style={styles.controls}>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Período</Text>
          <View style={styles.chipRow}>
            {([7, 28, 90] as const).map((days) => (
              <OpsChip
                key={days}
                label={`${days} dias`}
                selected={rangeDays === days}
                onPress={() => onRangeChange(days)}
              />
            ))}
          </View>
        </View>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Escopo</Text>
          <View style={styles.chipRow}>
            <OpsChip
              label={globalScope.label}
              selected={selectedScope.type === 'global'}
              onPress={() => onScopeChange(globalScope)}
            />
            {organizations.map((scope) => (
              <OpsChip
                key={scope.id}
                label={scope.label}
                selected={selectedOrganizationId === scope.id}
                onPress={() => onScopeChange(scope)}
              />
            ))}
          </View>
        </View>
        {establishments.length ? (
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>Estabelecimento</Text>
            <View style={styles.chipRow}>
              {establishments.map((scope) => (
                <OpsChip
                  key={scope.id}
                  label={scope.label}
                  selected={selectedScope.type === 'establishment' && selectedScope.id === scope.id}
                  onPress={() => onScopeChange(scope)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View style={styles.refreshRow}>
          <Text style={styles.metaText}>
            Atualizado {formatRelative(snapshot.generatedAt)} · {snapshot.scope.label}
          </Text>
          <OpsSecondaryButton
            label={refreshing ? 'Atualizando…' : 'Atualizar'}
            disabled={refreshing}
            onPress={onRefresh}
          />
        </View>
      </View>

      <OpsStrip items={stripItems} />

      <OpsGrid compact={compact}>
        <OpsMainCol>
          <OpsPanel
            title="Tendência operacional"
            meta={<Text style={styles.metaText}>{snapshot.period.days} dias</Text>}
          >
            <Text style={styles.panelHint}>
              Atendimentos concluídos por dia. Barras não representam valores monetários.
            </Text>
            <TrendBars snapshot={snapshot} />
          </OpsPanel>

          <OpsPanel title="Indicadores operacionais">
            <View style={styles.chipRow}>
              {([
                ['operacao', 'Operação'],
                ['atendimento', 'Atendimento'],
                ['pessoas', 'Pessoas'],
                ['qualidade', 'Qualidade'],
              ] as const).map(([id, label]) => (
                <OpsChip
                  key={id}
                  label={label}
                  selected={domain === id}
                  onPress={() => setDomain(id)}
                />
              ))}
            </View>
            <IndicatorTable rows={domainRows[domain]} />
          </OpsPanel>
        </OpsMainCol>

        <OpsSideCol sticky={!compact}>
          <OpsPanel title="Atenção necessária">
            {attentionItems.length === 0 ? (
              <OpsInlineNotice message="Nenhum item exige ação imediata nesta sessão." tone="success" />
            ) : (
              <View style={styles.attentionList}>
                {attentionItems.map((item) => (
                  <View key={item.id} style={styles.attentionRow}>
                    <Text style={styles.attentionLabel}>{item.label}</Text>
                    <Text style={styles.attentionDetail}>{item.detail}</Text>
                  </View>
                ))}
              </View>
            )}
          </OpsPanel>

          <OpsPanel title="Qualidade dos dados">
            <OpsDefList
              rows={[
                {
                  label: 'Snapshot até',
                  value: formatDate(snapshot.dataQuality.latestCompleteDate),
                },
                {
                  label: 'Dias ausentes',
                  value: String(snapshot.dataQuality.missingDays),
                  tone: snapshot.dataQuality.missingDays > 0 ? 'caution' : 'neutral',
                },
                {
                  label: 'Comparação',
                  value: snapshot.dataQuality.comparisonAvailable ? 'Disponível' : 'Incompleta',
                  tone: snapshot.dataQuality.comparisonAvailable ? 'neutral' : 'caution',
                },
                {
                  label: 'Definição',
                  value: `v${snapshot.definitionVersion}`,
                },
              ]}
            />
          </OpsPanel>

          <OpsPanel title="Serviços e capacidade">
            <OpsTableShell>
              <OpsTableHead gridStyle={sourceGrid}>
                <OpsHeadCell>Fonte</OpsHeadCell>
                <OpsHeadCell>Estado</OpsHeadCell>
                <OpsHeadCell>Desde</OpsHeadCell>
              </OpsTableHead>
              {snapshot.dataQuality.sourceCoverage.map((source) => (
                <OpsTableRow key={source.family} gridStyle={sourceGrid}>
                  <OpsCell strong numberOfLines={2}>{source.label}</OpsCell>
                  <OpsCell
                    tone={source.status === 'available' ? undefined : 'warning'}
                  >
                    {source.status === 'available' ? 'Ok' : source.status === 'partial' ? 'Parcial' : 'Indisp.'}
                  </OpsCell>
                  <OpsCell muted>{formatDate(source.availableFrom)}</OpsCell>
                </OpsTableRow>
              ))}
            </OpsTableShell>
          </OpsPanel>
        </OpsSideCol>
      </OpsGrid>

      <Text style={styles.freshness}>
        Gerado em {new Date(snapshot.generatedAt).toLocaleString('pt-BR')} · {snapshot.timezone}
        {snapshot.dataQuality.freshnessAt
          ? ` · fonte atualizada em ${new Date(snapshot.dataQuality.freshnessAt).toLocaleString('pt-BR')}`
          : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dashboard: { width: '100%', gap: 18 },
  controls: { gap: 12 },
  controlGroup: { gap: 6 },
  controlLabel: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  refreshRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  metaText: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  panelHint: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  chartBlock: { gap: 8 },
  chart: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  barSlot: { minWidth: 2, flex: 1, justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    minWidth: 2,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: '#5A7263',
  },
  missingBar: {
    height: 4,
    width: '100%',
    minWidth: 2,
    borderRadius: 1,
    backgroundColor: cloudTheme.colors.border,
  },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  chartAxisText: { color: cloudTheme.colors.textMuted, fontSize: 11, fontWeight: '600' },
  attentionList: { gap: 0 },
  attentionRow: {
    gap: 2,
    minHeight: 48,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  attentionLabel: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '700' },
  attentionDetail: { color: cloudTheme.colors.textSecondary, fontSize: 12 },
  freshness: { color: cloudTheme.colors.textMuted, fontSize: 12 },
});
