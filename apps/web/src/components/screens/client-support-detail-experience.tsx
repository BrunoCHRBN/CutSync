import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  formatSupportDateTime,
  supportCategoryLabels,
} from '@cutsync/domain';
import { validateClientSupportReply } from '@cutsync/validation';

import { useAuth } from '../../contexts/AuthContext';
import { useClientSupportTicket } from '../../hooks/use-client-support';
import {
  createClientSupportIdempotencyKey,
  replyClientSupportTicket,
} from '../../services/client-support';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import {
  ClientSupportPage,
  SupportStatusBadge,
} from '../support/client-support-ui';

export const ClientSupportDetailExperience = () => {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const ticketId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { user } = useAuth();
  const { ticket, messages, isLoading, error, refresh } = useClientSupportTicket(
    ticketId ?? null,
    user?.id ?? null,
  );
  const [reply, setReply] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const keyRef = useRef(createClientSupportIdempotencyKey());

  const submitReply = async () => {
    if (!ticket) return;
    const validation = validateClientSupportReply(reply);
    if (!validation.ok) {
      setNotice(validation.message);
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      await replyClientSupportTicket({
        ticketId: ticket.id,
        message: validation.message,
        idempotencyKey: keyRef.current,
      });
      setReply('');
      keyRef.current = createClientSupportIdempotencyKey();
      await refresh();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível enviar sua resposta.');
      keyRef.current = createClientSupportIdempotencyKey();
    } finally {
      setSubmitting(false);
    }
  };

  const closed = ticket ? ['resolved', 'closed'].includes(ticket.status) : false;

  return (
    <ClientSupportPage
      title={ticket?.subject || 'Detalhes do chamado'}
      description={ticket
        ? `${ticket.protocol} · ${supportCategoryLabels[ticket.category]}`
        : 'Acompanhe o histórico e as respostas da equipe CutSync.'}
      backLabel="Voltar para seus chamados"
    >
      {error ? <InlineNotice tone="danger" message={error} /> : null}
      {notice ? <InlineNotice tone="danger" message={notice} /> : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : !ticket ? (
        <InlineNotice tone="warning" message="Este chamado não foi encontrado na sua conta." />
      ) : (
        <>
          <AppCard style={styles.summary}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.label}>PROTOCOLO</Text>
                <Text selectable style={styles.protocol}>{ticket.protocol}</Text>
              </View>
              <SupportStatusBadge status={ticket.status} />
            </View>
            <Text style={styles.meta}>
              Criado em {formatSupportDateTime(ticket.createdAt)}
              {ticket.assigneeName ? ` · Atendimento: ${ticket.assigneeName}` : ''}
            </Text>
          </AppCard>

          <View style={styles.messages}>
            {messages.map((message) => {
              const fromSupport = message.authorKind === 'support';
              return (
                <View
                  key={message.id}
                  testID={`client-web-support-message-${message.id}`}
                  style={[
                    styles.message,
                    fromSupport ? styles.messageSupport : styles.messageRequester,
                    message.authorKind === 'system' && styles.messageSystem,
                  ]}
                >
                  <Text style={styles.messageAuthor}>
                    {fromSupport
                      ? 'Equipe CutSync'
                      : message.authorKind === 'requester'
                        ? 'Você'
                        : 'Atualização do sistema'}
                  </Text>
                  <Text selectable style={styles.messageBody}>{message.body}</Text>
                  <Text style={styles.messageDate}>{formatSupportDateTime(message.createdAt)}</Text>
                </View>
              );
            })}
          </View>

          {closed ? (
            <InlineNotice
              tone="success"
              title="Chamado finalizado"
              message="Se precisar de outra ajuda, abra um novo chamado."
            />
          ) : (
            <AppCard style={styles.replyCard}>
              <AppInput
                testID="client-web-support-reply"
                label="Responder"
                value={reply}
                onChangeText={setReply}
                maxLength={4000}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                placeholder="Escreva sua mensagem para a equipe CutSync"
                style={styles.replyInput}
              />
              <View style={styles.replyActions}>
                <AppButton
                  testID="client-web-support-detail-refresh"
                  label="Atualizar conversa"
                  variant="secondary"
                  onPress={() => { void refresh(); }}
                />
                <AppButton
                  testID="client-web-support-reply-submit"
                  label="Enviar resposta"
                  loading={submitting}
                  disabled={!reply.trim()}
                  onPress={() => { void submitReply(); }}
                />
              </View>
            </AppCard>
          )}
        </>
      )}
    </ClientSupportPage>
  );
};

const styles = StyleSheet.create({
  loading: { minHeight: 220, justifyContent: 'center', alignItems: 'center' },
  summary: { gap: 10 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    flexWrap: 'wrap',
  },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 1.2 },
  protocol: { color: colors.brandPrimary, fontFamily: typography.display, fontSize: 17, marginTop: 5 },
  meta: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  messages: { gap: 10 },
  message: {
    maxWidth: 760,
    borderRadius: radii.lg,
    padding: 16,
  },
  messageRequester: { alignSelf: 'flex-end', backgroundColor: colors.brandSecondarySoft },
  messageSupport: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  messageSystem: { alignSelf: 'center', backgroundColor: colors.infoSoft },
  messageAuthor: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 12 },
  messageBody: { color: colors.text, fontFamily: typography.body, fontSize: 13, lineHeight: 20, marginTop: 6 },
  messageDate: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 9 },
  replyCard: { gap: 14 },
  replyInput: { minHeight: 105, paddingTop: 13 },
  replyActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
});
