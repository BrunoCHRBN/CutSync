import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlCard } from '@/components/control-ui';
import { labelForSurfaceState, toneForSurfaceState } from '@/modules/gsp/presentation';
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
    render: (row: ReviewRow) => row.criticality,
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
        description="Ciclos institucionais com escopo, responsável, prazo e criticidade. Nenhum registro é simulado enquanto a fonte dedicada não existir."
      />

      <ControlCard style={styles.stripCard}>
        <View style={styles.strip}>
          <StripItem
            label="Fonte principal"
            value="Em preparação"
            badgeLabel={labelForSurfaceState('preparing')}
            badgeTone={toneForSurfaceState('preparing')}
          />
          <StripItem
            label="Registros simulados"
            value="Não utilizados"
            badgeLabel="Política"
            badgeTone="neutral"
          />
          <StripItem
            label="Proteção"
            value="control.governance.read"
            badgeLabel="Ativa"
            badgeTone="success"
          />
        </View>
      </ControlCard>

      <FeedbackState
        kind="partial"
        title="Fonte de revisões em preparação"
        message="Não há backend de ciclos de revisão de acesso neste console. Filtros e mutações permanecem ocultos até a fonte existir."
      />

      <View style={styles.tableWrap}>
        <Text style={styles.caption}>Estrutura pronta para receber ciclos reais</Text>
        <DataTable
          columns={preparedColumns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyLabel="Nenhum ciclo de revisão disponível. Dados fictícios não são exibidos."
        />
      </View>
    </View>
  );
}

function StripItem({
  label,
  value,
  badgeLabel,
  badgeTone,
}: {
  label: string;
  value: string;
  badgeLabel: string;
  badgeTone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <View style={styles.stripItem}>
      <Text style={styles.stripLabel}>{label}</Text>
      <Text style={styles.stripValue}>{value}</Text>
      <StatusBadge label={badgeLabel} tone={badgeTone} />
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
  stripCard: { paddingVertical: cloudTheme.spacing.sm },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  stripItem: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
    gap: 6,
    padding: cloudTheme.spacing.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: cloudTheme.colors.border,
  },
  stripLabel: {
    ...cloudTheme.type.caption,
    color: cloudTheme.colors.textMuted,
    textTransform: 'uppercase',
  },
  stripValue: {
    ...cloudTheme.type.bodyStrong,
    color: cloudTheme.colors.text,
  },
  tableWrap: { gap: cloudTheme.spacing.sm },
  caption: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.textMuted },
});
