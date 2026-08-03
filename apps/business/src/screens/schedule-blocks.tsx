import type { BusinessScheduleBlock } from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
import {
  getLocalDateInTimeZone,
  localDateTimeToIso,
  shiftLocalDate,
} from '@/features/agenda/business-agenda';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import {
  businessSchedulesApi,
  type BusinessScheduleBlockKind,
} from '@/features/schedules/business-schedules-api';
import { useBusinessScheduleBlocks } from '@/features/schedules/use-business-schedule-blocks';
import { useBusinessTeam } from '@/features/team/use-business-team';
import { businessTheme } from '@/theme/business-theme';

type BlockCommand =
  | {
      type: 'save';
      requestId: string;
      blockId?: string;
      values: Parameters<typeof businessSchedulesApi.create>[2];
    }
  | { type: 'delete'; requestId: string; blockId: string };

const kindLabels: Record<BusinessScheduleBlockKind, string> = {
  break: 'Intervalo',
  time_off: 'Folga',
  blocked: 'Bloqueio',
};

const messageFor = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível atualizar o bloqueio.';

const localParts = (value: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
};

export function BusinessScheduleBlocksScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const range = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 31 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, []);
  const blocks = useBusinessScheduleBlocks(range.start, range.end);
  const team = useBusinessTeam();
  const [selected, setSelected] = useState<BusinessScheduleBlock | null>(null);
  const [professionalId, setProfessionalId] = useState(user?.id ?? '');
  const [kind, setKind] = useState<BusinessScheduleBlockKind>('blocked');
  const [allDay, setAllDay] = useState(false);
  const [startDate, setStartDate] = useState(getLocalDateInTimeZone(timeZone));
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState(getLocalDateInTimeZone(timeZone));
  const [endTime, setEndTime] = useState('10:00');
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<BlockCommand | null>(null);
  const canManageOwn = hasCapability('manage_own_blocks');
  const canManageTeam = hasCapability('manage_team_blocks');
  const canMutate = activeContext?.accessMode === 'full' && (canManageOwn || canManageTeam);
  const activeTeamMembers = useMemo(
    () => (team.data?.members ?? []).filter((member) => member.status === 'active'),
    [team.data?.members],
  );

  useEffect(() => {
    if (!professionalId && user?.id) setProfessionalId(user.id);
  }, [professionalId, user?.id]);

  const invalidate = async () => {
    if (!user || !activeContext) return;
    await Promise.all([
      businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'schedule-blocks') }),
      businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda') }),
    ]);
  };

  const mutation = useMutation({
    retry: false,
    mutationFn: async (command: BlockCommand) => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      setLastCommand(command);
      if (command.type === 'delete') {
        return businessSchedulesApi.remove(activeContext.establishmentId, command.blockId, command.requestId);
      }
      return command.blockId
        ? businessSchedulesApi.update(activeContext.establishmentId, command.blockId, command.requestId, command.values)
        : businessSchedulesApi.create(activeContext.establishmentId, command.requestId, command.values);
    },
    onSuccess: async () => {
      setLastCommand(null);
      setFormError(null);
      setSelected(null);
      await invalidate();
    },
  });

  const resetCommand = () => {
    setLastCommand(null);
    setFormError(null);
    mutation.reset();
  };

  const save = () => {
    const targetProfessionalId = canManageTeam ? professionalId : user?.id ?? '';
    if (!targetProfessionalId) {
      setFormError('Selecione um profissional ativo.');
      return;
    }
    const startsAt = localDateTimeToIso(startDate, allDay ? '00:00' : startTime, timeZone);
    const effectiveEndDate = allDay ? shiftLocalDate(startDate, 1) : endDate;
    const endsAt = localDateTimeToIso(effectiveEndDate, allDay ? '00:00' : endTime, timeZone);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) {
      setFormError('Revise as datas e os horários informados.');
      return;
    }
    const values = {
      professionalId: targetProfessionalId,
      startsAt,
      endsAt,
      kind,
      reason,
      allDay,
      localDate: allDay ? startDate : null,
    };
    setFormError(null);
    mutation.mutate({
      type: 'save',
      requestId: createMobileRequestId(),
      blockId: selected?.id,
      values,
    });
  };

  const edit = (block: BusinessScheduleBlock) => {
    const start = localParts(block.startsAt, timeZone);
    const end = localParts(block.endsAt, timeZone);
    setSelected(block);
    setProfessionalId(block.professionalId);
    setKind(block.kind);
    setAllDay(block.allDay);
    setStartDate(block.localDate ?? start.date);
    setStartTime(start.time);
    setEndDate(end.date);
    setEndTime(end.time);
    setReason(block.reason ?? '');
    resetCommand();
  };

  return (
    <BusinessPage testID="business-schedule-blocks-screen">
      <BusinessHeader eyebrow="DISPONIBILIDADE" title="Bloqueios" description="Intervalos, folgas, bloqueios e dias inteiros no fuso da unidade." />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      {!canMutate ? <BusinessNotice tone="warning" message="Seu papel ou modo de acesso não permite alterar bloqueios." /> : null}
      {canMutate ? (
        <BusinessCard style={styles.form}>
          <BusinessSectionTitle>{selected ? 'Editar bloqueio' : 'Novo bloqueio'}</BusinessSectionTitle>
          {canManageTeam ? (
            <>
              <Text style={styles.fieldLabel}>Profissional</Text>
              {team.isLoading ? <BusinessNotice message="Carregando equipe autorizada…" /> : null}
              {team.error ? <BusinessNotice tone="danger" message="Não foi possível carregar a equipe." /> : null}
              {!team.isLoading && !team.error && activeTeamMembers.length === 0 ? (
                <BusinessNotice message="Nenhum membro ativo disponível para bloqueio." />
              ) : null}
              <View style={styles.selector}>
              {activeTeamMembers.map((member) => (
                <Pressable key={member.profileId} onPress={() => { setProfessionalId(member.profileId); resetCommand(); }} style={[styles.choice, professionalId === member.profileId && styles.choiceSelected]}>
                  <Text style={styles.choiceText}>{member.name}</Text>
                </Pressable>
              ))}
              </View>
            </>
          ) : (
            <Text style={styles.fieldLabel}>Profissional: você</Text>
          )}
          <View style={styles.selector}>
            {(Object.keys(kindLabels) as BusinessScheduleBlockKind[]).map((item) => (
              <Pressable key={item} onPress={() => { setKind(item); resetCommand(); }} style={[styles.choice, kind === item && styles.choiceSelected]}><Text style={styles.choiceText}>{kindLabels[item]}</Text></Pressable>
            ))}
          </View>
          <BusinessButton label={allDay ? 'Dia inteiro: sim' : 'Dia inteiro: não'} variant="secondary" onPress={() => { setAllDay((value) => !value); resetCommand(); }} />
          <TextInput value={startDate} onChangeText={(value) => { setStartDate(value); resetCommand(); }} placeholder="Data inicial AAAA-MM-DD" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
          {!allDay ? (
            <>
              <TextInput value={startTime} onChangeText={(value) => { setStartTime(value); resetCommand(); }} placeholder="Início HH:mm" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
              <TextInput value={endDate} onChangeText={(value) => { setEndDate(value); resetCommand(); }} placeholder="Data final AAAA-MM-DD" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
              <TextInput value={endTime} onChangeText={(value) => { setEndTime(value); resetCommand(); }} placeholder="Fim HH:mm" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
            </>
          ) : null}
          <TextInput value={reason} onChangeText={(value) => { setReason(value); resetCommand(); }} placeholder="Motivo opcional" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
          {formError || mutation.error ? <BusinessNotice tone="danger" message={formError ?? messageFor(mutation.error)} /> : null}
          <BusinessButton label={mutation.isError && lastCommand?.type === 'save' ? 'Tentar novamente com o mesmo comando' : selected ? 'Salvar edição' : 'Criar bloqueio'} loading={mutation.isPending} disabled={canManageTeam && !professionalId} onPress={() => lastCommand?.type === 'save' ? mutation.mutate(lastCommand) : save()} />
          {selected ? <BusinessButton label="Cancelar edição" variant="ghost" onPress={() => setSelected(null)} /> : null}
        </BusinessCard>
      ) : null}

      <View style={styles.section}>
        <BusinessSectionTitle>Próximos 31 dias</BusinessSectionTitle>
        {blocks.isLoading ? <BusinessNotice message="Carregando bloqueios…" /> : null}
        {blocks.error ? <BusinessNotice tone="danger" message={messageFor(blocks.error)} /> : null}
        {blocks.data?.length === 0 ? <BusinessNotice message="Nenhum bloqueio no período." /> : blocks.data?.map((block) => (
          <BusinessCard key={block.id}>
            <View style={styles.row}>
              <View style={styles.copy}>
                <Text selectable style={styles.title}>{kindLabels[block.kind]}{block.allDay ? ' · dia inteiro' : ''}</Text>
                <Text selectable style={styles.meta}>{new Date(block.startsAt).toLocaleString('pt-BR', { timeZone })} — {new Date(block.endsAt).toLocaleString('pt-BR', { timeZone })}</Text>
                {block.reason ? <Text selectable style={styles.meta}>{block.reason}</Text> : null}
              </View>
              <BusinessPill label={block.professionalId === user?.id ? 'Meu' : 'Equipe'} />
            </View>
            {canMutate && (canManageTeam || block.professionalId === user?.id) ? (
              <View style={styles.actions}>
                <BusinessButton label="Editar" variant="secondary" disabled={mutation.isPending} onPress={() => edit(block)} />
                <BusinessButton label="Remover" variant="danger" disabled={mutation.isPending} onPress={() => Alert.alert('Remover bloqueio?', 'O servidor validará novamente conflitos e autorização.', [
                  { text: 'Voltar', style: 'cancel' },
                  { text: 'Remover', style: 'destructive', onPress: () => mutation.mutate({ type: 'delete', blockId: block.id, requestId: createMobileRequestId() }) },
                ])} />
              </View>
            ) : null}
          </BusinessCard>
        ))}
      </View>
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  form: { gap: businessTheme.spacing.sm },
  fieldLabel: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  input: { minHeight: businessTheme.sizing.control, borderWidth: 1, borderColor: businessTheme.colors.borderStrong, borderRadius: businessTheme.radii.md, paddingHorizontal: businessTheme.spacing.md, backgroundColor: businessTheme.colors.canvasRaised, color: businessTheme.colors.text },
  selector: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  choice: { minHeight: 42, justifyContent: 'center', paddingHorizontal: businessTheme.spacing.md, borderRadius: businessTheme.radii.pill, backgroundColor: businessTheme.colors.surfaceMuted },
  choiceSelected: { borderWidth: 1, borderColor: businessTheme.colors.accent },
  choiceText: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  row: { flexDirection: 'row', gap: businessTheme.spacing.md, alignItems: 'flex-start' },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  meta: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  actions: { gap: businessTheme.spacing.sm },
});
