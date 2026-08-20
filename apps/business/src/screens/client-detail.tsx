import type { EstablishmentClientConsentStatus } from '@cutsync/database';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { createMobileRequestId } from '@/lib/mobile-request-id';

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
import { clientErrorMessage } from '@/features/clients/business-client-errors';
import {
  CONSENT_LABELS,
  CONSENT_OPTIONS,
  LINK_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  describeClientRecurrence,
  linkPillTone,
  statusPillTone,
} from '@/features/clients/business-client-labels';
import { businessClientsApi } from '@/features/clients/business-clients-api';
import { useBusinessClients } from '@/features/clients/use-business-clients';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import {
  businessQueryClient,
  createBusinessQueryKey,
} from '@/features/connectivity/business-query';
import { businessTheme } from '@/theme/business-theme';

export function BusinessClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const clientId = typeof id === 'string' ? id : '';
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const key = createBusinessQueryKey(userId, establishmentId, 'clients', 'detail', clientId);
  const client = useQuery({
    queryKey: key,
    enabled: Boolean(user && activeContext && hasCapability('view_clients') && clientId),
    queryFn: () => businessClientsApi.get(establishmentId, clientId),
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState<EstablishmentClientConsentStatus>('unknown');
  const [duplicateSearch, setDuplicateSearch] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const updateRequestId = useRef<string | null>(null);
  const archiveRequestId = useRef<string | null>(null);
  const restoreRequestId = useRef<string | null>(null);
  const mergeRequestId = useRef<string | null>(null);
  const canManage = hasCapability('manage_clients') && activeContext?.accessMode === 'full';
  const duplicateClients = useBusinessClients(duplicateSearch, { includeArchived: true });
  const duplicateCandidates = (duplicateClients.data ?? []).filter(
    (candidate) => candidate.id !== clientId && candidate.status !== 'merged',
  );

  useEffect(() => {
    if (!client.data || editing) return;
    setName(client.data.displayName);
    setPhone(client.data.phone ?? '');
    setEmail(client.data.email ?? '');
    setTags(client.data.tags.join(', '));
    setNotes(client.data.notes ?? '');
    setConsent(client.data.marketingConsentStatus);
  }, [client.data, editing]);

  const invalidate = async () => {
    if (!user || !activeContext) return;
    await Promise.all([
      businessQueryClient.invalidateQueries({ queryKey: key }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'clients'),
      }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda'),
      }),
    ]);
  };

  const updateClient = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      updateRequestId.current ??= createMobileRequestId();
      return businessClientsApi.update(activeContext.establishmentId, clientId, updateRequestId.current, {
        name,
        phone,
        email,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        notes,
        marketingConsentStatus: consent,
      });
    },
    onSuccess: async () => {
      updateRequestId.current = null;
      setEditing(false);
      await invalidate();
    },
  });

  const archiveClient = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      archiveRequestId.current ??= createMobileRequestId();
      return businessClientsApi.archive(
        activeContext.establishmentId,
        clientId,
        archiveRequestId.current,
      );
    },
    onSuccess: async () => {
      archiveRequestId.current = null;
      await invalidate();
    },
  });

  const restoreClient = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      restoreRequestId.current ??= createMobileRequestId();
      return businessClientsApi.restore(
        activeContext.establishmentId,
        clientId,
        restoreRequestId.current,
      );
    },
    onSuccess: async () => {
      restoreRequestId.current = null;
      await invalidate();
    },
  });

  const mergeClient = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      mergeRequestId.current ??= createMobileRequestId();
      return businessClientsApi.merge({
        establishmentId: activeContext.establishmentId,
        survivorClientId: clientId,
        duplicateClientId: duplicateId.trim(),
        requestId: mergeRequestId.current,
        reason: mergeReason,
      });
    },
    onSuccess: async () => {
      mergeRequestId.current = null;
      setDuplicateSearch('');
      setDuplicateId('');
      setMergeReason('');
      await invalidate();
    },
  });

  const resetUpdateCommand = () => {
    updateRequestId.current = null;
    updateClient.reset();
  };

  const recurrence = client.data
    ? describeClientRecurrence({
      appointmentCount: client.data.appointments.length,
      firstAppointmentAt: client.data.firstAppointmentAt,
      lastAppointmentAt: client.data.lastAppointmentAt,
      timeZone: activeContext?.timezone,
    })
    : null;

  return (
    <BusinessPage testID="business-client-detail-screen">
      <BusinessHeader eyebrow="CLIENTE DA UNIDADE" title={client.data?.displayName ?? 'Cadastro protegido'} />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      {client.isLoading ? <BusinessNotice message="Carregando cadastro autorizado…" /> : null}
      {client.error ? (
        <>
          <BusinessNotice tone="danger" message={clientErrorMessage(client.error)} />
          <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void client.refetch()} />
        </>
      ) : client.data ? (
        <>
          <View style={styles.pills}>
            <BusinessPill label={STATUS_LABELS[client.data.status]} tone={statusPillTone(client.data.status)} />
            <BusinessPill label={SOURCE_LABELS[client.data.source] ?? client.data.source} />
            <BusinessPill label={CONSENT_LABELS[client.data.marketingConsentStatus]} />
            <BusinessPill
              label={LINK_LABELS[client.data.linkStatus]}
              tone={linkPillTone(client.data.linkStatus)}
            />
          </View>

          <BusinessCard style={styles.form}>
            {editing ? (
              <>
                <TextInput value={name} onChangeText={(value) => { setName(value); resetUpdateCommand(); }} placeholder="Nome" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
                <TextInput value={phone} onChangeText={(value) => { setPhone(value); resetUpdateCommand(); }} placeholder="Telefone" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
                <TextInput value={email} onChangeText={(value) => { setEmail(value); resetUpdateCommand(); }} placeholder="E-mail" placeholderTextColor={businessTheme.colors.textMuted} autoCapitalize="none" style={styles.input} />
                <TextInput value={tags} onChangeText={(value) => { setTags(value); resetUpdateCommand(); }} placeholder="Etiquetas" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
                <TextInput value={notes} onChangeText={(value) => { setNotes(value); resetUpdateCommand(); }} placeholder="Observações internas" placeholderTextColor={businessTheme.colors.textMuted} multiline style={[styles.input, styles.notes]} />
                <BusinessSectionTitle>Consentimento promocional</BusinessSectionTitle>
                <View style={styles.consentRow}>
                  {CONSENT_OPTIONS.map((option) => {
                    const selected = consent === option;
                    return (
                      <Pressable
                        key={option}
                        testID={`business-client-consent-${option}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => {
                          setConsent(option);
                          resetUpdateCommand();
                        }}
                        style={[styles.consentChip, selected && styles.consentChipSelected]}
                      >
                        <Text style={[styles.consentChipText, selected && styles.consentChipTextSelected]}>
                          {CONSENT_LABELS[option]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {updateClient.error ? <BusinessNotice tone="danger" message={clientErrorMessage(updateClient.error)} /> : null}
                <BusinessButton
                  label={updateClient.isError && updateRequestId.current ? 'Tentar novamente com o mesmo comando' : 'Salvar alterações'}
                  loading={updateClient.isPending}
                  onPress={() => updateClient.mutate()}
                />
                <BusinessButton label="Cancelar edição" variant="ghost" onPress={() => setEditing(false)} />
              </>
            ) : (
              <>
                <Text selectable style={styles.title}>{client.data.displayName}</Text>
                <Text selectable style={styles.body}>{client.data.phone ?? 'Sem telefone'}</Text>
                <Text selectable style={styles.body}>{client.data.email ?? 'Sem e-mail'}</Text>
                {client.data.tags.length ? <Text selectable style={styles.tags}>{client.data.tags.join(' · ')}</Text> : null}
                {client.data.notes ? <Text selectable style={styles.notesCopy}>{client.data.notes}</Text> : null}
                <Text selectable style={styles.meta}>
                  Consentimento: {CONSENT_LABELS[client.data.marketingConsentStatus]}
                </Text>
                {canManage && client.data.status === 'active' ? (
                  <BusinessButton label="Editar cadastro" variant="secondary" onPress={() => setEditing(true)} />
                ) : null}
                {canManage && client.data.status === 'active' ? (
                  <BusinessButton
                    label={archiveClient.isError && archiveRequestId.current
                      ? 'Tentar arquivar com o mesmo comando'
                      : 'Arquivar cliente'}
                    variant="danger"
                    loading={archiveClient.isPending}
                    onPress={() => Alert.alert(
                      'Arquivar cliente?',
                      'O cadastro sai da busca padrão. Agendamentos futuros ativos bloqueiam o arquivamento.',
                      [
                        { text: 'Voltar', style: 'cancel' },
                        {
                          text: 'Arquivar',
                          style: 'destructive',
                          onPress: () => archiveClient.mutate(),
                        },
                      ],
                    )}
                  />
                ) : null}
                {archiveClient.error ? (
                  <BusinessNotice tone="danger" message={clientErrorMessage(archiveClient.error)} />
                ) : null}
                {canManage && client.data.status === 'archived' ? (
                  <BusinessButton
                    label={restoreClient.isError && restoreRequestId.current
                      ? 'Tentar restaurar com o mesmo comando'
                      : 'Restaurar cliente'}
                    loading={restoreClient.isPending}
                    onPress={() => restoreClient.mutate()}
                  />
                ) : null}
                {restoreClient.error ? (
                  <BusinessNotice tone="danger" message={clientErrorMessage(restoreClient.error)} />
                ) : null}
              </>
            )}
          </BusinessCard>

          {recurrence ? (
            <BusinessCard>
              <BusinessSectionTitle>Recorrência</BusinessSectionTitle>
              <Text selectable style={styles.title}>{recurrence.label}</Text>
              <Text selectable style={styles.body}>{recurrence.detail}</Text>
            </BusinessCard>
          ) : null}

          <BusinessCard>
            <BusinessSectionTitle>Vínculo com conta CutSync</BusinessSectionTitle>
            {client.data.links.length === 0 ? (
              <Text selectable style={styles.body}>Nenhum vínculo registrado para este cadastro.</Text>
            ) : client.data.links.map((link) => (
              <View key={link.id} style={styles.linkRow}>
                <Text selectable style={styles.body}>{LINK_LABELS[link.status]}</Text>
                <Text selectable style={styles.meta}>
                  {link.matchKind} · perfil {link.profileId.slice(0, 8)}…
                </Text>
              </View>
            ))}
          </BusinessCard>

          <View style={styles.section}>
            <BusinessSectionTitle>Histórico de atendimentos</BusinessSectionTitle>
            {client.data.appointments.length === 0 ? <BusinessNotice message="Nenhum atendimento vinculado." /> : client.data.appointments.map((item) => (
              <Pressable key={item.appointmentId} onPress={() => router.push(`/(app)/appointments/${item.appointmentId}` as never)}>
                <BusinessCard>
                  <Text selectable style={styles.title}>{item.serviceName}</Text>
                  <Text selectable style={styles.body}>{item.professionalName}</Text>
                  <Text selectable style={styles.meta}>{new Date(item.startsAt).toLocaleString('pt-BR', { timeZone: activeContext?.timezone })} · {item.status}</Text>
                </BusinessCard>
              </Pressable>
            ))}
          </View>

          {canManage && client.data.status === 'active' ? (
            <View style={styles.section}>
              <BusinessSectionTitle>Merge explícito</BusinessSectionTitle>
              <BusinessNotice tone="warning" message="Selecione explicitamente o cadastro duplicado. O cadastro desta tela será preservado como principal; nenhum cadastro é unido automaticamente por nome e a operação é auditada." />
              <TextInput
                value={duplicateSearch}
                onChangeText={(value) => {
                  setDuplicateSearch(value);
                  setDuplicateId('');
                  mergeRequestId.current = null;
                  mergeClient.reset();
                }}
                placeholder="Buscar duplicado por nome ou contato"
                placeholderTextColor={businessTheme.colors.textMuted}
                style={styles.input}
              />
              {duplicateClients.isLoading ? <BusinessNotice message="Buscando cadastros autorizados…" /> : null}
              {duplicateClients.error ? <BusinessNotice tone="danger" message={clientErrorMessage(duplicateClients.error)} /> : null}
              {!duplicateClients.isLoading && !duplicateClients.error && duplicateCandidates.length === 0 ? (
                <BusinessNotice message="Nenhum outro cadastro encontrado." />
              ) : null}
              <View style={styles.candidates}>
                {duplicateCandidates.map((candidate) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: duplicateId === candidate.id }}
                    key={candidate.id}
                    onPress={() => {
                      setDuplicateId(candidate.id);
                      mergeRequestId.current = null;
                      mergeClient.reset();
                    }}
                    style={[
                      styles.candidate,
                      duplicateId === candidate.id && styles.candidateSelected,
                    ]}
                  >
                    <Text style={styles.title}>{candidate.displayName}</Text>
                    <Text style={styles.meta}>
                      {SOURCE_LABELS[candidate.source] ?? candidate.source}
                      {' · '}
                      {candidate.phone ?? candidate.email ?? 'Sem contato cadastrado'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput value={mergeReason} onChangeText={(value) => { setMergeReason(value); mergeRequestId.current = null; mergeClient.reset(); }} placeholder="Motivo do merge" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
              {mergeClient.error ? <BusinessNotice tone="danger" message={clientErrorMessage(mergeClient.error)} /> : null}
              <BusinessButton
                label={mergeClient.isError && mergeRequestId.current ? 'Tentar merge com o mesmo comando' : 'Unir cadastros'}
                variant="danger"
                loading={mergeClient.isPending}
                disabled={!duplicateId.trim()}
                onPress={() => Alert.alert('Unir cadastros?', 'Esta ação preservará a origem no histórico e não poderá ser desfeita pelo aplicativo.', [
                  { text: 'Voltar', style: 'cancel' },
                  { text: 'Unir', style: 'destructive', onPress: () => mergeClient.mutate() },
                ])}
              />
            </View>
          ) : null}
        </>
      ) : null}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  form: { gap: businessTheme.spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  input: {
    minHeight: businessTheme.sizing.control,
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: businessTheme.radii.md,
    paddingHorizontal: businessTheme.spacing.md,
    paddingVertical: businessTheme.spacing.sm,
    backgroundColor: businessTheme.colors.surface,
    color: businessTheme.colors.text,
    fontSize: 15,
  },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  candidates: { gap: businessTheme.spacing.xs },
  candidate: { gap: businessTheme.spacing.xxs, paddingHorizontal: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.sm, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surfaceMuted },
  candidateSelected: { borderWidth: 1, borderColor: businessTheme.colors.accent },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  body: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  meta: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  tags: { ...businessTheme.typography.caption, color: businessTheme.colors.accent },
  notesCopy: { ...businessTheme.typography.body, color: businessTheme.colors.text, paddingTop: businessTheme.spacing.sm },
  consentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs },
  consentChip: {
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: businessTheme.radii.md,
    paddingHorizontal: businessTheme.spacing.md,
    paddingVertical: businessTheme.spacing.sm,
    backgroundColor: businessTheme.colors.surface,
  },
  consentChipSelected: {
    borderColor: businessTheme.colors.accent,
    backgroundColor: businessTheme.colors.surfaceMuted,
  },
  consentChipText: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  consentChipTextSelected: { color: businessTheme.colors.accent, fontWeight: '600' },
  linkRow: {
    gap: businessTheme.spacing.xxs,
    paddingVertical: businessTheme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: businessTheme.colors.borderStrong,
  },
});
