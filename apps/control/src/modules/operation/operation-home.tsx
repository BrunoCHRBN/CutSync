import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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

/**
 * Short-window latency series (ms) is not yet exposed by control executive RPCs.
 * Period tabs prepare the V5 contract; values remain empty until a real source lands.
 */
export function OperationHome() {
  const [period, setPeriod] = useState<Period>('60m');
  const periodLabel = periods.find((item) => item.id === period)?.label ?? period;

  return (
    <View style={styles.wrap}>
      <View style={styles.chrome}>
        <PageHeader
          eyebrow="OPERAÇÃO"
          title="Visão operacional"
          description="Disponibilidade, latência em milissegundos e serviços monitorados. Indicadores executivos abaixo usam a fonte homologada; a série contínua de latência permanece preparada."
          badge="AO VIVO"
          badgeTone="info"
          actions={<FilterTabs tabs={periods} value={period} onChange={setPeriod} />}
        />

        <View style={styles.metrics}>
          <MetricCard
            label="Latência média"
            value="—"
            detail={`Período ${periodLabel} · unidade ms`}
            tone="info"
          />
          <MetricCard
            label="Faixa aceitável"
            value="Preparada"
            detail="Limites operacionais aguardam série de latência"
            tone="neutral"
          />
          <MetricCard
            label="Incidentes ativos"
            value="0"
            detail="Sem fonte de incidentes homologada"
            tone="success"
          />
          <MetricCard
            label="Eventos processados"
            value="—"
            detail="Use o cockpit executivo para volumes reais"
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Latência contínua</Text>
            <StatusBadge label="ms" tone="info" />
          </View>
          <FeedbackState
            kind="partial"
            title="Histórico de latência ainda indisponível"
            message={`O período ${periodLabel} está selecionado, mas a RPC atual não expõe série temporal em milissegundos. Nenhum valor simulado é exibido.`}
          />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Serviços monitorados</Text>
          <FeedbackState
            kind="empty"
            title="Catálogo de serviços em preparação"
            message="Quando a fonte de disponibilidade/latência por serviço estiver disponível, a tabela listará serviço, disponibilidade, latência, erros, estado e ação."
          />
        </View>
      </View>

      <OperationOverviewScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: cloudTheme.spacing.lg },
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
  panel: {
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
});
