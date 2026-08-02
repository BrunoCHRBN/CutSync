import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import {
  OpsHeadCell,
  OpsHeader,
  OpsInlineNotice,
  OpsPage,
  OpsPanel,
  OpsPrimaryButton,
  OpsStrip,
  OpsTableHead,
  OpsTableShell,
  opsGridStyle,
} from '@/modules/operation/ops-console';
import { cloudTheme } from '@/theme/cloud-components';

const incidentGrid = opsGridStyle('120px minmax(200px, 2fr) 110px 110px 100px 120px');

export function IncidentsScreen() {
  const { can } = useControlAuth();
  const action = resolveCloudActionAvailability({
    action: 'open_incident',
    can,
  });

  return (
    <OpsPage>
      <OpsHeader
        kicker="OPERAÇÃO / INCIDENTES"
        title="Incidentes"
        description="Registro, impacto e acompanhamento operacional. A escrita permanece bloqueada até existir RPC e permissão próprias."
        actions={action.visible ? (
          <View style={styles.actionBlock}>
            <OpsPrimaryButton
              label={action.enabled ? 'Abrir incidente' : 'Abrir incidente — indisponível'}
              disabled={!action.enabled}
              onPress={() => undefined}
            />
            {action.reason ? (
              <Text style={styles.hint}>{action.reason}</Text>
            ) : null}
          </View>
        ) : undefined}
      />

      <OpsStrip
        items={[
          { label: 'Ativos', value: '0' },
          { label: 'Impacto alto', value: '0' },
          { label: 'Últimas 24 h', value: '0' },
          { label: 'MTTR', value: '—' },
        ]}
      />

      <OpsPanel title="Incidentes">
        <OpsTableShell>
          <OpsTableHead gridStyle={incidentGrid}>
            <OpsHeadCell>Início</OpsHeadCell>
            <OpsHeadCell>Título</OpsHeadCell>
            <OpsHeadCell>Impacto</OpsHeadCell>
            <OpsHeadCell>Estado</OpsHeadCell>
            <OpsHeadCell>Duração</OpsHeadCell>
            <OpsHeadCell>Responsável</OpsHeadCell>
          </OpsTableHead>
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>✓ Nenhum incidente ativo</Text>
            <Text style={styles.emptyBody}>
              A operação está dentro dos parâmetros monitorados. Quando a capacidade de incidentes for homologada, o histórico e o detalhe lateral aparecerão aqui.
            </Text>
          </View>
        </OpsTableShell>
        <OpsInlineNotice message="Lista e detalhe lateral seguirão o padrão da fila de Suporte assim que a fonte existir." />
      </OpsPanel>
    </OpsPage>
  );
}

const styles = StyleSheet.create({
  actionBlock: { alignItems: 'flex-end', gap: 4, maxWidth: 320 },
  hint: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted, textAlign: 'right' },
  emptyBlock: {
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  emptyTitle: { color: cloudTheme.colors.text, fontSize: 14, fontWeight: '700' },
  emptyBody: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 19, maxWidth: 640 },
});
