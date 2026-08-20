import {
  CLIENT_SUPPORT_CATEGORIES,
  formatClientAppointmentDateTime,
  supportCategoryDescriptions,
  supportCategoryLabels,
  supportImpactLabels,
  type ClientSupportCategory,
  type SupportImpact,
} from '@cutsync/domain';
import {
  CLIENT_SUPPORT_MESSAGE_MAX_LENGTH,
  CLIENT_SUPPORT_SUBJECT_MAX_LENGTH,
  validateClientSupportTicket,
} from '@cutsync/validation';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useReducer, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  SupportChoiceGroup,
  SupportMetadataRow,
  SupportTextField,
  supportColors,
} from '@/components/support/client-support-ui';
import {
  ClientButton,
  ClientFeedback,
  ClientScreen,
  ClientSectionHeader,
  ClientSurface,
} from '@/components/ui/client-ui';
import { useSession } from '@/contexts/session-context';
import { useClientAppointments } from '@/features/appointments/use-client-appointments';
import {
  createClientSupportIdempotencyKey,
  createClientSupportTicket,
} from '@/features/support/client-support-service';
import {
  loadClientSupportDraft,
  removeClientSupportDraft,
  saveClientSupportDraft,
} from '@/features/support/client-support-draft';
import {
  buildSupportWizardMessage,
  buildSupportWizardSubject,
  createInitialSupportWizardState,
  getSupportWizardSteps,
  hasSupportWizardDraftContent,
  supportAnswerDefinitions,
  supportWizardReducer,
  type SupportWizardStep,
} from '@/features/support/client-support-wizard';
import { useClientSupportCapabilities } from '@/features/support/use-client-support';
import { clientTheme } from '@/theme/client-theme';

const stepCopy: Record<SupportWizardStep, { eyebrow: string; title: string; description: string }> = {
  area: {
    eyebrow: 'ÁREA ENVOLVIDA',
    title: 'Onde o problema aconteceu?',
    description: 'A área ajuda o CutSync a encaminhar o incidente corretamente.',
  },
  context: {
    eyebrow: 'CONTEXTO',
    title: 'Existe um atendimento relacionado?',
    description: 'Vincule um atendimento recente somente quando ele ajudar na análise.',
  },
  impact: {
    eyebrow: 'IMPACTO',
    title: 'Quanto isso impede o seu uso?',
    description: 'Use o impacto real. A prioridade técnica será definida pelo CutSync.',
  },
  details: {
    eyebrow: 'DETALHES',
    title: 'Conte um pouco mais',
    description: 'Não inclua senhas, documentos, tokens ou outros dados sigilosos.',
  },
  review: {
    eyebrow: 'REVISÃO',
    title: 'Confira antes de enviar',
    description: 'O chamado só será criado depois desta confirmação.',
  },
};

const incidentImpactOptions: { value: SupportImpact; label: string; description: string }[] = [
  {
    value: 'normal',
    label: 'Existe uma alternativa',
    description: 'O problema atrapalha, mas ainda consigo concluir a tarefa de outra forma.',
  },
  {
    value: 'high',
    label: 'Uma ação importante está bloqueada',
    description: 'Não consigo concluir uma etapa importante do meu trabalho.',
  },
  {
    value: 'critical',
    label: 'Sistema inutilizável ou risco relevante',
    description: 'O CutSync está indisponível para mim ou existe risco de segurança ou dados.',
  },
];

export function ClientSupportNewScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string | string[] }>();
  const initialAppointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0]
    : params.appointmentId;
  const router = useRouter();
  const { user } = useSession();
  const capabilitiesQuery = useClientSupportCapabilities();
  const appointmentsQuery = useClientAppointments(user?.id ?? null);
  const [state, dispatch] = useReducer(
    supportWizardReducer,
    createInitialSupportWizardState(initialAppointmentId ?? null),
  );
  const [draftStatus, setDraftStatus] = useState<'loading' | 'offer' | 'ready'>('loading');
  const [savedDraft, setSavedDraft] = useState<typeof state | null>(null);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasAppointmentContext = Boolean(
    initialAppointmentId || appointmentsQuery.appointments.length > 0,
  );
  const steps = useMemo(() => getSupportWizardSteps({
    hasAppointmentContext,
  }), [hasAppointmentContext]);
  const currentIndex = Math.max(0, steps.indexOf(state.step));
  const generatedSubject = buildSupportWizardSubject(state);
  const effectiveSubject = state.subjectEdited ? state.subject : generatedSubject;
  const finalMessage = buildSupportWizardMessage(state);

  useEffect(() => {
    if (!user?.id) {
      setDraftStatus('ready');
      return;
    }
    let active = true;
    void loadClientSupportDraft(user.id).then((draft) => {
      if (!active) return;
      if (draft) {
        setSavedDraft(draft);
        setDraftStatus('offer');
      } else {
        setDraftStatus('ready');
      }
    });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || draftStatus !== 'ready') return undefined;
    const timeout = setTimeout(() => {
      if (hasSupportWizardDraftContent(state)) {
        void saveClientSupportDraft(user.id, state);
      } else {
        void removeClientSupportDraft(user.id);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [draftStatus, state, user?.id]);

  useEffect(() => {
    if (draftStatus === 'ready' && !steps.includes(state.step)) {
      dispatch({ type: 'set-step', step: 'area' });
    }
  }, [draftStatus, state.step, steps]);

  const appointmentOptions = useMemo(() => [
    { value: '', label: 'Nenhum atendimento específico' },
    ...appointmentsQuery.appointments.slice(0, 6).map((appointment) => {
      const formatted = formatClientAppointmentDateTime(
        appointment.startsAt,
        appointment.establishment.timezone,
      );
      return {
        value: appointment.id,
        label: `${appointment.establishment.name} · ${formatted.dateLabel}`,
        description: `${formatted.timeLabel} · ${appointment.service.name}`,
      };
    }),
  ], [appointmentsQuery.appointments]);

  const goTo = (step: SupportWizardStep) => {
    setLocalMessage(null);
    dispatch({ type: 'set-step', step });
  };

  const validateCurrentStep = () => {
    if (state.step === 'area' && !state.category) {
      return 'Escolha a área envolvida.';
    }
    if (state.step === 'details') {
      const missing = supportAnswerDefinitions
        .find(({ key }) => !state.answers[key]?.trim());
      if (missing) return `Responda: ${missing.label}`;
      if (effectiveSubject.trim().length < 5) return 'Informe um assunto com pelo menos 5 caracteres.';
    }
    return null;
  };

  const handleContinue = () => {
    const error = validateCurrentStep();
    if (error) {
      setLocalMessage(error);
      return;
    }
    const next = steps[currentIndex + 1];
    if (next) goTo(next);
  };

  const handleBack = () => {
    const previous = steps[currentIndex - 1];
    if (previous) goTo(previous);
  };

  const handleClose = () => {
    if (user?.id) {
      if (hasSupportWizardDraftContent(state)) {
        void saveClientSupportDraft(user.id, state);
      } else {
        void removeClientSupportDraft(user.id);
      }
    }
    router.back();
  };

  const handleSubmit = async () => {
    setLocalMessage(null);
    const validation = validateClientSupportTicket({
      requestKind: 'incident',
      category: state.category ?? '',
      impact: state.impact,
      appointmentId: state.appointmentId,
      subject: effectiveSubject,
      message: finalMessage,
    });
    if (!validation.ok) {
      setLocalMessage(validation.message);
      return;
    }

    const idempotencyKey = state.idempotencyKey ?? createClientSupportIdempotencyKey('create');
    dispatch({ type: 'set-idempotency', value: idempotencyKey });
    setIsSubmitting(true);
    try {
      const result = await createClientSupportTicket({
        category: validation.category,
        impact: validation.impact,
        appointmentId: validation.appointmentId,
        subject: validation.subject,
        message: validation.message,
        idempotencyKey,
      });
      if (user?.id) await removeClientSupportDraft(user.id);
      router.replace({
        pathname: '/support/[id]',
        params: { id: result.ticket.id },
      } as unknown as Href);
    } catch (error) {
      if (user?.id) {
        await saveClientSupportDraft(user.id, { ...state, idempotencyKey });
      }
      setLocalMessage(error instanceof Error
        ? error.message
        : 'Não foi possível abrir o chamado agora.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const capabilities = capabilitiesQuery.capabilities;
  if (
    draftStatus === 'loading'
    || (capabilitiesQuery.isLoading && !capabilities)
  ) {
    return (
      <ClientScreen testID="client-support-new-loading">
        <ClientSurface style={styles.centered}>
          <ActivityIndicator color={supportColors.accent} />
          <Text style={styles.loadingText}>Preparando o atendimento…</Text>
        </ClientSurface>
      </ClientScreen>
    );
  }

  if (
    capabilitiesQuery.error
    || !capabilities?.enabled
    || !capabilities.allowNewTickets
  ) {
    return (
      <ClientScreen testID="client-support-new-unavailable">
        <ClientFeedback
          title="Não é possível abrir um chamado agora"
          description={capabilitiesQuery.error
            || capabilities?.maintenanceMessage
            || 'Novos chamados estão temporariamente pausados.'}
          tone="info"
        />
        <ClientButton label="Voltar ao suporte" tone="secondary" onPress={() => router.back()} />
      </ClientScreen>
    );
  }

  if (draftStatus === 'offer' && savedDraft) {
    return (
      <ClientScreen testID="client-support-draft-offer">
        <ClientSectionHeader
          eyebrow="RASCUNHO ENCONTRADO"
          title="Continuar de onde parou?"
          description="O rascunho fica somente neste dispositivo e expira após sete dias."
        />
        <ClientSurface style={styles.draftActions}>
          <ClientButton
            testID="client-support-draft-continue"
            label="Continuar rascunho"
            onPress={() => {
              dispatch({ type: 'restore', state: savedDraft });
              setDraftStatus('ready');
            }}
          />
          <ClientButton
            testID="client-support-draft-discard"
            label="Descartar"
            tone="secondary"
            onPress={() => {
              if (user?.id) void removeClientSupportDraft(user.id);
              setSavedDraft(null);
              setDraftStatus('ready');
            }}
          />
        </ClientSurface>
      </ClientScreen>
    );
  }

  const copy = stepCopy[state.step];

  return (
    <ClientScreen testID="client-support-new-screen" keyboardShouldPersistTaps="handled">
      <View style={styles.modalHeader}>
        <View style={styles.progressCopy}>
          <Text style={styles.progressLabel}>
            Etapa {currentIndex + 1} de {steps.length}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressValue, {
              width: `${((currentIndex + 1) / steps.length) * 100}%`,
            }]} />
          </View>
        </View>
        <ClientButton label="Fechar" tone="quiet" onPress={handleClose} />
      </View>

      <ClientSectionHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />

      {state.step === 'area' ? (
        <ClientSurface>
          <SupportChoiceGroup
            testIDPrefix="client-support-category"
            label="Área"
            value={state.category}
            onChange={(value) => dispatch({
              type: 'set-category',
              value: value as ClientSupportCategory,
            })}
            options={CLIENT_SUPPORT_CATEGORIES.map((value) => ({
              value,
              label: supportCategoryLabels[value],
              description: supportCategoryDescriptions[value],
            }))}
          />
        </ClientSurface>
      ) : null}

      {state.step === 'context' ? (
        <ClientSurface>
          <SupportChoiceGroup
            testIDPrefix="client-support-appointment"
            label="Atendimento relacionado (opcional)"
            value={state.appointmentId ?? ''}
            onChange={(value) => dispatch({
              type: 'set-appointment',
              value: value || null,
            })}
            options={appointmentOptions}
          />
          {appointmentsQuery.error ? (
            <Text selectable style={styles.errorText}>{appointmentsQuery.error}</Text>
          ) : null}
        </ClientSurface>
      ) : null}

      {state.step === 'impact' ? (
        <ClientSurface>
          <SupportChoiceGroup
            testIDPrefix="client-support-impact"
            label="Impacto do incidente"
            value={state.impact}
            onChange={(value) => dispatch({
              type: 'set-impact',
              value: value as SupportImpact,
            })}
            options={incidentImpactOptions}
          />
        </ClientSurface>
      ) : null}

      {state.step === 'details' ? (
        <ClientSurface>
          {supportAnswerDefinitions.map((definition) => {
            const value = state.answers[definition.key] ?? '';
            return (
              <SupportTextField
                key={definition.key}
                testID={`client-support-answer-${definition.key}`}
                label={definition.label}
                value={value}
                maxLength={1200}
                multiline
                placeholder={definition.placeholder}
                onUnsafeInput={setLocalMessage}
                onChangeText={(nextValue) => dispatch({
                  type: 'set-answer',
                  key: definition.key,
                  value: nextValue,
                })}
                helper={`${value.length}/1200 caracteres`}
              />
            );
          })}
          <SupportTextField
            testID="client-support-subject"
            label="Assunto"
            value={effectiveSubject}
            maxLength={CLIENT_SUPPORT_SUBJECT_MAX_LENGTH}
            placeholder="Resumo do que você precisa"
            onUnsafeInput={setLocalMessage}
            onChangeText={(value) => dispatch({ type: 'set-subject', value })}
            helper={`${effectiveSubject.length}/${CLIENT_SUPPORT_SUBJECT_MAX_LENGTH} caracteres`}
          />
        </ClientSurface>
      ) : null}

      {state.step === 'review' && state.category ? (
        <>
          <ClientSurface>
            <SupportMetadataRow
              label="Área"
              value={supportCategoryLabels[state.category]}
            />
            <SupportMetadataRow label="Impacto" value={supportImpactLabels[state.impact]} />
            <SupportMetadataRow
              label="Atendimento relacionado"
              value={state.appointmentId || 'Nenhum'}
            />
            <SupportMetadataRow label="Assunto" value={effectiveSubject} last />
          </ClientSurface>
          <ClientSurface>
            <Text style={styles.reviewLabel}>Descrição que será enviada</Text>
            <Text selectable style={styles.reviewMessage}>{finalMessage}</Text>
            <Text style={styles.helper}>
              {finalMessage.length}/{CLIENT_SUPPORT_MESSAGE_MAX_LENGTH} caracteres
            </Text>
          </ClientSurface>
        </>
      ) : null}

      {localMessage ? (
        <ClientFeedback
          testID="client-support-create-error"
          description={localMessage}
          tone="danger"
        />
      ) : null}

      <View style={styles.navigation}>
        {currentIndex > 0 ? (
          <ClientButton
            testID="client-support-back"
            label="Voltar"
            tone="secondary"
            disabled={isSubmitting}
            onPress={handleBack}
          />
        ) : <View />}
        {state.step === 'review' ? (
          <ClientButton
            testID="client-support-create"
            label="Confirmar e enviar"
            loading={isSubmitting}
            disabled={isSubmitting}
            haptic="success"
            onPress={() => { void handleSubmit(); }}
          />
        ) : (
          <ClientButton
            testID="client-support-continue"
            label="Continuar"
            onPress={handleContinue}
          />
        )}
      </View>
    </ClientScreen>
  );
}

const styles = StyleSheet.create({
  centered: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: supportColors.secondary, fontSize: 12 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: clientTheme.spacing.md,
  },
  progressCopy: { flex: 1, gap: clientTheme.spacing.xs },
  progressLabel: { color: supportColors.secondary, fontSize: 12, fontWeight: '800' },
  progressTrack: {
    height: 5,
    overflow: 'hidden',
    borderRadius: clientTheme.radii.pill,
    backgroundColor: supportColors.border,
  },
  progressValue: {
    height: '100%',
    borderRadius: clientTheme.radii.pill,
    backgroundColor: supportColors.accent,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: clientTheme.spacing.sm,
  },
  draftActions: { gap: clientTheme.spacing.sm },
  helper: { color: supportColors.muted, fontSize: 12, lineHeight: 16 },
  errorText: { color: supportColors.danger, fontSize: 12, lineHeight: 16 },
  reviewLabel: {
    color: supportColors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  reviewMessage: { color: supportColors.text, fontSize: 13, lineHeight: 20 },
});
