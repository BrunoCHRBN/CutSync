import {
  supportCategoryLabels,
  supportImpactLabels,
  supportRequestKindLabels,
  type SupportTicketStatus,
} from '@cutsync/domain';
import {
  CLIENT_SUPPORT_MESSAGE_MAX_LENGTH,
  validateClientSupportReply,
} from '@cutsync/validation';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SupportMessageBubble,
  SupportMetadataRow,
  SupportStatusBadge,
  SupportSyncBadge,
  SupportTextField,
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
  createClientSupportIdempotencyKey,
  replyClientSupportTicket,
} from '@/features/support/client-support-service';
import {
  useClientSupportCapabilities,
  useClientSupportTicket,
} from '@/features/support/use-client-support';
import { clientTheme } from '@/theme/client-theme';

const nextActionByStatus: Record<SupportTicketStatus, string> = {
  queued: 'Recebemos seu chamado e iniciaremos a triagem.',
  open: 'A equipe CutSync fará a próxima atualização.',
  in_progress: 'A equipe CutSync está analisando sua solicitação.',
  waiting_user: 'Responda à equipe para que a análise possa continuar.',
  resolved: 'A conversa foi concluída pela equipe CutSync.',
  closed: 'A conversa está encerrada.',
  sync_failed: 'A sincronização será tentada novamente em segundo plano.',
};

export function ClientSupportDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useSession();
  const query = useClientSupportTicket(ticketId ?? null, user?.id ?? null);
  const capabilitiesQuery = useClientSupportCapabilities();
  const scrollRef = useRef<ScrollView | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const [reply, setReply] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleReply = async () => {
    if (!ticketId) return;
    setLocalMessage(null);
    setSent(false);
    const validation = validateClientSupportReply(reply);
    if (!validation.ok) {
      setLocalMessage(validation.message);
      return;
    }

    setIsSending(true);
    idempotencyKey.current ??= createClientSupportIdempotencyKey('reply');
    try {
      await replyClientSupportTicket({
        ticketId,
        message: validation.message,
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = null;
      setReply('');
      setSent(true);
      await query.refresh(true);
    } catch (error) {
      setLocalMessage(error instanceof Error
        ? error.message
        : 'Não foi possível enviar sua resposta agora.');
    } finally {
      setIsSending(false);
    }
  };

  if (query.isLoading && !query.ticket) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.centered}
        style={styles.page}
      >
        <StatusBar style="dark" />
        <ActivityIndicator color={supportColors.accent} />
        <Text style={styles.loadingText}>Carregando chamado…</Text>
      </ScrollView>
    );
  }

  if (query.error || !query.ticket) {
    return (
      <ScrollView
        testID="client-support-detail-error"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.centered}
        style={styles.page}
      >
        <StatusBar style="dark" />
        <ClientFeedback
          title="Chamado indisponível"
          description={query.error || 'Este chamado não foi encontrado na sua conta.'}
          tone="danger"
        />
        <ClientButton label="Voltar ao suporte" tone="secondary" onPress={() => router.back()} />
      </ScrollView>
    );
  }

  const ticket = query.ticket;
  const closed = ticket.status === 'resolved' || ticket.status === 'closed';
  const supportEnabled = capabilitiesQuery.capabilities?.enabled !== false;

  return (
    <ScrollView
      ref={scrollRef}
      testID="client-support-detail-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={(
        <RefreshControl
          refreshing={query.isRefreshing}
          onRefresh={() => { void query.refresh(true); }}
          tintColor={supportColors.accent}
        />
      )}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />

      <View style={styles.statusRow}>
        <SupportStatusBadge status={ticket.status} />
        <SupportSyncBadge status={ticket.syncStatus} />
      </View>
      <ClientSectionHeader
        eyebrow={`PROTOCOLO ${ticket.protocol}`}
        title={ticket.subject}
        description={nextActionByStatus[ticket.status]}
      />

      {ticket.status === 'waiting_user' ? (
        <ClientFeedback
          testID="client-support-waiting-user"
          title="Aguardando sua resposta"
          description="A equipe precisa de uma informação sua para continuar o atendimento."
          tone="info"
        />
      ) : null}

      {ticket.syncStatus === 'failed' || ticket.status === 'sync_failed' ? (
        <ClientFeedback
          testID="client-support-sync-failed"
          title="Envio pendente"
          description="A conversa está segura no CutSync e será reenviada pela equipe de suporte."
          tone="danger"
        />
      ) : null}

      {capabilitiesQuery.capabilities && !capabilitiesQuery.capabilities.syncEnabled ? (
        <ClientFeedback
          testID="client-support-detail-sync-paused"
          title="Atualizações em manutenção"
          description={capabilitiesQuery.capabilities.maintenanceMessage
            || 'Novas mensagens serão sincronizadas quando o serviço retornar.'}
          tone="info"
        />
      ) : null}

      <View style={styles.conversationHeader}>
        <Text style={styles.conversationTitle}>Conversa</Text>
        <Text style={styles.conversationCount}>{query.messages.length}</Text>
      </View>

      {query.messages.length === 0 ? (
        <ClientSurface testID="client-support-messages-empty" style={styles.emptyMessages}>
          <Text style={styles.emptyMessagesText}>
            A primeira mensagem será exibida assim que o chamado for processado.
          </Text>
        </ClientSurface>
      ) : (
        <View testID="client-support-messages" style={styles.messages}>
          {query.messages.map((message) => (
            <SupportMessageBubble key={message.id} message={message} />
          ))}
        </View>
      )}

      {closed ? (
        <ClientSurface testID="client-support-closed" style={styles.closedCard}>
          <ClientFeedback
            title="Conversa encerrada"
            description="Se precisar de uma nova análise, abra outro chamado para manter o histórico organizado."
            tone="success"
          />
          <ClientButton
            testID="client-support-open-another"
            label="Abrir novo chamado"
            onPress={() => router.push('/support/new' as Href)}
          />
        </ClientSurface>
      ) : supportEnabled ? (
        <ClientSurface testID="client-support-reply-composer">
          <SupportTextField
            testID="client-support-reply"
            label="Sua resposta"
            value={reply}
            maxLength={CLIENT_SUPPORT_MESSAGE_MAX_LENGTH}
            multiline
            placeholder="Escreva uma atualização para a equipe CutSync."
            onUnsafeInput={setLocalMessage}
            onChangeText={(value) => {
              idempotencyKey.current = null;
              setSent(false);
              setReply(value);
            }}
            helper={`${reply.length}/${CLIENT_SUPPORT_MESSAGE_MAX_LENGTH} caracteres`}
          />
          {localMessage ? (
            <ClientFeedback
              testID="client-support-reply-error"
              description={localMessage}
              tone="danger"
            />
          ) : null}
          {sent ? (
            <ClientFeedback
              testID="client-support-reply-success"
              description="Resposta recebida. A sincronização continuará em segundo plano."
              tone="success"
            />
          ) : null}
          <ClientButton
            testID="client-support-reply-submit"
            label="Enviar resposta"
            loading={isSending}
            disabled={isSending}
            haptic="success"
            onPress={() => { void handleReply(); }}
          />
        </ClientSurface>
      ) : (
        <ClientFeedback
          testID="client-support-reply-disabled"
          title="Respostas temporariamente pausadas"
          description={capabilitiesQuery.capabilities?.maintenanceMessage
            || 'Tente novamente quando a Central de Suporte retornar.'}
          tone="info"
        />
      )}

      <ClientButton
        testID="client-support-toggle-details"
        label={showDetails ? 'Ocultar detalhes do chamado' : 'Detalhes do chamado'}
        tone="secondary"
        onPress={() => setShowDetails((current) => !current)}
      />
      {showDetails ? (
        <ClientSurface testID="client-support-details">
          {ticket.requestKind !== 'incident' ? (
            <SupportMetadataRow
              label="Tipo histórico"
              value={supportRequestKindLabels[ticket.requestKind]}
            />
          ) : null}
          <SupportMetadataRow label="Área" value={supportCategoryLabels[ticket.category]} />
          {ticket.requestKind === 'incident' ? (
            <SupportMetadataRow
              label="Impacto informado"
              value={supportImpactLabels[ticket.impact]}
            />
          ) : null}
          <SupportMetadataRow
            label="Atendimento relacionado"
            value={ticket.appointmentId || 'Nenhum'}
            last
          />
        </ClientSurface>
      ) : null}
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
  centered: {
    flexGrow: 1,
    width: '100%',
    maxWidth: clientTheme.sizing.contentMaxWidth,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: clientTheme.spacing.md,
    padding: clientTheme.spacing.lg,
  },
  loadingText: { color: supportColors.secondary, fontSize: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: clientTheme.spacing.xs },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', gap: clientTheme.spacing.xs },
  conversationTitle: { color: supportColors.text, fontSize: 18, fontWeight: '800' },
  conversationCount: {
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
  messages: { gap: clientTheme.spacing.sm },
  emptyMessages: { alignItems: 'center' },
  emptyMessagesText: {
    color: supportColors.secondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  closedCard: { gap: clientTheme.spacing.md },
});
