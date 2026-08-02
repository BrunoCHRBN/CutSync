import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { cloudTheme } from '@/theme/cloud-components';

type AuditRow = {
  id: string;
  actor: string;
  action: string;
  target: string;
  at: string;
  origin: string;
};

const preparedColumns = [
  { key: 'actor', header: 'Ator', render: (row: AuditRow) => row.actor },
  { key: 'action', header: 'Ação', render: (row: AuditRow) => row.action },
  { key: 'target', header: 'Alvo', render: (row: AuditRow) => row.target },
  { key: 'at', header: 'Data/hora', render: (row: AuditRow) => row.at },
  { key: 'origin', header: 'Origem', render: (row: AuditRow) => row.origin },
  { key: 'view', header: 'Detalhe', render: () => 'Ver evento' },
];

export function GspAuditScreen() {
  const rows: AuditRow[] = [];

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="GSP · AUDITORIA"
        title="Auditoria"
        description="Trilha de eventos sensíveis com ator, ação, alvo, horário e origem quando disponível."
      />
      <FeedbackState
        kind="partial"
        title="Fonte de auditoria em preparação"
        message="A proteção por control.governance.read permanece ativa. Nenhum evento simulado é exibido."
      />
      <View style={styles.tableWrap}>
        <Text style={styles.caption}>Tabela preparada para o contrato de eventos</Text>
        <DataTable
          columns={preparedColumns}
          rows={rows}
          rowKey={(row) => row.id}
          emptyLabel="Nenhum evento de auditoria disponível nesta sessão."
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
