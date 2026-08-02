import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { StatusBadge } from '@/components/cloud/status-badge';
import { ControlButton, ControlCard } from '@/components/control-ui';
import { RequireControlPermission } from '@/components/require-control-permission';
import { SectionPage } from '@/components/section-page';
import {
  labelForDataAvailability,
  toneForDataAvailability,
} from '@/modules/finance/presentation';
import { cloudTheme } from '@/theme/cloud-components';

export default function MovimentacoesRoute() {
  return (
    <RequireControlPermission permission="control.billing.read">
      <SectionPage
        eyebrow="FINANCEIRO / MOVIMENTAÇÕES"
        title="Movimentações financeiras"
        description="Registro operacional de faturas, pagamentos, ajustes, reembolsos e conciliações."
      >
        <ControlCard style={styles.toolbar}>
          <View style={styles.toolbarRow}>
            <Text style={styles.meta}>Fonte consolidada de razão ainda não conectada</Text>
            <View style={styles.actions}>
              <ControlButton label="Exportar" variant="secondary" disabled onPress={() => undefined} />
              <ControlButton label="Atualizar" variant="secondary" disabled onPress={() => undefined} />
            </View>
          </View>
          <Text style={styles.hint}>
            Exportação permanece desabilitada até existir backend e permissão dedicados.
          </Text>
        </ControlCard>

        <View style={styles.split}>
          <ControlCard style={styles.main}>
            <Text style={styles.sectionTitle}>Razão de movimentações</Text>
            <DataTable
              columns={[
                { key: 'date', header: 'Data', render: (row: { date: string }) => row.date },
                { key: 'ref', header: 'Referência', render: (row: { ref: string }) => row.ref },
                { key: 'account', header: 'Conta', render: (row: { account: string }) => row.account },
                { key: 'type', header: 'Tipo', render: (row: { type: string }) => row.type },
                { key: 'state', header: 'Estado', render: (row: { state: string }) => row.state },
                { key: 'amount', header: 'Valor', render: (row: { amount: string }) => row.amount },
                { key: 'origin', header: 'Origem', render: (row: { origin: string }) => row.origin },
              ]}
              rows={[] as {
                date: string;
                ref: string;
                account: string;
                type: string;
                state: string;
                amount: string;
                origin: string;
              }[]}
              rowKey={(row) => row.ref}
              emptyLabel="Nenhuma movimentação financeira disponível nesta sessão."
            />
            <FeedbackState
              kind="partial"
              title="Série e razão em consolidação"
              message="O snapshot atual de cobrança não expõe faturas, pagamentos ou ajustes individuais. Nenhum lançamento simulado é exibido."
            />
          </ControlCard>

          <ControlCard style={styles.side}>
            <Text style={styles.sectionTitle}>Resumo operacional</Text>
            <View style={styles.sideRow}>
              <Text style={styles.sideLabel}>Total de itens</Text>
              <Text style={styles.sideValue}>0</Text>
            </View>
            <View style={styles.sideRow}>
              <Text style={styles.sideLabel}>Última atualização</Text>
              <Text style={styles.sideValue}>—</Text>
            </View>
            <View style={styles.sideRow}>
              <Text style={styles.sideLabel}>Origem dos dados</Text>
              <Text style={styles.sideValue}>Snapshot de cobrança</Text>
            </View>

            <Text style={[styles.sectionTitle, styles.sideGap]}>Integridade dos dados</Text>
            <View style={styles.integrityRow}>
              <Text style={styles.sideLabel}>Fonte consolidada</Text>
              <StatusBadge
                label={labelForDataAvailability('source_missing')}
                tone={toneForDataAvailability('source_missing')}
              />
            </View>
            <View style={styles.integrityRow}>
              <Text style={styles.sideLabel}>Série histórica</Text>
              <StatusBadge
                label={labelForDataAvailability('history_unavailable')}
                tone={toneForDataAvailability('history_unavailable')}
              />
            </View>

            <Text style={[styles.sectionTitle, styles.sideGap]}>Notas</Text>
            <Text style={styles.hint}>
              Use Cobranças, Assinaturas e Conciliação para operações já homologadas enquanto a
              razão financeira não estiver disponível.
            </Text>
          </ControlCard>
        </View>

        <ControlCard>
          <FeedbackState
            kind="partial"
            title="Agregação histórica em consolidação"
            message="Quando houver fonte temporal real, esta área exibirá a série de pagamentos e ajustes sem inventar barras ou valores."
          />
        </ControlCard>
      </SectionPage>
    </RequireControlPermission>
  );
}

const styles = StyleSheet.create({
  toolbar: { gap: cloudTheme.spacing.sm },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.sm },
  meta: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  hint: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: cloudTheme.spacing.md },
  main: { flexGrow: 1, flexBasis: 480, gap: cloudTheme.spacing.sm },
  side: { flexGrow: 1, flexBasis: 260, gap: cloudTheme.spacing.sm },
  sectionTitle: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  sideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: cloudTheme.colors.border,
  },
  sideLabel: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary },
  sideValue: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
  integrityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.xs,
  },
  sideGap: { marginTop: cloudTheme.spacing.sm },
});
