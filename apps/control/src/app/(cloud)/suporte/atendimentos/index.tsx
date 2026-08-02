import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { SupportTicketList } from '@/modules/support/support-ticket-list';
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
      <SupportTicketList />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
  },
});
