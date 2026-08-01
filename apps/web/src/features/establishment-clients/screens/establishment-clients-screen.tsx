import { createMobileRequestId } from '@cutsync/domain';
import { useRouter } from 'expo-router';
import { ContactRound } from 'lucide-react-native';
import React, { useDeferredValue, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AdminShell } from '../../../components/layout/AdminShell';
import { AppButton } from '../../../components/ui/AppButton';
import { AppCard } from '../../../components/ui/AppCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { InlineNotice } from '../../../components/ui/InlineNotice';
import { SectionHeading } from '../../../components/ui/SectionHeading';
import { useAuth } from '../../../contexts/AuthContext';
import { useOperationalContext } from '../../../contexts/operational-context';
import { useEstablishment } from '../../../hooks/useEstablishment';
import { colors, radii, typeScale } from '../../../theme/tokens';
import { ClientFormFields } from '../components/client-form-fields';
import { ClientMetaPills } from '../components/client-meta';
import { useEstablishmentClients } from '../hooks/use-establishment-clients';
import {
  EstablishmentClientApiError,
  establishmentClientsApi,
} from '../services/establishment-clients-api';
import type { EstablishmentClientFormValues } from '../types/establishment-client';

const emptyForm = (): EstablishmentClientFormValues => ({
  name: '',
  phone: '',
  email: '',
  tags: '',
  notes: '',
  marketingConsentStatus: 'unknown',
});

const toWriteValues = (values: EstablishmentClientFormValues) => ({
  name: values.name,
  phone: values.phone,
  email: values.email,
  tags: values.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
  notes: values.notes,
});

export const EstablishmentClientsScreen = () => {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { activeEstablishmentId, activeContext } = useOperationalContext();
  const { establishment } = useEstablishment(activeEstablishmentId);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const requestId = useRef<string | null>(null);
  const directory = useEstablishmentClients(
    activeEstablishmentId,
    deferredQuery,
    includeArchived,
  );

  const createClient = async () => {
    if (!activeEstablishmentId || !form.name.trim()) return;
    setSaving(true);
    setNotice(null);
    requestId.current ??= createMobileRequestId();
    try {
      await establishmentClientsApi.create(
        activeEstablishmentId,
        requestId.current,
        toWriteValues(form),
      );
      requestId.current = null;
      setForm(emptyForm());
      setCreating(false);
      setNotice({ tone: 'success', message: 'Cliente cadastrado nesta unidade.' });
      await directory.refresh();
    } catch (cause) {
      setNotice({
        tone: 'danger',
        message: cause instanceof EstablishmentClientApiError
          ? cause.message
          : 'Não foi possível cadastrar o cliente.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell
      testID="admin-clients-screen"
      activeRoute="clients"
      shopName={establishment?.name || activeContext?.establishmentName || 'Sua barbearia'}
      userName={profile?.name}
      onSignOut={signOut}
    >
      <SectionHeading
        testID="clients-heading"
        eyebrow="CRM DA UNIDADE"
        title="Clientes"
        description="Cadastro local, consentimento e vínculo com conta CutSync ficam isolados por estabelecimento."
        action={(
          <AppButton
            label={creating ? 'Fechar cadastro' : 'Novo cliente'}
            variant="admin"
            onPress={() => {
              setCreating((value) => !value);
              setNotice(null);
              requestId.current = null;
            }}
          />
        )}
      />

      {notice ? <InlineNotice tone={notice.tone} message={notice.message} /> : null}

      <AppCard style={styles.toolbar}>
        <TextInput
          testID="clients-search"
          accessibilityLabel="Buscar cliente"
          value={query}
          onChangeText={setQuery}
          placeholder="Nome, telefone, e-mail ou etiqueta"
          placeholderTextColor={colors.textMuted}
          style={styles.search}
        />
        <View style={styles.archiveToggle}>
          <Text style={styles.toggleLabel}>Incluir arquivados</Text>
          <Switch
            testID="clients-include-archived"
            value={includeArchived}
            onValueChange={setIncludeArchived}
          />
        </View>
      </AppCard>

      {creating ? (
        <AppCard style={styles.createCard}>
          <Text style={styles.cardTitle}>Novo cadastro local</Text>
          <ClientFormFields
            values={form}
            onChange={(next) => {
              setForm(next);
              requestId.current = null;
            }}
          />
          <AppButton
            label={requestId.current && notice?.tone === 'danger'
              ? 'Tentar novamente com o mesmo comando'
              : 'Salvar cliente'}
            variant="admin"
            loading={saving}
            disabled={!form.name.trim()}
            onPress={() => { void createClient(); }}
          />
        </AppCard>
      ) : null}

      {directory.loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.muted}>Carregando diretório…</Text>
        </View>
      ) : null}

      {directory.error ? (
        <InlineNotice
          tone="danger"
          message={directory.error}
          action={<AppButton label="Tentar de novo" variant="ghost" size="sm" onPress={() => { void directory.refresh(); }} />}
        />
      ) : null}

      {!directory.loading && !directory.error && directory.clients.length === 0 ? (
        <EmptyState
          testID="clients-empty"
          icon={<ContactRound color={colors.brand} size={22} />}
          title="Nenhum cliente encontrado"
          description="Cadastre um cliente local ou ajuste a busca. Contatos de outras unidades não aparecem aqui."
        />
      ) : null}

      <View style={styles.list}>
        {directory.clients.map((client) => (
          <Pressable
            key={client.id}
            testID={`client-row-${client.id}`}
            accessibilityRole="button"
            onPress={() => router.push(`/(admin)/clients/${client.id}` as never)}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <AppCard>
              <View style={styles.rowHeader}>
                <Text style={styles.name}>{client.displayName}</Text>
                <Text style={styles.muted}>
                  {client.lastAppointmentAt
                    ? `Último atendimento ${new Date(client.lastAppointmentAt).toLocaleDateString('pt-BR')}`
                    : 'Sem atendimentos'}
                </Text>
              </View>
              <Text style={styles.contact}>
                {[client.phone, client.email].filter(Boolean).join(' · ') || 'Sem contato'}
              </Text>
              <ClientMetaPills client={client} />
            </AppCard>
          </Pressable>
        ))}
      </View>

      {directory.hasMore ? (
        <AppButton
          label={directory.loadingMore ? 'Carregando…' : 'Carregar mais'}
          variant="secondary"
          loading={directory.loadingMore}
          onPress={() => { void directory.loadMore(); }}
        />
      ) : null}
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  toolbar: { gap: 14, marginTop: 18 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    ...typeScale.body,
  },
  archiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: { ...typeScale.body, color: colors.text },
  createCard: { gap: 14, marginTop: 16 },
  cardTitle: { ...typeScale.cardTitle, color: colors.text },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  muted: { ...typeScale.small, color: colors.textMuted },
  list: { gap: 12, marginTop: 16 },
  pressed: { opacity: 0.88 },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  name: { ...typeScale.cardTitle, color: colors.text },
  contact: { ...typeScale.body, color: colors.textMuted, marginBottom: 10 },
});
