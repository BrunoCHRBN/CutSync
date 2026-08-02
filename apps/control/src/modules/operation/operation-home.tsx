import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FilterTabs } from '@/components/cloud/filter-tabs';
import { MetricCard } from '@/components/cloud/metric-card';
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

export function OperationHome() {
  const [period, setPeriod] = useState<Period>('60m');

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <StatusBadge label="OPERAÇÃO" tone="info" />
          <Text style={styles.title}>Visão operacional</Text>
          <Text style={styles.detail}>
            Métricas, latência contínua e faixa aceitável por período. Os indicadores executivos abaixo reutilizam a fonte já homologada.
          </Text>
        </View>
        <FilterTabs tabs={periods} value={period} onChange={setPeriod} />
      </View>

      <View style={styles.metrics}>
        <MetricCard
          label="Latência mediana"
          value={period === '60m' ? '—' : '—'}
          detail={`Período ${periods.find((item) => item.id === period)?.label}`}
          tone="info"
        />
        <MetricCard label="Faixa aceitável" value="OK" detail="Limites operacionais monitorados" tone="success" />
        <MetricCard label="Serviços observados" value="—" detail="Filtre por serviço nas próximas iterações" />
      </View>

      <OperationOverviewScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: cloudTheme.spacing.lg },
  header: { gap: cloudTheme.spacing.md, paddingHorizontal: cloudTheme.spacing.xxl, paddingTop: cloudTheme.spacing.xl },
  headerCopy: { gap: cloudTheme.spacing.xs },
  title: { ...cloudTheme.type.pageTitle, color: cloudTheme.colors.text },
  detail: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary, maxWidth: 720 },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
    paddingHorizontal: cloudTheme.spacing.xxl,
  },
});
