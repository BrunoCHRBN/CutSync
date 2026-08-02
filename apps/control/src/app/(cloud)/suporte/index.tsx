import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { PageHeader } from '@/components/cloud/page-header';
import { ControlState } from '@/components/control-state';
import { SupportOperations } from '@/components/support-operations';
import { useControlAuth } from '@/contexts/control-auth-context';
import { cloudTheme } from '@/theme/cloud-components';

export default function SuporteRoute() {
  const { can } = useControlAuth();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = Array.isArray(params.section) ? params.section[0] : params.section;

  if (!can('control.support.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar a fila de suporte."
      />
    );
  }

  if (section === 'clients') {
    return (
      <View style={styles.page}>
        <PageHeader
          eyebrow="SUPORTE"
          title="Clientes"
          description="Contexto de clientes na fila. A projeção permanece ligada aos chamados autorizados."
        />
        <FeedbackState
          kind="partial"
          title="Visão de clientes em preparação"
          message="Use Atendimentos para a fila operacional real. Nenhum cliente simulado é listado."
        />
      </View>
    );
  }

  if (section === 'assisted') {
    return (
      <View style={styles.page}>
        <PageHeader
          eyebrow="SUPORTE"
          title="Operações assistidas"
          description="Ações assistidas exigem control.support.manage e permanecem atrás de homologação."
        />
        <FeedbackState
          kind="partial"
          title="Operações assistidas preparadas"
          message="Mutações individuais continuam no detalhe do chamado quando autorizadas."
        />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.page}>
        <PageHeader
          eyebrow="SUPORTE"
          title="Visão geral"
          description="Fila operacional, filtros, SLA e detalhe do chamado. Criação de novos atendimentos permanece bloqueada até homologação."
          badge="FILA"
          badgeTone="info"
        />
        <SupportOperations />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
    padding: cloudTheme.layout.contentPadding,
  },
});
