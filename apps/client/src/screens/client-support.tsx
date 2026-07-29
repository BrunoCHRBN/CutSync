import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SupportTicketCard,
  supportColors,
} from '@/components/support/client-support-ui';
import {
  ClientButton,
  ClientFeedback,
  ClientSectionHeader,
  ClientSurface,
} from '@/components/ui/client-ui';
import { useSession } from '@/contexts/session-context';
import {
  useClientSupportCapabilities,
  useClientSupportTickets,
} from '@/features/support/use-client-support';
import { clientTheme } from '@/theme/client-theme';

export function ClientSupportScreen() {
  const router = useRouter();
  const { user } = useSession();
  const capabilitiesQuery = useClientSupportCapabilities();
  const ticketsQuery = useClientSupportTickets(user?.id ?? null);
  const capabilities = capabilitiesQuery.capabilities;

  const refresh = () => {
    void Promise.all([
      capabilitiesQuery.refresh(),
      ticketsQuery.refresh(true),
    ]);
  };

  return (
    <ScrollView
      testID="client-support-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      refreshControl={(
        <RefreshControl
          refreshing={ticketsQuery.isRefreshing}
          onRefresh={refresh}
          tintColor={supportColors.accent}
        />
      )}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <ClientSectionHeader
        eyebrow="CENTRAL DE SUPORTE"
        title="Como podemos ajudar?"
        description="Abra e acompanhe conversas oficiais com a equipe CutSync."
      />

      {capabilitiesQuery.isLoading && !capabilities ? (
        <ClientSurface testID="client-support-capabilities-loading" style={styles.loadingCard}>
          <ActivityIndicator color={supportColors.accent} />
          <Text style={styles.loadingText}>Consultando a disponibilidade…</Text>
        </ClientSurface>
      ) : null}

      {capabilitiesQuery.error ? (
        <ClientFeedback
          testID="client-support-capabilities-error"
          title="Disponibilidade não confirmada"
          description={capabilitiesQuery.error}
          tone="danger"
        />
      ) : null}

      {capabilities && !capabilities.enabled ? (
        <ClientFeedback
          testID="client-support-maintenance"
          title="Suporte temporariamente indisponível"
          description={capabilities.maintenanceMessage
            || 'Acompanhe seus chamados existentes e tente novamente mais tarde.'}
          tone="info"
        />
      ) : null}

      {capabilities?.enabled && !capabilities.allowNewTickets ? (
        <ClientFeedback
          testID="client-support-new-disabled"
          title="Novos chamados pausados"
          description={capabilities.maintenanceMessage
            || 'Seus chamados existentes continuam disponíveis para acompanhamento.'}
          tone="info"
        />
      ) : null}

      {capabilities?.enabled && !capabilities.syncEnabled ? (
        <ClientFeedback
          testID="client-support-sync-paused"
          title="Atualizações em manutenção"
          description="As conversas permanecem salvas e serão sincronizadas quando o serviço retornar."
          tone="neutral"
        />
      ) : null}

      <ClientSurface style={styles.newTicketCard}>
        <View style={styles.newTicketCopy}>
          <Text style={styles.newTicketTitle}>Precisa falar com o CutSync?</Text>
          <Text style={styles.newTicketDescription}>
            Conte o que aconteceu e acompanhe cada resposta pelo aplicativo.
          </Text>
        </View>
        <ClientButton
          testID="client-support-new"
          label="Abrir novo chamado"
          disabled={!capabilities?.enabled || !capabilities.allowNewTickets}
          haptic="selection"
          onPress={() => router.push('/support/new' as Href)}
        />
      </ClientSurface>

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Seus chamados</Text>
        <Text style={styles.listCount}>{ticketsQuery.tickets.length}</Text>
      </View>

      {ticketsQuery.error ? (
        <ClientFeedback
          testID="client-support-error"
          title="Não foi possível carregar"
          description={ticketsQuery.error}
          tone="danger"
          action={(
            <ClientButton
              label="Tentar novamente"
              tone="quiet"
              onPress={() => { void ticketsQuery.refresh(); }}
            />
          )}
        />
      ) : null}

      {ticketsQuery.isLoading && ticketsQuery.tickets.length === 0 ? (
        <ClientSurface testID="client-support-loading" style={styles.loadingCard}>
          <ActivityIndicator color={supportColors.accent} />
          <Text style={styles.loadingText}>Carregando seus chamados…</Text>
        </ClientSurface>
      ) : ticketsQuery.tickets.length === 0 ? (
        <ClientSurface testID="client-support-empty" style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nenhum chamado por aqui</Text>
          <Text style={styles.emptyDescription}>
            Quando você falar com o suporte, a conversa aparecerá nesta tela.
          </Text>
        </ClientSurface>
      ) : (
        <View testID="client-support-list" style={styles.list}>
          {ticketsQuery.tickets.map((ticket) => (
            <SupportTicketCard
              key={ticket.id}
              ticket={ticket}
              onPress={() => router.push({
                pathname: '/support/[id]',
                params: { id: ticket.id },
              } as unknown as Href)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: supportColors.background },
  content: {
    width: '100%',
    maxWidth: clientTheme.sizing.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: clientTheme.spacing.lg,
    paddingTop: clientTheme.spacing.xl,
    paddingBottom: clientTheme.spacing.page,
    gap: clientTheme.spacing.lg,
  },
  loadingCard: { minHeight: 132, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: supportColors.secondary, fontSize: 12 },
  newTicketCard: { backgroundColor: supportColors.accentSoft },
  newTicketCopy: { gap: clientTheme.spacing.xs },
  newTicketTitle: { color: supportColors.text, fontSize: 18, fontWeight: '800' },
  newTicketDescription: { color: supportColors.secondary, fontSize: 13, lineHeight: 20 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: clientTheme.spacing.xs },
  listTitle: { color: supportColors.text, fontSize: 18, fontWeight: '800' },
  listCount: {
    minWidth: 25,
    color: clientTheme.colors.white,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    borderRadius: clientTheme.radii.pill,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: supportColors.accent,
  },
  list: { gap: clientTheme.spacing.sm },
  emptyCard: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: supportColors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyDescription: {
    maxWidth: 360,
    color: supportColors.secondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
