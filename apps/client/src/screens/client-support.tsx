import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
  buildClientSupportFeedbackMailto,
  getClientSupportFeedbackEmail,
} from '@/features/support/client-support-feedback';
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
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const capabilities = capabilitiesQuery.capabilities;
  const feedbackEmail = getClientSupportFeedbackEmail();
  const { activeTickets, completedTickets } = useMemo(() => ({
    activeTickets: ticketsQuery.tickets.filter(
      (ticket) => ticket.status !== 'resolved' && ticket.status !== 'closed',
    ),
    completedTickets: ticketsQuery.tickets.filter(
      (ticket) => ticket.status === 'resolved' || ticket.status === 'closed',
    ),
  }), [ticketsQuery.tickets]);

  const refresh = () => {
    void Promise.all([
      capabilitiesQuery.refresh(),
      ticketsQuery.refresh(true),
    ]);
  };

  const openFeedbackEmail = async () => {
    setFeedbackError(null);
    const url = feedbackEmail
      ? buildClientSupportFeedbackMailto(feedbackEmail)
      : null;
    if (!url) {
      setFeedbackError(
        'O e-mail para sugestões ainda não foi configurado neste aplicativo.',
      );
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      setFeedbackError(
        'Não foi possível abrir seu aplicativo de e-mail. Tente novamente mais tarde.',
      );
    }
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
          <Text style={styles.newTicketTitle}>Encontrou um problema no CutSync?</Text>
          <Text style={styles.newTicketDescription}>
            Relate o incidente e acompanhe cada resposta pelo aplicativo.
          </Text>
        </View>
        <ClientButton
          testID="client-support-new"
          label="Relatar um problema"
          disabled={!capabilities?.enabled || !capabilities.allowNewTickets}
          haptic="selection"
          onPress={() => router.push('/support/new' as Href)}
        />
      </ClientSurface>

      <ClientSurface testID="client-support-feedback-card" style={styles.feedbackCard}>
        <View style={styles.newTicketCopy}>
          <Text style={styles.newTicketTitle}>Quer sugerir uma melhoria?</Text>
          <Text style={styles.newTicketDescription}>
            Envie sua ideia por e-mail. Dúvidas e procedimentos serão reunidos em uma futura
            central de ajuda.
          </Text>
        </View>
        <ClientButton
          testID="client-support-feedback-email"
          label="Enviar sugestão por e-mail"
          tone="secondary"
          onPress={() => { void openFeedbackEmail(); }}
        />
        {feedbackError ? (
          <ClientFeedback
            testID="client-support-feedback-error"
            description={feedbackError}
            tone="danger"
          />
        ) : null}
      </ClientSurface>

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
        <>
          <TicketSection
            testID="client-support-active-list"
            title="Em andamento"
            tickets={activeTickets}
            onOpen={(id) => router.push({
              pathname: '/support/[id]',
              params: { id },
            } as unknown as Href)}
          />
          {completedTickets.length > 0 ? (
            <TicketSection
              testID="client-support-completed-list"
              title="Concluídos"
              tickets={completedTickets}
              onOpen={(id) => router.push({
                pathname: '/support/[id]',
                params: { id },
              } as unknown as Href)}
            />
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function TicketSection({
  testID,
  title,
  tickets,
  onOpen,
}: {
  testID: string;
  title: string;
  tickets: ReturnType<typeof useClientSupportTickets>['tickets'];
  onOpen: (id: string) => void;
}) {
  return (
    <View testID={testID} style={styles.list}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listCount}>{tickets.length}</Text>
      </View>
      {tickets.length === 0 ? (
        <Text style={styles.sectionEmpty}>Nenhum chamado nesta seção.</Text>
      ) : tickets.map((ticket) => (
        <SupportTicketCard
          key={ticket.id}
          ticket={ticket}
          onPress={() => onOpen(ticket.id)}
        />
      ))}
    </View>
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
  feedbackCard: { gap: clientTheme.spacing.md },
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
  sectionEmpty: { color: supportColors.muted, fontSize: 12, lineHeight: 18 },
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
