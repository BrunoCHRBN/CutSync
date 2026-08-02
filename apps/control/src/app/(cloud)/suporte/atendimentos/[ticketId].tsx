import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { SUPPORT_TICKET_STATIC_SHELL_ID } from '@/modules/support/support-queue-params';
import { SupportTicketDetailScreen } from '@/modules/support/support-ticket-detail';
import { cloudTheme } from '@/theme/cloud-components';

/**
 * Opaque UUID detail route. Static export needs at least one shell HTML; deep links
 * rewrite to that shell while the client reads the real ticketId from the URL.
 */
export async function generateStaticParams(): Promise<{ ticketId: string }[]> {
  return [{ ticketId: SUPPORT_TICKET_STATIC_SHELL_ID }];
}

export default function AtendimentoDetailRoute() {
  const { can } = useControlAuth();

  if (!can('control.support.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar chamados de suporte."
      />
    );
  }

  return (
    <View style={styles.page}>
      <SupportTicketDetailScreen />
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
