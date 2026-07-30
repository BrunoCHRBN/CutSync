import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import {
  ControlCard,
  ControlNotice,
  ControlStatusBadge,
  type ControlTone,
} from '@/components/control-ui';
import type {
  ControlExecutiveDashboard,
  ControlMetricRangeDays,
  ControlMetricScopeOption,
  MetricComparison,
} from '@/services/control-executive';
import {
  controlColors,
  controlLayout,
  controlRadii,
  controlSpacing,
  controlType,
} from '@/theme/tokens';

interface ExecutiveDashboardProps {
  snapshot: ControlExecutiveDashboard;
  rangeDays: ControlMetricRangeDays;
  scopes: ControlMetricScopeOption[];
  selectedScope: ControlMetricScopeOption;
  onRangeChange: (days: ControlMetricRangeDays) => void;
  onScopeChange: (scope: ControlMetricScopeOption) => void;
}

type MetricFormat = 'integer' | 'percent' | 'days';

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

function resolveDelta(metric: MetricComparison, inverse = false): {
  label: string;
  tone: ControlTone;
} {
  if (metric.comparisonStatus !== 'available' || metric.deltaPercent === null) {
    const labels = {
      current_incomplete: 'PERÍODO INCOMPLETO',
      comparison_unavailable: 'SEM BASE COMPARÁVEL',
      source_unavailable: 'FONTE AINDA SEM COBERTURA',
      no_denominator: 'SEM DENOMINADOR',
      previous_zero: 'BASE ANTERIOR ZERO',
    } as const;
    return {
      label: metric.comparisonStatus === 'available'
        ? 'SEM VARIAÇÃO PERCENTUAL'
        : labels[metric.comparisonStatus],
      tone: metric.comparisonStatus === 'current_incomplete' ? 'warning' : 'neutral',
    };
  }
  const direction = metric.deltaPercent === 0 ? 0 : metric.deltaPercent > 0 ? 1 : -1;
  const healthy = inverse ? direction < 0 : direction > 0;
  const label = `${metric.deltaPercent > 0 ? '+' : ''}${metric.deltaPercent.toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })}%`;
  return {
    label,
    tone: direction === 0 ? 'neutral' : healthy ? 'success' : 'warning',
  };
}

function MetricComparisonCard({
  label,
  metric,
  detail,
  format = 'integer',
  inverse = false,
  style,
}: {
  label: string;
  metric: MetricComparison;
  detail: string;
  format?: MetricFormat;
  inverse?: boolean;
  style?: ViewStyle;
}) {
  const delta = resolveDelta(metric, inverse);
  return (
    <ControlCard style={style}>
      <View style={styles.metricHeader}>
        <Text style={styles.metricLabel}>{label}</Text>
        <ControlStatusBadge label={delta.label} tone={delta.tone} />
      </View>
      <Text selectable style={styles.metricValue}>{formatValue(metric.value, format)}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
      <Text style={styles.metricPrevious}>
        Período anterior: {formatValue(metric.previous, format)}
      </Text>
    </ControlCard>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.filterChipPressed,
      ]}
    >
      <Text numberOfLines={1} style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
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
    <ControlCard>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>Atendimentos concluídos por dia</Text>
          <Text style={styles.sectionDescription}>
            Movimento diário no período selecionado. As barras não representam valores monetários.
          </Text>
        </View>
        <ControlStatusBadge label={`${series.length} DIAS`} tone="info" />
      </View>
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
                  { height: Math.max(4, Math.round((point.completedAppointments / maxValue) * 72)) },
                ]}
              />
            )}
          </View>
        ))}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.chartAxisText}>{snapshot.period.start.split('-').reverse().join('/')}</Text>
        <Text style={styles.chartAxisText}>{snapshot.period.end.split('-').reverse().join('/')}</Text>
      </View>
    </ControlCard>
  );
}

export function ExecutiveDashboard({
  snapshot,
  rangeDays,
  scopes,
  selectedScope,
  onRangeChange,
  onScopeChange,
}: ExecutiveDashboardProps) {
  const { width } = useWindowDimensions();
  const primaryCardStyle: ViewStyle = width < controlLayout.mobileBreakpoint
    ? { width: '100%' }
    : width < controlLayout.compactBreakpoint
      ? { width: '48%' }
      : { width: '31%' };
  const secondaryCardStyle: ViewStyle = width < controlLayout.mobileBreakpoint
    ? { width: '100%' }
    : { minWidth: 190, flexGrow: 1, flexBasis: 210 };

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

  return (
    <View style={styles.dashboard}>
      <ControlCard style={styles.filters}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Período</Text>
          <View style={styles.filterRow}>
            {([7, 28, 90] as const).map((days) => (
              <FilterChip
                key={days}
                label={`${days} dias`}
                onPress={() => onRangeChange(days)}
                selected={rangeDays === days}
              />
            ))}
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Escopo</Text>
          <View style={styles.filterRow}>
            <FilterChip
              label={globalScope.label}
              onPress={() => onScopeChange(globalScope)}
              selected={selectedScope.type === 'global'}
            />
            {organizations.map((scope) => (
              <FilterChip
                key={scope.id}
                label={scope.label}
                onPress={() => onScopeChange(scope)}
                selected={selectedOrganizationId === scope.id}
              />
            ))}
          </View>
        </View>
        {establishments.length ? (
          <View style={styles.filterGroup}>
            <Text style={styles.filterLabel}>
              {selectedOrganizationId ? 'Estabelecimento' : 'Estabelecimento independente'}
            </Text>
            <View style={styles.filterRow}>
              {establishments.map((scope) => (
                <FilterChip
                  key={scope.id}
                  label={scope.label}
                  onPress={() => onScopeChange(scope)}
                  selected={selectedScope.type === 'establishment' && selectedScope.id === scope.id}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ControlCard>

      <View style={styles.summary}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>Resultados principais</Text>
          <Text style={styles.sectionDescription}>
            {snapshot.scope.label} · {snapshot.period.days} dias comparados ao período anterior equivalente.
          </Text>
        </View>
        <ControlStatusBadge label={`DEFINIÇÃO V${snapshot.definitionVersion}`} tone="info" />
      </View>

      <View style={styles.metricGrid}>
        <MetricComparisonCard
          detail="Valor operacional entregue no período"
          label="Atendimentos concluídos"
          metric={snapshot.kpis.completedAppointments}
          style={primaryCardStyle}
        />
        <MetricComparisonCard
          detail="Unidades distintas com atendimento concluído"
          label="Unidades em operação"
          metric={snapshot.kpis.operatingEstablishments}
          style={primaryCardStyle}
        />
        <MetricComparisonCard
          detail="Clientes identificados que já haviam sido atendidos no mesmo escopo"
          format="percent"
          label="Recorrência identificada"
          metric={snapshot.kpis.returningClientsRate}
          style={primaryCardStyle}
        />
      </View>

      <TrendBars snapshot={snapshot} />

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>Motores da operação</Text>
        <Text style={styles.sectionDescription}>Indicadores que ajudam a explicar o movimento dos resultados.</Text>
      </View>
      <View style={styles.metricGrid}>
        <MetricComparisonCard detail="Criados no período" label="Agendamentos criados" metric={snapshot.drivers.appointmentsCreated} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Status confirmado" label="Agendamentos confirmados" metric={snapshot.drivers.appointmentsConfirmed} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Concluídos sobre agenda elegível" format="percent" label="Taxa de conclusão" metric={snapshot.drivers.completionRate} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Solicitações aprovadas" label="Estabelecimentos aprovados" metric={snapshot.drivers.approvedEstablishments} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Primeiro atendimento em até 14 dias" label="Ativações em 14 dias" metric={snapshot.drivers.activatedEstablishments14d} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Da aprovação ao primeiro atendimento" format="days" inverse label="Tempo até valor" metric={snapshot.drivers.averageDaysToFirstCompletion} style={secondaryCardStyle} />
      </View>

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>Pessoas e recorrência</Text>
        <Text style={styles.sectionDescription}>
          Os grupos podem se sobrepor e não devem ser somados como identidades distintas.
        </Text>
      </View>
      <View style={styles.metricGrid}>
        <MetricComparisonCard detail="Primeiro atendimento identificado no escopo" label="Clientes novos" metric={snapshot.drivers.newClients} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Com atendimento anterior no escopo" label="Clientes recorrentes" metric={snapshot.drivers.returningClients} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Vínculos profissionais ativos" label="Profissionais ativos" metric={snapshot.drivers.activeProfessionals} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Vínculos de propriedade ativos" label="Proprietários ativos" metric={snapshot.drivers.activeOwners} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Clientes identificados na agenda elegível" label="Clientes ativos" metric={snapshot.drivers.activeClients} style={secondaryCardStyle} />
      </View>

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>Qualidade e risco</Text>
        <Text style={styles.sectionDescription}>Guardrails para interpretar crescimento sem esconder perda de qualidade.</Text>
      </View>
      <View style={styles.metricGrid}>
        <MetricComparisonCard detail="Cancelados sobre agenda elegível" format="percent" inverse label="Taxa de cancelamento" metric={snapshot.guardrails.cancellationRate} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Concluídos com cliente identificado" format="percent" label="Cobertura de identificação" metric={snapshot.guardrails.identifiedClientCoverage} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Criados no período com prioridade crítica" inverse label="Tickets críticos" metric={snapshot.guardrails.criticalTickets} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Primeira resposta vencida no período" inverse label="SLA comprometido" metric={snapshot.guardrails.slaAtRisk} style={secondaryCardStyle} />
        <MetricComparisonCard detail="Operações que exigem investigação" inverse label="Falhas de sincronização" metric={snapshot.guardrails.syncFailed} style={secondaryCardStyle} />
      </View>

      <ControlNotice
        message={
          snapshot.dataQuality.missingDays > 0
            ? `${snapshot.dataQuality.missingDays} dia(s) do período ainda não possuem snapshot finalizado. Comparações incompletas são sinalizadas como sem base.`
            : !snapshot.dataQuality.comparisonAvailable
              ? `O período atual está reconciliado, mas uma ou mais fontes ainda não cobrem toda a comparação. Consulte Saúde dos dados para ver a data de disponibilidade.`
            : `Dados reconciliados até ${snapshot.dataQuality.latestCompleteDate
              ? snapshot.dataQuality.latestCompleteDate.split('-').reverse().join('/')
              : 'o dia corrente'}.`
        }
        title="Qualidade dos dados"
        tone={
          snapshot.dataQuality.missingDays > 0
            || !snapshot.dataQuality.comparisonAvailable
            ? 'warning'
            : 'success'
        }
      />
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
  dashboard: { width: '100%', gap: controlSpacing.xl },
  filters: { gap: controlSpacing.md },
  filterGroup: { gap: controlSpacing.xs },
  filterLabel: { ...controlType.label, color: controlColors.textSecondary, textTransform: 'uppercase' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.xs },
  filterChip: {
    maxWidth: 280,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: controlSpacing.md,
    borderWidth: 1,
    borderColor: controlColors.border,
    borderRadius: controlRadii.pill,
    backgroundColor: controlColors.surfaceMuted,
  },
  filterChipSelected: { borderColor: controlColors.brand, backgroundColor: controlColors.brandSoft },
  filterChipPressed: { opacity: 0.78 },
  filterChipText: { ...controlType.smallStrong, color: controlColors.textSecondary },
  filterChipTextSelected: { color: controlColors.brand },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: controlSpacing.md,
  },
  sectionHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: controlSpacing.md,
  },
  sectionCopy: { minWidth: 220, flex: 1, gap: controlSpacing.xxs },
  sectionTitle: { ...controlType.sectionTitle, color: controlColors.text },
  sectionDescription: { ...controlType.small, color: controlColors.textSecondary },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.md },
  metricHeader: {
    minHeight: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: controlSpacing.sm,
  },
  metricLabel: { ...controlType.smallStrong, minWidth: 120, flex: 1, color: controlColors.textSecondary },
  metricValue: { ...controlType.metric, color: controlColors.brand },
  metricDetail: { ...controlType.small, color: controlColors.textSecondary },
  metricPrevious: { ...controlType.small, color: controlColors.textMuted },
  chart: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    paddingTop: controlSpacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: controlColors.border,
  },
  barSlot: { minWidth: 2, flex: 1, justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    minWidth: 2,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    backgroundColor: controlColors.accent,
  },
  missingBar: {
    height: 4,
    width: '100%',
    minWidth: 2,
    borderRadius: 2,
    backgroundColor: controlColors.border,
  },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  chartAxisText: { ...controlType.small, color: controlColors.textMuted },
  freshness: { ...controlType.small, color: controlColors.textMuted },
});
