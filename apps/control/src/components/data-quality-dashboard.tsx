import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  ControlButton,
  ControlCard,
  ControlEmptyState,
  ControlField,
  ControlMetricCard,
  ControlNotice,
  ControlStatusBadge,
  type ControlTone,
} from '@/components/control-ui';
import {
  ControlAnalyticsHealthApiError,
  type ControlAnalyticsHealth,
  type ControlAnalyticsRunStatus,
  type ControlAnalyticsSourceStatus,
} from '@/services/control-analytics-health';
import {
  controlColors,
  controlLayout,
  controlSpacing,
  controlType,
} from '@/theme/tokens';

interface DataQualityDashboardProps {
  health: ControlAnalyticsHealth;
  canReprocess: boolean;
  reprocessing: boolean;
  onReprocess: (input: {
    start: string;
    end: string;
    reason: string;
  }) => Promise<void>;
}

function formatDate(value: string | null): string {
  return value ? value.split('-').reverse().join('/') : 'Ainda indisponível';
}

function sourceTone(status: ControlAnalyticsSourceStatus): ControlTone {
  if (status === 'available') return 'success';
  if (status === 'partial') return 'warning';
  return 'danger';
}

function sourceStatusLabel(status: ControlAnalyticsSourceStatus): string {
  const labels = {
    available: 'DISPONÍVEL',
    partial: 'PARCIAL',
    unavailable: 'INDISPONÍVEL',
  } as const;
  return labels[status];
}

function runTone(status: ControlAnalyticsRunStatus): ControlTone {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'info';
  return 'warning';
}

function runStatusLabel(status: ControlAnalyticsRunStatus): string {
  const labels = {
    pending: 'PENDENTE',
    running: 'EM EXECUÇÃO',
    succeeded: 'CONCLUÍDO',
    failed: 'FALHOU',
  } as const;
  return labels[status];
}

export function DataQualityDashboard({
  health,
  canReprocess,
  reprocessing,
  onReprocess,
}: DataQualityDashboardProps) {
  const { width } = useWindowDimensions();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');
  const metricStyle = width < controlLayout.mobileBreakpoint
    ? { width: '100%' as const }
    : { minWidth: 190, flexGrow: 1, flexBasis: 220 };

  const submit = async () => {
    setFormError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      setFormError('Informe as duas datas no formato AAAA-MM-DD.');
      return;
    }
    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setFormError('Informe uma justificativa de 10 a 500 caracteres.');
      return;
    }
    try {
      await onReprocess({ start, end, reason });
      setStart('');
      setEnd('');
      setReason('');
    } catch (error) {
      setFormError(
        error instanceof ControlAnalyticsHealthApiError
          ? error.message
          : 'Não foi possível solicitar o reprocessamento.',
      );
    }
  };

  return (
    <View style={styles.dashboard}>
      <View style={styles.metricGrid}>
        <ControlMetricCard
          detail="Primeiro dia com todas as famílias disponíveis"
          label="Cobertura integral"
          style={metricStyle}
          value={formatDate(health.coverageStartDate)}
        />
        <ControlMetricCard
          detail="Último snapshot global finalizado"
          label="Dados reconciliados até"
          style={metricStyle}
          tone={health.latestCompleteDate ? 'success' : 'warning'}
          value={formatDate(health.latestCompleteDate)}
        />
        <ControlMetricCard
          detail="Nos últimos 180 dias cobertos"
          label="Dias ausentes"
          style={metricStyle}
          tone={health.missingDates.length ? 'warning' : 'success'}
          value={health.missingDates.length}
        />
        <ControlMetricCard
          detail={`${health.queue.running} em execução · ${health.queue.failed} com falha`}
          label="Fila pendente"
          style={metricStyle}
          tone={health.queue.failed ? 'danger' : health.queue.pending ? 'warning' : 'success'}
          value={health.queue.pending}
        />
      </View>

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>Cobertura por fonte</Text>
        <Text style={styles.sectionDescription}>
          Zero só é exibido quando a fonte já existia e o dia foi finalizado.
        </Text>
      </View>
      <View style={styles.sourceGrid}>
        {health.sourceCoverage.map((source) => (
          <ControlCard key={source.family} style={styles.sourceCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{source.label}</Text>
              <ControlStatusBadge
                label={sourceStatusLabel(source.status)}
                tone={sourceTone(source.status)}
              />
            </View>
            <Text style={styles.meta}>
              Cobertura desde {formatDate(source.availableFrom)}
            </Text>
          </ControlCard>
        ))}
      </View>

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>Comparações históricas</Text>
        <Text style={styles.sectionDescription}>
          Cada janela exige o período atual e o período anterior integralmente cobertos.
        </Text>
      </View>
      <View style={styles.comparisonGrid}>
        {health.comparisonAvailability.map((comparison) => (
          <ControlCard key={comparison.rangeDays} style={styles.comparisonCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.cardTitle}>{comparison.rangeDays} dias</Text>
              <ControlStatusBadge
                label={comparison.available ? 'DISPONÍVEL' : 'AGUARDANDO BASE'}
                tone={comparison.available ? 'success' : 'warning'}
              />
            </View>
            <Text style={styles.meta}>
              {comparison.available
                ? 'A comparação equivalente já pode ser utilizada.'
                : `Disponibilidade estimada: ${formatDate(comparison.availableOn)}`}
            </Text>
          </ControlCard>
        ))}
      </View>

      {health.missingDates.length ? (
        <ControlNotice
          message={health.missingDates.map(formatDate).join(', ')}
          title="Datas sem snapshot global"
          tone="warning"
        />
      ) : (
        <ControlNotice
          message="Não há lacunas dentro da janela integral atualmente monitorada."
          title="Continuidade dos snapshots"
          tone="success"
        />
      )}

      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>Processamentos recentes</Text>
        <Text style={styles.sectionDescription}>
          A fila processa no máximo três dias por execução para manter o trabalho limitado.
        </Text>
      </View>
      {health.recentRuns.length ? (
        <View style={styles.runList}>
          {health.recentRuns.map((run) => (
            <ControlCard key={run.id} style={styles.runCard}>
              <View style={styles.rowBetween}>
                <View style={styles.runCopy}>
                  <Text style={styles.cardTitle}>
                    {run.runType === 'daily'
                      ? 'Finalização diária'
                      : run.runType === 'backfill'
                        ? 'Carga histórica'
                        : 'Reprocessamento manual'}
                  </Text>
                  <Text style={styles.meta}>
                    {formatDate(run.start)} a {formatDate(run.end)} · {run.processedDays}/{run.totalDays} dia(s)
                  </Text>
                </View>
                <ControlStatusBadge
                  label={runStatusLabel(run.status)}
                  tone={runTone(run.status)}
                />
              </View>
              {run.errorCode ? (
                <Text selectable style={styles.errorCode}>
                  Código seguro: {run.errorCode}
                </Text>
              ) : null}
            </ControlCard>
          ))}
        </View>
      ) : (
        <ControlEmptyState
          description="As finalizações diárias e solicitações manuais aparecerão aqui."
          title="Nenhum processamento registrado"
        />
      )}

      {canReprocess ? (
        <ControlCard style={styles.reprocessCard} tone="warning">
          <View style={styles.sectionCopy}>
            <Text style={styles.sectionTitle}>Reprocessar snapshots</Text>
            <Text style={styles.sectionDescription}>
              Ação exclusiva do proprietário. Use apenas para dias completos, por no máximo 14 dias.
            </Text>
          </View>
          <View style={styles.dateFields}>
            <ControlField
              containerStyle={styles.dateField}
              editable={!reprocessing}
              label="Data inicial"
              maxLength={10}
              onChangeText={(value) => {
                setStart(value);
                setFormError('');
              }}
              placeholder="AAAA-MM-DD"
              testID="control-analytics-reprocess-start"
              value={start}
            />
            <ControlField
              containerStyle={styles.dateField}
              editable={!reprocessing}
              label="Data final"
              maxLength={10}
              onChangeText={(value) => {
                setEnd(value);
                setFormError('');
              }}
              placeholder="AAAA-MM-DD"
              testID="control-analytics-reprocess-end"
              value={end}
            />
          </View>
          <ControlField
            editable={!reprocessing}
            helper={`${reason.trim().length}/500 caracteres`}
            label="Justificativa auditável"
            maxLength={500}
            multiline
            onChangeText={(value) => {
              setReason(value);
              setFormError('');
            }}
            placeholder="Explique por que este intervalo precisa ser recalculado."
            testID="control-analytics-reprocess-reason"
            value={reason}
          />
          {formError ? (
            <ControlNotice
              message={formError}
              testID="control-analytics-reprocess-error"
              tone="danger"
            />
          ) : null}
          <ControlButton
            busy={reprocessing}
            disabled={reprocessing}
            label="Solicitar reprocessamento"
            onPress={() => { void submit(); }}
            testID="control-analytics-reprocess-submit"
          />
        </ControlCard>
      ) : (
        <ControlNotice
          message="Seu papel pode consultar cobertura e histórico. Reprocessamentos exigem uma sessão AAL2 do proprietário."
          title="Consulta somente leitura"
          tone="info"
        />
      )}

      <Text style={styles.freshness}>
        Verificado em {new Date(health.generatedAt).toLocaleString('pt-BR')} · {health.timezone}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dashboard: { width: '100%', gap: controlSpacing.xl },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.md },
  sectionCopy: { gap: controlSpacing.xxs },
  sectionTitle: { ...controlType.sectionTitle, color: controlColors.text },
  sectionDescription: { ...controlType.small, color: controlColors.textSecondary },
  sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.md },
  sourceCard: { minWidth: 220, flexGrow: 1, flexBasis: 260 },
  comparisonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.md },
  comparisonCard: { minWidth: 220, flexGrow: 1, flexBasis: 280 },
  rowBetween: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: controlSpacing.sm,
  },
  cardTitle: { ...controlType.cardTitle, color: controlColors.text },
  meta: { ...controlType.small, color: controlColors.textSecondary },
  runList: { gap: controlSpacing.sm },
  runCard: { gap: controlSpacing.sm },
  runCopy: { minWidth: 200, flex: 1, gap: controlSpacing.xxs },
  errorCode: { ...controlType.smallStrong, color: controlColors.danger },
  reprocessCard: { gap: controlSpacing.lg },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.md },
  dateField: { minWidth: 220, flex: 1 },
  freshness: { ...controlType.small, color: controlColors.textMuted },
});
