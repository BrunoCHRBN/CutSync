import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { cloudTheme } from '@/theme/cloud-components';

type ReviewRow = {
  id: string;
  scope: string;
  people: string;
  owner: string;
  due: string;
  criticality: string;
  status: string;
};

const preparedColumns = [
  { key: 'scope', header: 'Escopo', render: (row: ReviewRow) => row.scope },
  { key: 'people', header: 'Pessoas', render: (row: ReviewRow) => row.people },
  { key: 'owner', header: 'Responsável', render: (row: ReviewRow) => row.owner },
  { key: 'due', header: 'Prazo', render: (row: ReviewRow) => row.due },
  {
    key: 'criticality',
    header: 'Criticidade',
    render: (row: ReviewRow) => <StatusBadge label={row.criticality} tone="warning" />,
  },
  { key: 'status', header: 'Estado', render: (row: ReviewRow) => row.status },
  { key: 'action', header: 'Ação', render: () => '—' },
];

export function GspReviewsScreen() {
  const rows: ReviewRow[] = [];

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP · REVISÕES"
        title="Revisões de acesso"
        description="Ciclos com escopo, responsável, prazo, criticidade e estado. Estados: não iniciada, em revisão, aguardando responsável, concluída."
      />
      <FeedbackState
        kind="partial"
        title="Fonte de revisões em preparação"
        message="A rota permanece protegida por control.governance.read. Nenhum ciclo simulado é listado."
      />
      <View style={styles.tableWrap}>
        <Text style={styles.caption}>Estrutura pronta para receber ciclos reais</Text>
        <DataTable
          columns={preparedColumns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyLabel="Nenhuma revisão disponível nesta sessão."
        />
      </View>
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
  tableWrap: { gap: cloudTheme.spacing.sm },
  caption: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.textMuted },
});
