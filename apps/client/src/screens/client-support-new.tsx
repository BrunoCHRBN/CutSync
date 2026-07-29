import {
  CLIENT_SUPPORT_CATEGORIES,
  formatClientAppointmentDateTime,
  SUPPORT_IMPACTS,
  supportCategoryDescriptions,
  supportCategoryLabels,
  supportImpactDescriptions,
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import {
  SupportChoiceGroup,
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
import { useClientSupportCapabilities } from '@/features/support/use-client-support';
import { clientTheme } from '@/theme/client-theme';

export function ClientSupportNewScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string | string[] }>();
  const initialAppointmentId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0]
    : params.appointmentId;
  const router = useRouter();
  const { user } = useSession();
  const capabilitiesQuery = useClientSupportCapabilities();
  const appointmentsQuery = useClientAppointments(user?.id ?? null);
  const [category, setCategory] = useState<ClientSupportCategory | null>(null);
  const [impact, setImpact] = useState<SupportImpact>('normal');
  const [appointmentId, setAppointmentId] = useState<string | null>(initialAppointmentId ?? null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    if (initialAppointmentId) setAppointmentId(initialAppointmentId);
  }, [initialAppointmentId]);

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

  const resetIdempotency = () => {
    idempotencyKey.current = null;
    setLocalMessage(null);
  };

  const handleSubmit = async () => {
    setLocalMessage(null);
    const validation = validateClientSupportTicket({
      category: category ?? '',
      impact,
      appointmentId,
      subject,
      message,
    });
    if (!validation.ok) {
      setLocalMessage(validation.message);
      return;
    }

    setIsSubmitting(true);
    idempotencyKey.current ??= createClientSupportIdempotencyKey('create');
    try {
      const result = await createClientSupportTicket({
        category: validation.category,
        impact: validation.impact,
        appointmentId: validation.appointmentId,
        subject: validation.subject,
        message: validation.message,
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = null;
      router.replace({
        pathname: '/support/[id]',
        params: { id: result.ticket.id },
      } as unknown as Href);
    } catch (error) {
      setLocalMessage(error instanceof Error
        ? error.message
        : 'Não foi possível abrir o chamado agora.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const capabilities = capabilitiesQuery.capabilities;
  if (capabilitiesQuery.isLoading && !capabilities) {
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

  return (
    <ClientScreen testID="client-support-new-screen" keyboardShouldPersistTaps="handled">
      <ClientSectionHeader
        eyebrow="NOVO CHAMADO"
        title="Conte o que aconteceu"
        description="Evite incluir senhas, documentos, tokens ou outros dados sigilosos."
      />

      <ClientSurface>
        <SupportChoiceGroup
          testIDPrefix="client-support-category"
          label="Área"
          value={category}
          onChange={(value) => {
            resetIdempotency();
            setCategory(value as ClientSupportCategory);
          }}
          options={CLIENT_SUPPORT_CATEGORIES.map((value) => ({
            value,
            label: supportCategoryLabels[value],
            description: supportCategoryDescriptions[value],
          }))}
        />
      </ClientSurface>

      <ClientSurface>
        <SupportChoiceGroup
          testIDPrefix="client-support-impact"
          label="Impacto"
          value={impact}
          onChange={(value) => {
            resetIdempotency();
            setImpact(value as SupportImpact);
          }}
          options={SUPPORT_IMPACTS.map((value) => ({
            value,
            label: supportImpactLabels[value],
            description: supportImpactDescriptions[value],
          }))}
        />
      </ClientSurface>

      <ClientSurface>
        <SupportChoiceGroup
          testIDPrefix="client-support-appointment"
          label="Atendimento relacionado (opcional)"
          value={appointmentId ?? ''}
          onChange={(value) => {
            resetIdempotency();
            setAppointmentId(value || null);
          }}
          options={appointmentOptions}
        />
        {appointmentsQuery.isLoading ? (
          <Text style={styles.helper}>Carregando seus atendimentos…</Text>
        ) : null}
        {appointmentsQuery.error ? (
          <Text selectable style={styles.errorText}>{appointmentsQuery.error}</Text>
        ) : null}
      </ClientSurface>

      <ClientSurface>
        <SupportTextField
          testID="client-support-subject"
          label="Assunto"
          value={subject}
          maxLength={CLIENT_SUPPORT_SUBJECT_MAX_LENGTH}
          placeholder="Resumo do que você precisa"
          returnKeyType="next"
          onUnsafeInput={setLocalMessage}
          onChangeText={(value) => {
            resetIdempotency();
            setSubject(value);
          }}
          helper={`${subject.length}/${CLIENT_SUPPORT_SUBJECT_MAX_LENGTH} caracteres`}
        />
        <SupportTextField
          testID="client-support-message"
          label="Mensagem"
          value={message}
          maxLength={CLIENT_SUPPORT_MESSAGE_MAX_LENGTH}
          multiline
          placeholder="Descreva o problema, o resultado esperado e o que já tentou."
          onUnsafeInput={setLocalMessage}
          onChangeText={(value) => {
            resetIdempotency();
            setMessage(value);
          }}
          helper={`${message.length}/${CLIENT_SUPPORT_MESSAGE_MAX_LENGTH} caracteres`}
        />
      </ClientSurface>

      {localMessage ? (
        <ClientFeedback
          testID="client-support-create-error"
          description={localMessage}
          tone="danger"
        />
      ) : null}

      <ClientButton
        testID="client-support-create"
        label="Enviar chamado"
        loading={isSubmitting}
        disabled={isSubmitting}
        haptic="success"
        onPress={() => { void handleSubmit(); }}
      />
      <Text style={styles.footerNote}>
        O protocolo aparecerá no aplicativo assim que o chamado for recebido.
      </Text>
    </ClientScreen>
  );
}

const styles = StyleSheet.create({
  centered: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: supportColors.secondary, fontSize: 12 },
  helper: { color: supportColors.muted, fontSize: 11, lineHeight: 16 },
  errorText: { color: supportColors.danger, fontSize: 11, lineHeight: 16 },
  footerNote: {
    color: supportColors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    paddingHorizontal: clientTheme.spacing.lg,
  },
});
