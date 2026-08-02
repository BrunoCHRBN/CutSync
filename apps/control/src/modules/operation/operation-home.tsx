import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';

import { OperationOverviewScreen } from '@/modules/operation/operation-overview';
import {
  OpsDefList,
  OpsHeadCell,
  OpsHeader,
  OpsInlineNotice,
  OpsPage,
  OpsPanel,
  OpsStrip,
  OpsTableHead,
  OpsTableShell,
  opsGridStyle,
} from '@/modules/operation/ops-console';


const serviceGrid = opsGridStyle('minmax(180px, 1.6fr) 120px 100px 90px 120px');

export function OperationHome() {
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;

  if (section === 'services') {
    return (
      <OpsPage>
        <OpsHeader
          kicker="OPERAÇÃO / SERVIÇOS"
          title="Catálogo de serviços"
          description="Monitoramento técnico dos componentes da plataforma. Nenhum serviço simulado é listado."
        />

        <OpsStrip
          items={[
            { label: 'Status da superfície', value: 'Em preparação', tone: 'warning' },
            { label: 'Fonte de dados', value: 'Não conectada' },
            { label: 'Serviços simulados', value: 'Não utilizados' },
            { label: 'Monitoramento', value: 'No Cockpit' },
          ]}
        />

        <OpsPanel title="Estado da superfície">
          <OpsDefList
            rows={[
              { label: 'Fonte de dados', value: 'Ainda não conectada' },
              { label: 'Serviços simulados', value: 'Não utilizados' },
              { label: 'Monitoramento atual', value: 'Disponível no Cockpit' },
              { label: 'Próxima etapa', value: 'Catálogo e telemetria por serviço' },
            ]}
          />
        </OpsPanel>

        <OpsPanel title="Serviços monitorados">
          <OpsTableShell>
            <OpsTableHead gridStyle={serviceGrid}>
              <OpsHeadCell>Serviço</OpsHeadCell>
              <OpsHeadCell>Disponibilidade</OpsHeadCell>
              <OpsHeadCell>Latência</OpsHeadCell>
              <OpsHeadCell>Erros</OpsHeadCell>
              <OpsHeadCell>Estado</OpsHeadCell>
            </OpsTableHead>
            <View style={{ minHeight: 56, justifyContent: 'center', paddingVertical: 14 }}>
              <Text style={{ color: '#667269', fontSize: 13 }}>
                Nenhum serviço individual disponível nesta sessão.
              </Text>
            </View>
          </OpsTableShell>
          <OpsInlineNotice message="Quando a telemetria por serviço for homologada, a tabela receberá disponibilidade, latência e erros reais." />
        </OpsPanel>
      </OpsPage>
    );
  }

  return <OperationOverviewScreen />;
}
