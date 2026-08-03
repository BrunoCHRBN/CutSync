import { createMobileRequestId } from '@cutsync/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { useBusinessSession } from '@/contexts/business-session';
import { getLocalDateInTimeZone } from '@/features/agenda/business-agenda';
import { businessAppointmentsApi } from '@/features/appointments/business-appointments-api';
import { useBusinessClients } from '@/features/clients/use-business-clients';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { useBusinessServices } from '@/features/services/use-business-services';
import { useBusinessTeam } from '@/features/team/use-business-team';
import { businessTheme } from '@/theme/business-theme';

const messageFor = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível criar o encaixe.';

export function BusinessWalkInScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const services = useBusinessServices();
  const team = useBusinessTeam();
  const clients = useBusinessClients('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [professionalId, setProfessionalId] = useState(
    activeContext?.operationalRole === 'professional' ? user?.id ?? '' : '',
  );
  const [localDate, setLocalDate] = useState(
    getLocalDateInTimeZone(activeContext?.timezone ?? 'America/Sao_Paulo'),
  );
  const [startsAt, setStartsAt] = useState('');
  const [notes, setNotes] = useState('');
  const requestId = useRef<string | null>(null);
  const canCreate = hasCapability(
    activeContext?.operationalRole === 'professional' ? 'create_self_walk_in' : 'create_team_walk_in',
  ) && activeContext?.accessMode === 'full';

  const slots = useQuery({
    queryKey: createBusinessQueryKey(
      user?.id ?? 'signed-out',
      activeContext?.establishmentId ?? 'none',
      'availability',
      professionalId || 'none',
      serviceId || 'none',
      localDate,
    ),
    enabled: Boolean(activeContext && professionalId && serviceId && /^\d{4}-\d{2}-\d{2}$/.test(localDate)),
    queryFn: () => businessAppointmentsApi.getAvailableSlots({
      establishmentId: activeContext!.establishmentId,
      professionalId,
      serviceId,
      localDate,
    }),
  });

  const create = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext || !startsAt || (!selectedClientId && !clientName.trim())) {
        throw new BusinessFeatureError('invalid_request');
      }
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
      router.replace(`/(app)/appointments/${result.appointmentId}` as never);
    },
  });

  const resetCommand = () => {
    requestId.current = null;
    create.reset();
  };
  const chooseService = (id: string) => { setServiceId(id); setStartsAt(''); resetCommand(); };
  const chooseProfessional = (id: string) => { setProfessionalId(id); setStartsAt(''); resetCommand(); };
  const activeServices = services.data?.filter((service) => service.isActive) ?? [];
  const professionals = activeContext?.operationalRole === 'professional'
    ? [{ profileId: user?.id ?? '', name: 'Minha agenda', status: 'active' as const }]
    : team.data?.members.filter((member) => member.status === 'active') ?? [];
  const selectedService = activeServices.find((service) => service.id === serviceId);
  const selectedProfessional = professionals.find((professional) => professional.profileId === professionalId);
  const selectedClient = clients.data?.find((client) => client.id === selectedClientId);

  return (
    <BusinessPage testID="business-walk-in-screen">
      <BusinessHeader eyebrow="ENCAIXE" title="Novo atendimento" description="Cada etapa será validada novamente em uma única transação." />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      {!canCreate ? <BusinessNotice tone="danger" message="Seu papel ou modo de acesso não permite criar este encaixe." /> : null}

      <View style={styles.section}>
        <BusinessSectionTitle>1. Cliente</BusinessSectionTitle>
        {clients.data?.length ? (
          <View style={styles.selector}>
            {clients.data.slice(0, 20).map((client) => (
              <Choice key={client.id} label={client.displayName} selected={selectedClientId === client.id} onPress={() => { setSelectedClientId(client.id); setClientName(''); resetCommand(); }} />
            ))}
          </View>
        ) : null}
        <BusinessCard style={styles.form}>
          <Text style={styles.meta}>{selectedClientId ? 'Cadastro existente selecionado' : 'Criação rápida durante o encaixe'}</Text>
          {!selectedClientId ? (
            <>
              <TextInput value={clientName} onChangeText={(value) => { setClientName(value); resetCommand(); }} placeholder="Nome *" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
              <TextInput value={clientPhone} onChangeText={(value) => { setClientPhone(value); resetCommand(); }} placeholder="Telefone" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
              <TextInput value={clientEmail} onChangeText={(value) => { setClientEmail(value); resetCommand(); }} placeholder="E-mail" placeholderTextColor={businessTheme.colors.textMuted} autoCapitalize="none" style={styles.input} />
            </>
          ) : <BusinessButton label="Usar criação rápida" variant="ghost" onPress={() => { setSelectedClientId(null); resetCommand(); }} />}
        </BusinessCard>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>2. Serviço</BusinessSectionTitle>
        <View style={styles.selector}>{activeServices.map((service) => <Choice key={service.id} label={`${service.name} · ${service.durationMinutes} min`} selected={serviceId === service.id} onPress={() => chooseService(service.id)} />)}</View>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>3. Profissional</BusinessSectionTitle>
        <View style={styles.selector}>{professionals.map((professional) => <Choice key={professional.profileId} label={professional.name} selected={professionalId === professional.profileId} onPress={() => chooseProfessional(professional.profileId)} />)}</View>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>4. Horário disponível</BusinessSectionTitle>
        <TextInput value={localDate} onChangeText={(value) => { setLocalDate(value); setStartsAt(''); resetCommand(); }} placeholder="AAAA-MM-DD" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
        {slots.isFetching ? <BusinessNotice message="Consultando disponibilidade centralizada…" /> : null}
        {slots.error ? <BusinessNotice tone="danger" message={messageFor(slots.error)} /> : null}
        {slots.data && slots.data.slots.length === 0 ? <BusinessNotice message="Nenhum horário disponível nesta data." /> : null}
        <View style={styles.selector}>{slots.data?.slots.map((slot) => <Choice key={slot.startsAt} label={slot.localTime} selected={startsAt === slot.startsAt} onPress={() => { setStartsAt(slot.startsAt); resetCommand(); }} />)}</View>
      </View>

      <View style={styles.section}>
        <BusinessSectionTitle>5. Revisão e confirmação</BusinessSectionTitle>
        <BusinessCard>
          <Text selectable style={styles.title}>{selectedClient?.displayName ?? (clientName || 'Cliente não selecionado')}</Text>
          <Text selectable style={styles.meta}>{selectedService?.name ?? 'Serviço não selecionado'} · {selectedProfessional?.name ?? 'Profissional não selecionado'}</Text>
          <Text selectable style={styles.meta}>{startsAt ? new Date(startsAt).toLocaleString('pt-BR', { timeZone: activeContext?.timezone }) : 'Horário não selecionado'}</Text>
          <TextInput value={notes} onChangeText={(value) => { setNotes(value); resetCommand(); }} placeholder="Observações autorizadas" placeholderTextColor={businessTheme.colors.textMuted} multiline style={[styles.input, styles.notes]} />
        </BusinessCard>
        {create.error ? <BusinessNotice tone="danger" message={messageFor(create.error)} /> : null}
        <BusinessButton
          testID="business-walk-in-confirm"
          label={create.isError && requestId.current ? 'Tentar novamente com o mesmo comando' : 'Confirmar encaixe'}
          loading={create.isPending}
          disabled={!canCreate || !startsAt || !serviceId || !professionalId || (!selectedClientId && !clientName.trim())}
          onPress={() => create.mutate()}
        />
      </View>
    </BusinessPage>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      <Text style={styles.choiceText}>{label}</Text>
      {selected ? <BusinessPill label="Selecionado" tone="success" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  form: { gap: businessTheme.spacing.sm },
  selector: { gap: businessTheme.spacing.xs },
  choice: { minHeight: businessTheme.sizing.control, flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.sm, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, padding: businessTheme.spacing.sm, backgroundColor: businessTheme.colors.surface },
  choiceSelected: { borderColor: businessTheme.colors.accent },
  choiceText: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text, flex: 1 },
  input: { minHeight: businessTheme.sizing.control, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.sm, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  meta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
});
