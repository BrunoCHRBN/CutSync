import React from 'react';
import { StyleSheet, View } from 'react-native';

import { PageHeader } from '@/components/cloud/page-header';
import { ControlState } from '@/components/control-state';
import { SupportOperations } from '@/components/support-operations';
import { useControlAuth } from '@/contexts/control-auth-context';
import { cloudTheme } from '@/theme/cloud-components';

export default function AtendimentosRoute() {
  const { can } = useControlAuth();

  if (!can('control.support.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar a fila de suporte."
      />
    );
  }

  return (
    <View style={styles.page}>
      <PageHeader
        eyebrow="SUPORTE"
        title="Atendimentos"
        description="Fila operacional com filtros, SLA, responsável e detalhe. Criação permanece bloqueada até homologação."
        badge="FILA"
        badgeTone="info"
      />
      <SupportOperations />
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
});
