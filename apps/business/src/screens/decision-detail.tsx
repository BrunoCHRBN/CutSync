import { createMobileRequestId } from '@cutsync/domain';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { hasBusinessDecisionsNavigation } from '@/features/access/business-access';
import {
  type BusinessDecisionCommand,
  type BusinessDecisionCommandIntent,
  useBusinessDecisionCommand,
  useBusinessReassignmentCandidates,
  useBusinessReassignmentDetail,
} from '@/features/decisions/use-business-decisions';
import { BusinessApiError } from '@/services/business-api';
import { businessTheme } from '@/theme/business-theme';

const actionLabels: Record<string, string> = {
  validate: 'Validar disponibilidade',
  propose: 'Propor substituto',
  apply: 'Aplicar mudança aprovada',
  review: 'Revisar manualmente',
  withdraw: 'Retirar solicitação',
};

const eventLabels: Record<string, string> = {
  'reassignment.requested': 'Solicitação criada',
  'reassignment.validated': 'Disponibilidade validada',
  'reassignment.proposed': 'Substituição proposta',
  'reassignment.customer_decided': 'Cliente registrou uma decisão',
  'reassignment.applied': 'Mudança aplicada',
  'reassignment.withdrawn': 'Solicitação retirada',
  'reassignment.expired': 'Solicitação expirada',
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

export function BusinessDecisionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ requestId?: string | string[] }>();
  const requestId = Array.isArray(params.requestId) ? params.requestId[0] ?? '' : params.requestId ?? '';
  const { activeContext } = useBusinessOperational();
  const detail = useBusinessReassignmentDetail(requestId);
  const command = useBusinessDecisionCommand(requestId);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [commandNotice, setCommandNotice] = useState<{
    tone: 'success' | 'danger' | 'warning';
    message: string;
  } | null>(null);
  const canPropose = detail.data?.allowedActions.includes('propose') ?? false;
  const candidates = useBusinessReassignmentCandidates(requestId, canPropose);
  const commandBlocked = command.isPending
    || command.syncStatus === 'syncing'
    || command.syncStatus === 'offline_pending'
    || command.syncStatus === 'manual_review';

  if (!hasBusinessDecisionsNavigation(activeContext?.capabilities)) {
    return <Redirect href="/today" />;
  }

  if (detail.isLoading) {
    return (
      <BusinessPage testID="business-decision-detail-loading">
        <ActivityIndicator color={businessTheme.colors.accent} />
      </BusinessPage>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <BusinessPage testID="business-decision-detail-error">
        <BusinessHeader eyebrow="DECISÃO" title="Não foi possível abrir" />
        <BusinessNotice tone="danger" message="O servidor não confirmou este item para o contexto ativo." />
        <BusinessButton label="Voltar" variant="secondary" onPress={() => router.back()} />
      </BusinessPage>
    );
  }

  const item = detail.data;
  const executeCommand = async (
    _key: string,
    input: BusinessDecisionCommandIntent,
  ) => {
    setCommandNotice(null);
    try {
      const receipt = await command.mutateAsync({
        ...input,
        expectedVersion: item.version,
        requestId: createMobileRequestId(),
        correlationId: item.correlationId,
      } as BusinessDecisionCommand);
      if (input.action === 'withdraw') setWithdrawReason('');
      setCommandNotice({
        tone: 'success',
        message: receipt.replayed
          ? 'O servidor confirmou novamente o comando já processado.'
          : 'A ação foi confirmada pelo servidor.',
      });
    } catch (error) {
      const isNetworkFailure = error instanceof BusinessApiError && error.code === 'network_error';
      if (error instanceof BusinessApiError && error.code === 'decision_conflict') {
        await detail.refetch();
      }
      setCommandNotice({
        tone: isNetworkFailure ? 'warning' : 'danger',
        message: isNetworkFailure
          ? 'A ação foi salva neste aparelho e será reenviada com o mesmo identificador.'
          : error instanceof Error ? error.message : 'Não foi possível confirmar a ação.',
      });
    }
  };

  const confirmCommand = (
    title: string,
    message: string,
    key: string,
    input: BusinessDecisionCommandIntent,
    destructive = false,
  ) => {
    Alert.alert(title, message, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Confirmar',
        style: destructive ? 'destructive' : 'default',
        onPress: () => void executeCommand(key, input),
      },
    ]);
  };
  return (
    <BusinessPage testID="business-decision-detail-screen">
      <BusinessHeader
        eyebrow="DECISÃO"
        title={item.clientDisplayName}
        description={`${item.serviceName} · ${formatDateTime(item.appointmentStartsAt)}`}
      />

      <BusinessCard>
        <View style={styles.rowBetween}>
          <BusinessPill label={item.status.replaceAll('_', ' ')} />
          <Text style={styles.caption}>v{item.version}</Text>
        </View>
        <Text style={styles.heading}>Mudança proposta</Text>
        <Text style={styles.body}>De: {item.currentProfessional.name}</Text>
        <Text style={styles.body}>
          Para: {item.proposedProfessional?.name ?? 'Ainda não definido'}
        </Text>
        <Text style={styles.caption}>Prazo: {formatDateTime(item.dueAt)}</Text>
        <View style={styles.tags}>
          {item.customerDecisionRequired ? <BusinessPill label="Exige decisão do cliente" tone="warning" /> : null}
          {item.monetaryImpact ? <BusinessPill label="Possui impacto financeiro" tone="warning" /> : null}
        </View>
      </BusinessCard>

      <BusinessNotice
        tone="neutral"
        message={item.allowedActions.length > 0
          ? `O backend autorizou: ${item.allowedActions.map((action) => actionLabels[action] ?? action).join(', ')}.`
          : 'Nenhuma ação está autorizada para você neste estado. Acompanhe a timeline.'}
      />

      {commandNotice ? (
        <BusinessNotice tone={commandNotice.tone} message={commandNotice.message} />
      ) : null}

      {command.syncStatus === 'offline_pending' ? (
        <View style={styles.syncGroup} testID="business-decision-offline-pending">
          <BusinessNotice
            tone="warning"
            message="Ação pendente no aparelho. Ela não foi apresentada como concluída e usará o mesmo requestId no replay."
          />
          <BusinessButton
            label="Tentar sincronizar agora"
            variant="secondary"
            onPress={() => void command.replayPending()}
          />
        </View>
      ) : null}

      {command.syncStatus === 'conflict' ? (
        <BusinessNotice
          tone="warning"
          message="A decisão mudou no servidor. Os dados foram solicitados novamente antes de outra ação."
        />
      ) : null}

      {command.syncStatus === 'manual_review' ? (
        <BusinessNotice
          tone="danger"
          message="A ação exige revisão manual e não será repetida automaticamente."
        />
      ) : null}

      {item.allowedActions.length > 0 ? (
        <BusinessCard>
          <BusinessSectionTitle>Ações disponíveis</BusinessSectionTitle>

          {item.allowedActions.includes('validate') ? (
            <BusinessButton
              label="Validar disponibilidade"
              loading={command.isPending}
              disabled={commandBlocked}
              onPress={() => confirmCommand(
                'Validar solicitação?',
                'O servidor revalidará agendamento, vínculo e estado antes de avançar.',
                'validate',
                { action: 'validate' },
              )}
            />
          ) : null}

          {item.allowedActions.includes('apply') ? (
            <BusinessButton
              label="Aplicar mudança aprovada"
              loading={command.isPending}
              disabled={commandBlocked}
              onPress={() => confirmCommand(
                'Aplicar reatribuição?',
                'O profissional do agendamento só será alterado após uma nova validação do servidor.',
                'apply',
                { action: 'apply' },
              )}
            />
          ) : null}

          {canPropose ? (
            <View style={styles.actionGroup}>
              <Text style={styles.heading}>Escolher substituto elegível</Text>
              {candidates.isLoading ? <ActivityIndicator color={businessTheme.colors.accent} /> : null}
              {candidates.isError ? (
                <BusinessNotice tone="danger" message="Não foi possível confirmar profissionais disponíveis." />
              ) : null}
              {candidates.data?.length === 0 ? (
                <Text style={styles.body}>Nenhum profissional qualificado está livre neste horário.</Text>
              ) : null}
              {candidates.data?.map((candidate) => (
                <BusinessCard key={candidate.profileId}>
                  <View style={styles.rowBetween}>
                    <View style={styles.candidateCopy}>
                      <Text style={styles.heading}>{candidate.name}</Text>
                      <Text style={styles.body}>
                        {(candidate.priceCents / 100).toLocaleString('pt-BR', {
                          style: 'currency', currency: 'BRL',
                        })}
                      </Text>
                    </View>
                    {candidate.monetaryImpact ? <BusinessPill label="Preço diferente" tone="warning" /> : null}
                  </View>
                  <BusinessButton
                    label={`Propor ${candidate.name}`}
                    variant="secondary"
                    disabled={commandBlocked}
                    onPress={() => confirmCommand(
                      'Enviar proposta?',
                      `O cliente poderá precisar aceitar a substituição por ${candidate.name}.`,
                      `propose:${candidate.profileId}`,
                      { action: 'propose', professionalId: candidate.profileId },
                    )}
                  />
                </BusinessCard>
              ))}
            </View>
          ) : null}

          {item.allowedActions.includes('withdraw') ? (
            <View style={styles.actionGroup}>
              <Text style={styles.heading}>Retirar solicitação</Text>
              <TextInput
                accessibilityLabel="Motivo da retirada"
                placeholder="Informe o motivo"
                placeholderTextColor={businessTheme.colors.textMuted}
                value={withdrawReason}
                onChangeText={setWithdrawReason}
                maxLength={500}
                multiline
                style={styles.input}
              />
              <BusinessButton
                label="Retirar solicitação"
                variant="danger"
                disabled={withdrawReason.trim().length < 3 || commandBlocked}
                onPress={() => {
                  const reason = withdrawReason.trim();
                  confirmCommand(
                    'Retirar solicitação?',
                    'A proposta deixará de avançar e nenhuma troca será aplicada.',
                    `withdraw:${reason}`,
                    { action: 'withdraw', reason },
                    true,
                  );
                }}
              />
            </View>
          ) : null}
        </BusinessCard>
      ) : null}

      <BusinessSectionTitle>Timeline confirmada</BusinessSectionTitle>
      {item.timeline.map((event) => (
        <BusinessCard key={event.id}>
          <Text style={styles.heading}>{eventLabels[event.eventType] ?? event.eventType}</Text>
          <Text style={styles.body}>{formatDateTime(event.occurredAt)}</Text>
          <Text selectable style={styles.correlation}>Correlação: {event.correlationId}</Text>
        </BusinessCard>
      ))}

      <BusinessButton label="Voltar à fila" variant="secondary" onPress={() => router.back()} />
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  heading: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  body: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  caption: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  correlation: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  actionGroup: { gap: businessTheme.spacing.sm },
  syncGroup: { gap: businessTheme.spacing.sm },
  candidateCopy: { flex: 1, gap: businessTheme.spacing.xs },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: businessTheme.radii.md,
    padding: businessTheme.spacing.md,
    color: businessTheme.colors.text,
    backgroundColor: businessTheme.colors.surfaceRaised,
    textAlignVertical: 'top',
  },
});
