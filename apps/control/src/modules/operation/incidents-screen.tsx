import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ControlButton } from '@/components/control-ui';
import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { MetricCard } from '@/components/cloud/metric-card';
import { StatusBadge } from '@/components/cloud/status-badge';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import { cloudTheme } from '@/theme/cloud-components';

type IncidentRow = {
  id: string;
  service: string;
  impact: string;
  status: string;
};

const placeholderIncidents: IncidentRow[] = [];

export function IncidentsScreen() {
  const { can } = useControlAuth();
  const action = resolveCloudActionAvailability({
    action: 'open_incident',
    can,
  });

  return (
    <SectionPage
      eyebrow="OPERAÇÃO"
      title="Incidentes"
      description="Alertas ordenados por impacto e histórico operacional. A escrita permanece bloqueada até existir RPC e permissão próprias."
    >
      <View style={styles.metrics}>
        <MetricCard label="Abertos" value="0" detail="Sem incidentes ativos nesta sessão" />
        <MetricCard label="Impacto alto" value="0" tone="warning" />
        <MetricCard label="Últimas 24h" value="0" tone="info" />
      </View>

      <View style={styles.actions}>
        {action.visible ? (
          <ControlButton
            disabled={!action.enabled}
            label="Abrir incidente"
            onPress={() => undefined}
            accessibilityLabel={action.reason ?? 'Abrir incidente'}
          />
        ) : null}
        {action.reason ? <Text style={styles.hint}>{action.reason}</Text> : null}
      </View>

      {placeholderIncidents.length === 0 ? (
        <FeedbackState
          kind="empty"
          title="Nenhum incidente registrado"
          message="Quando a capacidade de incidentes for homologada, o histórico e a abertura aparecerão aqui."
        />
      ) : (
        <DataTable
          columns={[
            { key: 'service', header: 'Serviço', render: (row) => row.service },
            { key: 'impact', header: 'Impacto', render: (row) => <StatusBadge label={row.impact} tone="warning" /> },
            { key: 'status', header: 'Status', render: (row) => row.status },
          ]}
          rows={placeholderIncidents}
          rowKey={(row) => row.id}
        />
      )}
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  actions: { gap: cloudTheme.spacing.xs },
  hint: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted },
});
