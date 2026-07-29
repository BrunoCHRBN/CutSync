import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  CLIENT_SUPPORT_CATEGORIES,
  supportCategoryDescriptions,
  supportCategoryLabels,
  supportImpactDescriptions,
  supportImpactLabels,
  type ClientSupportCategory,
  type SupportImpact,
} from '@cutsync/domain';
import { validateClientSupportTicket } from '@cutsync/validation';

import { useClientSupportCapabilities } from '../../hooks/use-client-support';
import {
  createClientSupportIdempotencyKey,
  createClientSupportTicket,
} from '../../services/client-support';
import { colors, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import {
  ClientSupportPage,
  SupportChoice,
} from '../support/client-support-ui';

const incidentImpacts: SupportImpact[] = ['normal', 'high', 'critical'];

export const ClientSupportNewExperience = () => {
  const router = useRouter();
  const { capabilities, isLoading } = useClientSupportCapabilities();
  const [category, setCategory] = useState<ClientSupportCategory>('other');
  const [impact, setImpact] = useState<SupportImpact>('normal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const keyRef = useRef(createClientSupportIdempotencyKey());

  const submit = async () => {
    const validation = validateClientSupportTicket({
      requestKind: 'incident',
      category,
      impact,
      subject,
      message,
    });
    if (!validation.ok) {
      setNotice(validation.message);
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      const ticket = await createClientSupportTicket({
        ...validation,
        idempotencyKey: keyRef.current,
      });
      router.replace(`/(client)/support/${ticket.id}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Não foi possível abrir o chamado.');
      keyRef.current = createClientSupportIdempotencyKey();
    } finally {
      setSubmitting(false);
    }
  };

  const available = Boolean(capabilities?.enabled && capabilities.allowNewTickets);

  return (
    <ClientSupportPage
      title="Novo chamado"
      description="Conte o que aconteceu. Não inclua senhas, documentos, tokens ou outros dados sigilosos."
      backLabel="Voltar para seus chamados"
    >
      {!isLoading && !available ? (
        <InlineNotice
          tone="warning"
          message={capabilities?.maintenanceMessage || 'Novos chamados estão pausados no momento.'}
        />
      ) : null}
      {notice ? <InlineNotice tone="danger" message={notice} /> : null}

      <AppCard style={styles.form}>
        <View>
          <Text style={styles.sectionTitle}>Em qual área o problema aconteceu?</Text>
          <View style={styles.choices}>
            {CLIENT_SUPPORT_CATEGORIES.map((value) => (
              <SupportChoice
                key={value}
                testID={`client-web-support-category-${value}`}
                label={supportCategoryLabels[value]}
                description={supportCategoryDescriptions[value]}
                selected={category === value}
                onPress={() => setCategory(value)}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>Quanto o problema impede o seu uso?</Text>
          <View style={styles.choices}>
            {incidentImpacts.map((value) => (
              <SupportChoice
                key={value}
                testID={`client-web-support-impact-${value}`}
                label={supportImpactLabels[value]}
                description={supportImpactDescriptions[value]}
                selected={impact === value}
                onPress={() => setImpact(value)}
              />
            ))}
          </View>
        </View>

        <AppInput
          testID="client-web-support-subject"
          label="Assunto"
          value={subject}
          onChangeText={setSubject}
          maxLength={120}
          placeholder="Resuma o que você precisa"
        />
        <AppInput
          testID="client-web-support-message"
          label="Detalhes"
          value={message}
          onChangeText={setMessage}
          maxLength={4000}
          multiline
          numberOfLines={7}
          textAlignVertical="top"
          placeholder="Descreva o problema, o resultado esperado e quando ele aconteceu"
          style={styles.messageInput}
        />
        <View style={styles.footer}>
          <Text style={styles.hint}>Sua solicitação será registrada no atendimento oficial do CutSync.</Text>
          <AppButton
            testID="client-web-support-submit"
            label="Enviar chamado"
            loading={submitting}
            disabled={!available || isLoading}
            onPress={() => { void submit(); }}
          />
        </View>
      </AppCard>
    </ClientSupportPage>
  );
};

const styles = StyleSheet.create({
  form: { gap: 24 },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 13,
    marginBottom: 10,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  messageInput: { minHeight: 130, paddingTop: 13 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  hint: { flex: 1, minWidth: 240, color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
});
