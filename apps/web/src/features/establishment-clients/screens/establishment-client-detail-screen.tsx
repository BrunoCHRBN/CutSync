import { createMobileRequestId } from '@cutsync/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AdminShell } from '../../../components/layout/AdminShell';
import { AppButton } from '../../../components/ui/AppButton';
import { AppCard } from '../../../components/ui/AppCard';
import { InlineNotice } from '../../../components/ui/InlineNotice';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { useAuth } from '../../../contexts/AuthContext';
import { useOperationalContext } from '../../../contexts/operational-context';
import { useEstablishment } from '../../../hooks/useEstablishment';
import { colors, radii, typeScale } from '../../../theme/tokens';
import { ClientFormFields } from '../components/client-form-fields';
import { ClientMetaPills } from '../components/client-meta';
import { useEstablishmentClientDetail } from '../hooks/use-establishment-client-detail';
import { useEstablishmentClients } from '../hooks/use-establishment-clients';
import { suggestDuplicateClients } from '../services/duplicate-suggestions';
import {
  EstablishmentClientApiError,
  establishmentClientsApi,
} from '../services/establishment-clients-api';
import {
  CONFIDENCE_LABELS,
  type EstablishmentClientFormValues,
} from '../types/establishment-client';

const toForm = (client: {
  displayName: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  notes: string | null;
  marketingConsentStatus: EstablishmentClientFormValues['marketingConsentStatus'];
}): EstablishmentClientFormValues => ({
  name: client.displayName,
  phone: client.phone ?? '',
  email: client.email ?? '',
  tags: client.tags.join(', '),
  notes: client.notes ?? '',
  marketingConsentStatus: client.marketingConsentStatus,
});

const toWriteValues = (values: EstablishmentClientFormValues) => ({
  name: values.name,
  phone: values.phone,
  email: values.email,
  tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  notes: values.notes,
  marketingConsentStatus: values.marketingConsentStatus,
});

export const EstablishmentClientDetailScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const clientId = typeof id === 'string' ? id : '';
  const { profile, signOut } = useAuth();
  const { activeEstablishmentId, activeContext } = useOperationalContext();
  const { establishment } = useEstablishment(activeEstablishmentId);
  const detail = useEstablishmentClientDetail(activeEstablishmentId, clientId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EstablishmentClientFormValues | null>(null);
  const [duplicateQuery, setDuplicateQuery] = useState('');
  const deferredDuplicateQuery = useDeferredValue(duplicateQuery);
  const [selectedDuplicateId, setSelectedDuplicateId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'warning'; message: string } | null>(null);
  const updateRequestId = useRef<string | null>(null);
  const archiveRequestId = useRef<string | null>(null);
  const restoreRequestId = useRef<string | null>(null);
  const mergeRequestId = useRef<string | null>(null);
  const directory = useEstablishmentClients(
    activeEstablishmentId,
    deferredDuplicateQuery || detail.client?.displayName || '',
    true,
  );

  useEffect(() => {
    if (!detail.client || editing) return;
    setForm(toForm(detail.client));
  }, [detail.client, editing]);

  const suggestions = useMemo(() => {
    if (!detail.client) return [];
    return suggestDuplicateClients(detail.client, directory.clients);
  }, [detail.client, directory.clients]);

  const run = async (
    kind: string,
    action: () => Promise<unknown>,
    successMessage: string,
    onSuccess?: () => void,
  ) => {
    if (!activeEstablishmentId) return;
    setBusy(kind);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: 'success', message: successMessage });
      onSuccess?.();
      await detail.refresh();
    } catch (cause) {
      setNotice({
        tone: 'danger',
        message: cause instanceof EstablishmentClientApiError
          ? cause.message
          : 'Não foi possível concluir a operação.',
      });
    } finally {
      setBusy(null);
    }
  };

  const saveEdits = async () => {
    if (!activeEstablishmentId || !form) return;
    updateRequestId.current ??= createMobileRequestId();
    await run(
      'update',
      () => establishmentClientsApi.update(
        activeEstablishmentId,
        clientId,
        updateRequestId.current!,
        toWriteValues(form),
      ),
      'Cadastro atualizado.',
      () => {
        updateRequestId.current = null;
        setEditing(false);
      },
    );
  };

  const confirmArchive = () => {
    Alert.alert(
      'Arquivar cliente',
      'O cliente sai da busca padrão. Agendamentos futuros ativos bloqueiam o arquivamento.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Arquivar',
          style: 'destructive',
          onPress: () => {
            if (!activeEstablishmentId) return;
            archiveRequestId.current ??= createMobileRequestId();
            void run(
              'archive',
              () => establishmentClientsApi.archive(
                activeEstablishmentId,
                clientId,
                archiveRequestId.current!,
              ),
              'Cliente arquivado.',
              () => { archiveRequestId.current = null; },
            );
          },
        },
      ],
    );
  };

  const restoreClient = async () => {
    if (!activeEstablishmentId) return;
    restoreRequestId.current ??= createMobileRequestId();
    await run(
      'restore',
      () => establishmentClientsApi.restore(
        activeEstablishmentId,
        clientId,
        restoreRequestId.current!,
      ),
      'Cliente restaurado.',
      () => { restoreRequestId.current = null; },
    );
  };

  const confirmMerge = () => {
    if (!selectedDuplicateId) {
      setNotice({ tone: 'warning', message: 'Selecione explicitamente o cadastro duplicado.' });
      return;
    }
    Alert.alert(
      'Unificar cadastros',
      'Este cadastro será preservado. O duplicado deixa de existir e o histórico migra para cá. Consentimento fica com a opção mais restritiva.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Unificar',
          style: 'destructive',
          onPress: () => {
            if (!activeEstablishmentId) return;
            mergeRequestId.current ??= createMobileRequestId();
            void run(
              'merge',
              () => establishmentClientsApi.merge({
                establishmentId: activeEstablishmentId,
                survivorClientId: clientId,
                duplicateClientId: selectedDuplicateId,
                requestId: mergeRequestId.current!,
                reason: mergeReason,
              }),
              'Cadastros unificados.',
              () => {
                mergeRequestId.current = null;
                setSelectedDuplicateId('');
                setMergeReason('');
                setDuplicateQuery('');
              },
            );
          },
        },
      ],
    );
  };

  return (
    <AdminShell
      testID="admin-client-detail-screen"
      activeRoute="clients"
      shopName={establishment?.name || activeContext?.establishmentName || 'Sua barbearia'}
      userName={profile?.name}
      onSignOut={signOut}
    >
      <SectionHeading
        testID="client-detail-heading"
        eyebrow="CLIENTE DA UNIDADE"
        title={detail.client?.displayName ?? 'Cadastro'}
        description="Histórico, vínculo e unificação ficam restritos a este estabelecimento."
        action={<AppButton label="Voltar à lista" variant="ghost" onPress={() => router.push('/(admin)/clients' as never)} />}
      />

      {notice ? <InlineNotice tone={notice.tone} message={notice.message} /> : null}

      {detail.loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.muted}>Carregando cadastro…</Text>
        </View>
      ) : null}

      {detail.error ? (
        <InlineNotice
          tone="danger"
          message={detail.error}
          action={<AppButton label="Tentar de novo" variant="ghost" size="sm" onPress={() => { void detail.refresh(); }} />}
        />
      ) : null}

      {detail.client && form ? (
        <>
          <AppCard style={styles.block}>
            {editing ? (
              <>
                <ClientFormFields
                  values={form}
                  showConsent
                  onChange={(next) => {
                    setForm(next);
                    updateRequestId.current = null;
                  }}
                />
                <View style={styles.actions}>
                  <AppButton
                    label={updateRequestId.current && notice?.tone === 'danger'
                      ? 'Tentar novamente com o mesmo comando'
                      : 'Salvar alterações'}
                    variant="admin"
                    loading={busy === 'update'}
                    onPress={() => { void saveEdits(); }}
                  />
                  <AppButton label="Cancelar" variant="ghost" onPress={() => setEditing(false)} />
                </View>
              </>
            ) : (
              <>
                <ClientMetaPills client={detail.client} />
                <Text style={styles.contact}>{detail.client.phone ?? 'Sem telefone'}</Text>
                <Text style={styles.contact}>{detail.client.email ?? 'Sem e-mail'}</Text>
                {detail.client.tags.length ? (
                  <Text style={styles.tags}>{detail.client.tags.join(' · ')}</Text>
                ) : null}
                {detail.client.notes ? <Text style={styles.notes}>{detail.client.notes}</Text> : null}
                <Text style={styles.muted}>
                  Primeiro atendimento:{' '}
                  {detail.client.firstAppointmentAt
                    ? new Date(detail.client.firstAppointmentAt).toLocaleDateString('pt-BR')
                    : '—'}
                  {' · '}
                  Último:{' '}
                  {detail.client.lastAppointmentAt
                    ? new Date(detail.client.lastAppointmentAt).toLocaleDateString('pt-BR')
                    : '—'}
                </Text>
                {detail.client.status === 'active' ? (
                  <View style={styles.actions}>
                    <AppButton label="Editar" variant="secondary" onPress={() => setEditing(true)} />
                    <AppButton
                      label="Arquivar"
                      variant="danger"
                      loading={busy === 'archive'}
                      onPress={confirmArchive}
                    />
                  </View>
                ) : null}
                {detail.client.status === 'archived' ? (
                  <AppButton
                    label="Restaurar cliente"
                    variant="admin"
                    loading={busy === 'restore'}
                    onPress={() => { void restoreClient(); }}
                  />
                ) : null}
              </>
            )}
          </AppCard>

          <AppCard style={styles.block}>
            <Text style={styles.sectionTitle}>Vínculo com conta CutSync</Text>
            {detail.client.links.length === 0 ? (
              <Text style={styles.muted}>Nenhum vínculo registrado para este cadastro.</Text>
            ) : detail.client.links.map((link) => (
              <View key={link.id} style={styles.linkRow}>
                <Text style={styles.contact}>Perfil {link.profileId.slice(0, 8)}…</Text>
                <Text style={styles.muted}>{link.status} · {link.matchKind}</Text>
              </View>
            ))}
          </AppCard>

          <AppCard style={styles.block}>
            <Text style={styles.sectionTitle}>Histórico de atendimentos</Text>
            {detail.client.appointments.length === 0 ? (
              <Text style={styles.muted}>Nenhum atendimento vinculado.</Text>
            ) : detail.client.appointments.map((appointment) => (
              <View key={appointment.appointmentId} style={styles.appointmentRow}>
                <Text style={styles.contact}>{appointment.serviceName}</Text>
                <Text style={styles.muted}>
                  {appointment.professionalName}
                  {' · '}
                  {new Date(appointment.startsAt).toLocaleString('pt-BR')}
                  {' · '}
                  {appointment.status}
                </Text>
              </View>
            ))}
          </AppCard>

          {detail.client.status === 'active' ? (
            <AppCard style={styles.block}>
              <Text style={styles.sectionTitle}>Sugestões de duplicidade</Text>
              <InlineNotice
                tone="warning"
                message="Sugestões não unificam sozinhas. Confirme o duplicado e o motivo antes de prosseguir."
              />
              <TextInput
                testID="client-duplicate-search"
                value={duplicateQuery}
                onChangeText={(value) => {
                  setDuplicateQuery(value);
                  setSelectedDuplicateId('');
                  mergeRequestId.current = null;
                }}
                placeholder="Buscar outro cadastro por nome ou contato"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
              />
              {directory.loading ? <Text style={styles.muted}>Buscando candidatos…</Text> : null}
              {suggestions.length === 0 && !directory.loading ? (
                <Text style={styles.muted}>Nenhuma sugestão com o critério atual.</Text>
              ) : null}
              {suggestions.map((suggestion) => {
                const selected = selectedDuplicateId === suggestion.client.id;
                return (
                  <Pressable
                    key={suggestion.client.id}
                    testID={`duplicate-candidate-${suggestion.client.id}`}
                    onPress={() => {
                      setSelectedDuplicateId(suggestion.client.id);
                      mergeRequestId.current = null;
                    }}
                    style={[styles.suggestion, selected && styles.suggestionSelected]}
                  >
                    <Text style={styles.contact}>{suggestion.client.displayName}</Text>
                    <Text style={styles.muted}>
                      Confiança {CONFIDENCE_LABELS[suggestion.confidence]} · {suggestion.reason}
                    </Text>
                    <Text style={styles.muted}>
                      {[suggestion.client.phone, suggestion.client.email].filter(Boolean).join(' · ') || 'Sem contato'}
                    </Text>
                  </Pressable>
                );
              })}
              <TextInput
                testID="client-merge-reason"
                value={mergeReason}
                onChangeText={(value) => {
                  setMergeReason(value);
                  mergeRequestId.current = null;
                }}
                placeholder="Motivo da unificação (opcional)"
                placeholderTextColor={colors.textMuted}
                style={styles.search}
              />
              <AppButton
                label={mergeRequestId.current && notice?.tone === 'danger'
                  ? 'Tentar unificação com o mesmo comando'
                  : 'Unificar com o selecionado'}
                variant="danger"
                loading={busy === 'merge'}
                disabled={!selectedDuplicateId}
                onPress={confirmMerge}
              />
            </AppCard>
          ) : null}
        </>
      ) : null}
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  loading: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  muted: { ...typeScale.small, color: colors.textMuted },
  block: { gap: 12, marginTop: 16 },
  sectionTitle: { ...typeScale.cardTitle, color: colors.text },
  contact: { ...typeScale.body, color: colors.text },
  tags: { ...typeScale.small, color: colors.brand },
  notes: { ...typeScale.body, color: colors.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  linkRow: { gap: 2, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  appointmentRow: { gap: 2, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    ...typeScale.body,
  },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    padding: 12,
    gap: 4,
    backgroundColor: colors.canvasSoft,
  },
  suggestionSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
});
