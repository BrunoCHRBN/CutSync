import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs } from '@/components/cloud/filter-tabs';
import { MetricCard } from '@/components/cloud/metric-card';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { OperationOverviewScreen } from '@/modules/operation/operation-overview';
import { cloudTheme } from '@/theme/cloud-components';

type Period = '60m' | '6h' | '24h' | '7d';

const periods: { id: Period; label: string }[] = [
  { id: '60m', label: '60 min' },
  { id: '6h', label: '6 h' },
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 dias' },
];

type ServiceRow = {
  id: string;
  service: string;
  availability: string;
  latency: string;
  errors: string;
  status: string;
};

export function OperationHome() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const [period, setPeriod] = useState<Period>('60m');
  const periodLabel = periods.find((item) => item.id === period)?.label ?? period;
  const serviceRows: ServiceRow[] = [];

  if (section === 'services') {
    return (
      <View style={styles.page}>
        <PageHeader
          eyebrow="OPERAÇÃO"
          title="Serviços"
          description="Catálogo monitorado com disponibilidade, latência, erros e estado. A tabela permanece vazia até a fonte homologada."
          badge="PREPARADO"
          badgeTone="warning"
        />
        <DataTable
          columns={[
            { key: 'service', header: 'Serviço', render: (row: ServiceRow) => row.service },
            { key: 'availability', header: 'Disponibilidade', render: (row) => row.availability },
            { key: 'latency', header: 'Latência', render: (row) => row.latency },
            { key: 'errors', header: 'Erros', render: (row) => row.errors },
            {
              key: 'status',
              header: 'Estado',
              render: (row) => <StatusBadge label={row.status} tone="neutral" />,
            },
            { key: 'action', header: 'Ação', render: () => '—' },
          ]}
          rows={serviceRows}
          rowKey={(row) => row.id}
          emptyLabel="Nenhum serviço monitorado disponível nesta sessão."
        />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.chrome}>
        <PageHeader
          eyebrow="OPERAÇÃO"
          title="Visão operacional"
          description="Disponibilidade, latência em milissegundos, incidentes e serviços. O cockpit executivo abaixo usa a fonte homologada."
          badge="AO VIVO"
          badgeTone="info"
          actions={<FilterTabs tabs={periods} value={period} onChange={setPeriod} />}
        />

        <View style={styles.metrics}>
          <MetricCard
            label="Disponibilidade"
            value="Operacional"
            detail="Sem incidente homologado ativo"
            tone="success"
            emphasize
          />
          <MetricCard
            label="Latência média"
            value="—"
            detail={`Período ${periodLabel} · ms`}
            tone="info"
            emphasize
          />
          <MetricCard
            label="Incidentes ativos"
            value="0"
            detail="Sem fonte de incidentes homologada"
            tone="success"
            emphasize
          />
          <MetricCard
            label="Eventos processados"
            value="—"
            detail="Volumes reais no cockpit executivo"
            emphasize
          />
        </View>

        <View style={styles.twoCol}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Latência contínua</Text>
              <StatusBadge label="ms" tone="info" />
            </View>
            <Text style={styles.panelHint}>Linha contínua · faixa aceitável · eixo temporal</Text>
            <FeedbackState
              kind="partial"
              title="Histórico de latência ainda indisponível"
              message={`Período ${periodLabel} selecionado. A RPC atual não expõe série em milissegundos.`}
            />
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Incidentes e alertas</Text>
            <FeedbackState
              kind="empty"
              title="Nenhum incidente ativo"
              message="Quando a capacidade de incidentes estiver homologada, o painel listará impacto e estado."
            />
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Serviços monitorados</Text>
          <DataTable
            columns={[
              { key: 'service', header: 'Serviço', render: (row: ServiceRow) => row.service },
              { key: 'availability', header: 'Disponibilidade', render: (row) => row.availability },
              { key: 'latency', header: 'Latência', render: (row) => `${row.latency} ms` },
              { key: 'errors', header: 'Erros', render: (row) => row.errors },
              { key: 'status', header: 'Estado', render: (row) => row.status },
              { key: 'action', header: 'Ação', render: () => '—' },
            ]}
            rows={serviceRows}
            rowKey={(row) => row.id}
            emptyLabel="Catálogo de serviços em preparação — nenhum registro simulado."
          />
        </View>
      </View>

      <OperationOverviewScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: cloudTheme.spacing.md },
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
    padding: cloudTheme.layout.contentPadding,
  },
  chrome: {
    gap: cloudTheme.spacing.lg,
    paddingHorizontal: cloudTheme.layout.contentPadding,
    paddingTop: cloudTheme.spacing.xl,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  twoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  panel: {
    minWidth: 280,
    flexGrow: 1,
    flexBasis: 320,
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
  },
  panelTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  panelHint: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted },
});
