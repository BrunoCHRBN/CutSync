import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  ControlButton,
  ControlField,
  ControlNotice,
} from '@/components/control-ui';
import {
  OpsCell,
  OpsHeadCell,
  OpsInlineNotice,
  OpsPanel,
  OpsSecondaryButton,
  OpsStrip,
  OpsTableHead,
  OpsTableRow,
  OpsTableShell,
  OpsTextAction,
  opsGridStyle,
} from '@/modules/operation/ops-console';
import {
  ControlAnalyticsHealthApiError,
  type ControlAnalyticsHealth,
  type ControlAnalyticsRunStatus,
  type ControlAnalyticsSourceStatus,
} from '@/services/control-analytics-health';
import { cloudTheme } from '@/theme/cloud-components';

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
  return value ? value.split('-').reverse().join('/') : '—';
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sourceState(status: ControlAnalyticsSourceStatus): {
  label: string;
  tone?: 'warning' | 'danger';
} {
  if (status === 'available') return { label: 'Atualizada' };
  if (status === 'partial') return { label: 'Parcial', tone: 'warning' };
  return { label: 'Indisponível', tone: 'danger' };
}

function runTypeLabel(runType: string): string {
  if (runType === 'daily') return 'Finalização diária';
  if (runType === 'backfill') return 'Carga histórica';
  return 'Reprocessamento manual';
}

function runStatusLabel(status: ControlAnalyticsRunStatus): {
  label: string;
  tone?: 'warning' | 'danger';
} {
  if (status === 'succeeded') return { label: 'Concluído' };
  if (status === 'failed') return { label: 'Falhou', tone: 'danger' };
  if (status === 'running') return { label: 'Em execução', tone: 'warning' };
  return { label: 'Pendente', tone: 'warning' };
}

function durationLabel(startedAt: string, finishedAt: string | null): string {
  const start = Date.parse(startedAt);
  const end = finishedAt ? Date.parse(finishedAt) : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 1) return '< 1 min';
  return `${minutes} min`;
}

const sourceGrid = opsGridStyle('minmax(220px, 2fr) 120px 130px 120px');
const periodGrid = opsGridStyle('100px minmax(220px, 2fr) 140px');
const runGrid = opsGridStyle('minmax(160px, 1.4fr) minmax(140px, 1.2fr) 140px 90px 110px');

export function DataQualityDashboard({
  health,
  canReprocess,
  reprocessing,
  onReprocess,
}: DataQualityDashboardProps) {
  const { width } = useWindowDimensions();
  const [adminOpen, setAdminOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

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
      setAdminOpen(false);
    } catch (error) {
      setFormError(
        error instanceof ControlAnalyticsHealthApiError
          ? error.message
          : 'Não foi possível solicitar o reprocessamento.',
      );
    }
  };

  const previousDate = health.latestCompleteDate
    ? (() => {
        const date = new Date(`${health.latestCompleteDate}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() - 1);
        return date.toISOString().slice(0, 10);
      })()
    : null;

  return (
    <View style={styles.dashboard}>
      <OpsStrip
        items={[
          {
            label: 'Última data',
            value: formatDate(health.latestCompleteDate),
            tone: health.latestCompleteDate ? undefined : 'warning',
          },
          {
            label: 'Data anterior',
            value: formatDate(previousDate),
          },
          {
            label: 'Dias ausentes',
            value: String(health.missingDates.length),
            tone: health.missingDates.length ? 'warning' : undefined,
          },
          {
            label: 'Fila pendente',
            value: String(health.queue.pending),
            detail: `${health.queue.running} exec · ${health.queue.failed} falha`,
            tone: health.queue.failed
              ? 'danger'
              : health.queue.pending
                ? 'warning'
                : undefined,
          },
        ]}
      />

      {health.missingDates.length ? (
        <OpsInlineNotice
          tone="warning"
          message={`△ Snapshot global com lacunas: ${health.missingDates.map(formatDate).join(', ')}. Os dados por fonte continuam disponíveis.`}
        />
      ) : (
        <OpsInlineNotice
          tone="success"
          message="Snapshot global contínuo na janela monitorada. Os dados por fonte seguem disponíveis."
        />
      )}

      <OpsPanel title="Cobertura por fonte">
        <OpsTableShell>
          <OpsTableHead gridStyle={sourceGrid}>
            <OpsHeadCell>Fonte</OpsHeadCell>
            <OpsHeadCell>Cobertura</OpsHeadCell>
            <OpsHeadCell>Última carga</OpsHeadCell>
            <OpsHeadCell>Estado</OpsHeadCell>
          </OpsTableHead>
          {health.sourceCoverage.map((source) => {
            const state = sourceState(source.status);
            return (
              <OpsTableRow key={source.family} gridStyle={sourceGrid} accent={Boolean(state.tone)}>
                <OpsCell strong numberOfLines={2}>{source.label}</OpsCell>
                <OpsCell>Disponível</OpsCell>
                <OpsCell muted>{formatDate(source.availableFrom)}</OpsCell>
                <OpsCell tone={state.tone}>{state.label}</OpsCell>
              </OpsTableRow>
            );
          })}
        </OpsTableShell>
      </OpsPanel>

      <OpsPanel title="Comparações históricas">
        <OpsTableShell>
          <OpsTableHead gridStyle={periodGrid}>
            <OpsHeadCell>Período</OpsHeadCell>
            <OpsHeadCell>Disponibilidade</OpsHeadCell>
            <OpsHeadCell>Estado</OpsHeadCell>
          </OpsTableHead>
          {health.comparisonAvailability.map((comparison) => (
            <OpsTableRow
              key={comparison.rangeDays}
              gridStyle={periodGrid}
              accent={!comparison.available}
            >
              <OpsCell strong>{comparison.rangeDays} dias</OpsCell>
              <OpsCell numberOfLines={2}>
                {comparison.available
                  ? 'Disponível para comparação equivalente'
                  : `Disponível até ${formatDate(comparison.availableOn)}`}
              </OpsCell>
              <OpsCell tone={comparison.available ? undefined : 'warning'}>
                {comparison.available ? 'Pronto' : 'Acompanhando'}
              </OpsCell>
            </OpsTableRow>
          ))}
        </OpsTableShell>
      </OpsPanel>

      <OpsPanel
        title="Processamentos recentes"
        meta={canReprocess ? (
          <OpsTextAction
            label={adminOpen ? 'Ocultar ações ▴' : 'Ações administrativas ▾'}
            onPress={() => setAdminOpen((current) => !current)}
          />
        ) : undefined}
      >
        {health.recentRuns.length ? (
          <OpsTableShell>
            <OpsTableHead gridStyle={runGrid}>
              <OpsHeadCell>Execução</OpsHeadCell>
              <OpsHeadCell>Tipo</OpsHeadCell>
              <OpsHeadCell>Início</OpsHeadCell>
              <OpsHeadCell>Duração</OpsHeadCell>
              <OpsHeadCell>Estado</OpsHeadCell>
            </OpsTableHead>
            {health.recentRuns.map((run) => {
              const status = runStatusLabel(run.status);
              return (
                <OpsTableRow key={run.id} gridStyle={runGrid} accent={Boolean(status.tone)}>
                  <OpsCell strong numberOfLines={2}>
                    {formatDate(run.start)} → {formatDate(run.end)}
                  </OpsCell>
                  <OpsCell numberOfLines={2}>{runTypeLabel(run.runType)}</OpsCell>
                  <OpsCell muted>{formatDateTime(run.createdAt)}</OpsCell>
                  <OpsCell muted>{durationLabel(run.createdAt, run.completedAt)}</OpsCell>
                  <OpsCell tone={status.tone}>{status.label}</OpsCell>
                </OpsTableRow>
              );
            })}
          </OpsTableShell>
        ) : (
          <OpsInlineNotice message="Nenhum processamento registrado nesta sessão." />
        )}

        {canReprocess && adminOpen ? (
          <View style={[styles.adminPanel, width < 720 && styles.adminPanelCompact]}>
            <Text style={styles.adminTitle}>Reprocessar snapshot</Text>
            <Text style={styles.adminHint}>
              Ação exclusiva do proprietário. Use apenas para dias completos, por no máximo 14 dias.
            </Text>
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
            <View style={styles.adminActions}>
              <OpsSecondaryButton
                label="Cancelar"
                onPress={() => setAdminOpen(false)}
                disabled={reprocessing}
              />
              <ControlButton
                busy={reprocessing}
                disabled={reprocessing}
                label="Solicitar reprocessamento"
                onPress={() => { void submit(); }}
                testID="control-analytics-reprocess-submit"
              />
            </View>
          </View>
        ) : null}

        {!canReprocess ? (
          <OpsInlineNotice message="Consulta somente leitura. Reprocessamentos exigem sessão AAL2 do proprietário." />
        ) : null}
      </OpsPanel>

      <Text style={styles.freshness}>
        Verificado em {new Date(health.generatedAt).toLocaleString('pt-BR')} · {health.timezone}
        {' · '}
        cobertura integral desde {formatDate(health.coverageStartDate)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dashboard: { width: '100%', gap: 18 },
  adminPanel: {
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  adminPanelCompact: {},
  adminTitle: { color: cloudTheme.colors.text, fontSize: 14, fontWeight: '800' },
  adminHint: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  dateFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  dateField: { minWidth: 220, flex: 1 },
  adminActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  freshness: { color: cloudTheme.colors.textMuted, fontSize: 12 },
});
