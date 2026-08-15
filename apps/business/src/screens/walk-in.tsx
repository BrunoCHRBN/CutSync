import { createMobileRequestId } from '@cutsync/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { WalkInClientStep } from '@/components/appointments/walk-in-client-step';
import { WalkInProgress } from '@/components/appointments/walk-in-progress';
import { WalkInScheduleStep } from '@/components/appointments/walk-in-schedule-step';
import { WalkInSelectionStep } from '@/components/appointments/walk-in-selection-step';
import { BusinessButton, BusinessCard, BusinessHeader, BusinessNotice, BusinessPage } from '@/components/ui/business-ui';
import { BusinessToast } from '@/components/ui/business-toast';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { getLocalDateInTimeZone } from '@/features/agenda/business-agenda';
import { businessAppointmentsApi } from '@/features/appointments/business-appointments-api';
import { useBusinessClients } from '@/features/clients/use-business-clients';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { useBusinessServices } from '@/features/services/use-business-services';
import { useBusinessTeam } from '@/features/team/use-business-team';
import { businessTheme } from '@/theme/business-theme';

const steps = ['Cliente', 'Serviço', 'Profissional', 'Horário', 'Revisão'] as const;
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const messageFor = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível agendar este atendimento.';

export function BusinessWalkInScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string; time?: string; professionalId?: string }>();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const today = getLocalDateInTimeZone(timeZone);
  const services = useBusinessServices();
  const team = useBusinessTeam();
  const [step, setStep] = useState(0);
  const [clientQuery, setClientQuery] = useState('');
  const clients = useBusinessClients(clientQuery);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState(activeContext?.operationalRole === 'professional' ? user?.id ?? '' : params.professionalId ?? '');
  const [localDate, setLocalDate] = useState(localDatePattern.test(params.date ?? '') && (params.date ?? '') >= today ? params.date! : today);
  const [startsAt, setStartsAt] = useState('');
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    if (activeContext?.operationalRole === 'professional' && user?.id) setProfessionalId(user.id);
  }, [activeContext?.operationalRole, user?.id]);

  const canCreate = hasCapability(activeContext?.operationalRole === 'professional' ? 'create_self_walk_in' : 'create_team_walk_in')
    && activeContext?.accessMode === 'full';
  const slots = useQuery({
    queryKey: createBusinessQueryKey(user?.id ?? 'signed-out', activeContext?.establishmentId ?? 'none', 'availability', professionalId || 'none', serviceId || 'none', localDate),
    enabled: Boolean(activeContext && professionalId && serviceId && localDatePattern.test(localDate)),
    queryFn: () => businessAppointmentsApi.getAvailableSlots({ establishmentId: activeContext!.establishmentId, professionalId, serviceId, localDate }),
  });

  useEffect(() => {
    if (startsAt || !/^([01]\d|2[0-3]):[0-5]\d$/.test(params.time ?? '')) return;
    const preferred = slots.data?.slots.find((slot) => slot.localTime === params.time);
    if (preferred) setStartsAt(preferred.startsAt);
  }, [params.time, slots.data?.slots, startsAt]);

  const resetCommand = () => { requestId.current = null; create.reset(); };
  const create = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext || !startsAt || (!selectedClientId && clientName.trim().length < 2)) throw new BusinessFeatureError('invalid_request');
      requestId.current ??= createMobileRequestId();
      return businessAppointmentsApi.create({
        establishmentId: activeContext.establishmentId,
        professionalId,
        serviceId,
        startsAt,
        requestId: requestId.current,
        establishmentClientId: selectedClientId,
        clientName: selectedClientId ? null : clientName,
        clientPhone: selectedClientId ? null : clientPhone,
        clientEmail: selectedClientId ? null : clientEmail,
        notes,
      });
    },
    onSuccess: async (result) => {
      if (user && activeContext) {
        await Promise.all([
          businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda') }),
          businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'clients') }),
        ]);
      }
      requestId.current = null;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setSuccessMessage('Atendimento agendado com sucesso.');
      await new Promise((resolve) => setTimeout(resolve, 800));
      router.replace(`/(app)/appointments/${result.appointmentId}` as never);
    },
  });

  const activeServices = services.data?.filter((service) => service.isActive) ?? [];
  const professionals = activeContext?.operationalRole === 'professional'
    ? [{ profileId: user?.id ?? '', name: 'Minha agenda', status: 'active' as const }]
    : team.data?.members.filter((member) => member.status === 'active') ?? [];
  const selectedService = activeServices.find((service) => service.id === serviceId);
  const selectedProfessional = professionals.find((professional) => professional.profileId === professionalId);
  const selectedClient = clients.data?.find((client) => client.id === selectedClientId);
  const clientValid = Boolean(selectedClientId || clientName.trim().length >= 2);
  const canAdvance = [clientValid, Boolean(serviceId), Boolean(professionalId), Boolean(startsAt), true][step];

  const setDate = (date: string) => { setLocalDate(date); setStartsAt(''); resetCommand(); };
  const setService = (id: string) => { setServiceId(id); setStartsAt(''); resetCommand(); };
  const setProfessional = (id: string) => { setProfessionalId(id); setStartsAt(''); resetCommand(); };
  const back = () => { if (step > 0) setStep((current) => current - 1); else router.back(); };

  return (
    <View style={styles.screen}>
      <BusinessPage testID="business-walk-in-screen" contentStyle={styles.pageContent}>
        <BusinessHeader testID="business-walk-in-header" eyebrow={`ETAPA ${step + 1} DE ${steps.length}`} title="Novo atendimento" description={steps[step]} />
        <BusinessButton testID="business-walk-in-back" label={step > 0 ? 'Etapa anterior' : 'Fechar'} variant="ghost" onPress={back} />
        <WalkInProgress currentStep={step} labels={steps} onStepPress={setStep} />
        {!canCreate ? <BusinessNotice testID="business-walk-in-forbidden" tone="danger" message="Seu acesso atual não permite criar atendimentos." /> : null}

        {step === 0 ? (
          <WalkInClientStep
            clients={clients.data ?? []}
            query={clientQuery}
            selectedClientId={selectedClientId}
            clientName={clientName}
            clientPhone={clientPhone}
            clientEmail={clientEmail}
            isLoading={clients.isLoading}
            error={Boolean(clients.error)}
            onQueryChange={setClientQuery}
            onClientSelect={(id) => { setSelectedClientId(id); setClientName(''); resetCommand(); }}
            onUseNewClient={() => { setSelectedClientId(null); resetCommand(); }}
            onClientNameChange={(value) => { setClientName(value); resetCommand(); }}
            onClientPhoneChange={(value) => { setClientPhone(value); resetCommand(); }}
            onClientEmailChange={(value) => { setClientEmail(value); resetCommand(); }}
          />
        ) : null}
        {step === 1 ? (
          <WalkInSelectionStep testID="business-walk-in-services" options={activeServices.map((service) => ({ id: service.id, label: service.name, meta: `${currency.format(service.price)} · ${service.durationMinutes} min` }))} selectedId={serviceId} isLoading={services.isLoading} error={Boolean(services.error)} emptyMessage="Nenhum serviço ativo está disponível." onSelect={setService} />
        ) : null}
        {step === 2 ? (
          <WalkInSelectionStep testID="business-walk-in-professionals" options={professionals.map((professional) => ({ id: professional.profileId, label: professional.name }))} selectedId={professionalId} isLoading={team.isLoading && activeContext?.operationalRole !== 'professional'} error={Boolean(team.error && activeContext?.operationalRole !== 'professional')} emptyMessage="Nenhum profissional ativo está disponível." onSelect={setProfessional} />
        ) : null}
        {step === 3 ? (
          <WalkInScheduleStep localDate={localDate} timeZone={timeZone} slots={slots.data?.slots ?? []} selectedStartsAt={startsAt} isFetching={slots.isFetching} errorMessage={slots.error ? messageFor(slots.error) : null} unavailableReason={slots.data?.unavailableReason ?? null} onDateChange={setDate} onSlotSelect={(value) => { setStartsAt(value); resetCommand(); }} />
        ) : null}
        {step === 4 ? (
          <View testID="business-walk-in-review" style={styles.review}>
            <BusinessCard testID="business-walk-in-review-card">
              <Text testID="business-walk-in-review-client" selectable style={styles.reviewTitle}>{selectedClient?.displayName ?? clientName}</Text>
              <Text testID="business-walk-in-review-service" selectable style={styles.reviewMeta}>{selectedService ? `${selectedService.name} · ${currency.format(selectedService.price)}` : 'Serviço não selecionado'}</Text>
              <Text testID="business-walk-in-review-professional" selectable style={styles.reviewMeta}>{selectedProfessional?.name ?? 'Profissional não selecionado'}</Text>
              <Text testID="business-walk-in-review-time" selectable style={styles.reviewMeta}>{startsAt ? new Date(startsAt).toLocaleString('pt-BR', { timeZone }) : 'Horário não selecionado'}</Text>
            </BusinessCard>
            <TextInput testID="business-walk-in-notes" value={notes} onChangeText={(value) => { setNotes(value); resetCommand(); }} placeholder="Observações (opcional)" placeholderTextColor={businessTheme.colors.textMuted} multiline style={styles.notes} />
            {create.error ? <BusinessNotice testID="business-walk-in-create-error" tone="danger" message={messageFor(create.error)} /> : null}
          </View>
        ) : null}

        {step < steps.length - 1 ? (
          <BusinessButton testID="business-walk-in-next" label="Continuar" disabled={!canCreate || !canAdvance} onPress={() => setStep((current) => current + 1)} />
        ) : (
          <BusinessButton testID="business-walk-in-confirm" label={create.isError && requestId.current ? 'Tentar novamente' : 'Confirmar agendamento'} loading={create.isPending} disabled={!canCreate || !startsAt || !serviceId || !professionalId || !clientValid} onPress={() => create.mutate()} />
        )}
      </BusinessPage>
      {successMessage ? <BusinessToast testID="business-walk-in-success-toast" message={successMessage} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: businessTheme.colors.canvas },
  pageContent: { paddingBottom: 112 },
  review: { gap: businessTheme.spacing.md },
  reviewTitle: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  reviewMeta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  notes: { minHeight: 104, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, padding: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text, textAlignVertical: 'top' },
});