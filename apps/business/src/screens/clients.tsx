import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useDeferredValue, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

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
  LINK_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
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

export function BusinessClientsScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [includeArchived, setIncludeArchived] = useState(false);
  const clients = useBusinessClients(deferredQuery, { includeArchived });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');
  const requestId = useRef<string | null>(null);
  const canManage = hasCapability('manage_clients') && activeContext?.accessMode === 'full';

  const createClient = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext) throw new BusinessFeatureError('invalid_request');
      requestId.current ??= createMobileRequestId();
      return businessClientsApi.create(activeContext.establishmentId, requestId.current, {
        name,
        phone,
        email,
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        notes,
      });
    },
    onSuccess: async () => {
      if (user && activeContext) {
        await businessQueryClient.invalidateQueries({
          queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'clients'),
        });
      }
      requestId.current = null;
      setName(''); setPhone(''); setEmail(''); setTags(''); setNotes('');
      setCreating(false);
    },
  });

  const updateField = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    requestId.current = null;
    createClient.reset();
  };

  if (!hasCapability('view_clients')) {
    return (
      <BusinessPage testID="business-clients-screen">
        <BusinessHeader eyebrow="CRM DA UNIDADE" title="Clientes" />
        <BusinessNotice tone="danger" message="Seu papel não possui acesso ao diretório desta unidade." />
        <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      </BusinessPage>
    );
  }

  return (
    <BusinessPage testID="business-clients-screen">
      <BusinessHeader
        eyebrow="CRM DA UNIDADE"
        title="Clientes"
        description="Cadastro local, origem e consentimento permanecem isolados por estabelecimento."
        trailing={<BusinessPill label={canManage ? 'Gestão' : 'Leitura'} tone={canManage ? 'success' : 'warning'} />}
      />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      <TextInput
        testID="business-client-search"
        accessibilityLabel="Buscar cliente"
        value={query}
        onChangeText={setQuery}
        placeholder="Nome, contato ou etiqueta"
        placeholderTextColor={businessTheme.colors.textMuted}
        style={styles.input}
      />
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Incluir arquivados</Text>
        <Switch
          testID="business-clients-include-archived"
          value={includeArchived}
          onValueChange={setIncludeArchived}
        />
      </View>

      {canManage ? (
        <BusinessButton
          label={creating ? 'Fechar novo cadastro' : 'Cadastrar cliente'}
          variant="secondary"
          onPress={() => setCreating((value) => !value)}
        />
      ) : null}

      {creating ? (
        <BusinessCard style={styles.form}>
          <BusinessSectionTitle>Novo cadastro local</BusinessSectionTitle>
          <Text style={styles.fieldLabel}>Nome *</Text>
          <TextInput accessibilityLabel="Nome do cliente" value={name} onChangeText={updateField(setName)} placeholder="Nome completo" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
          <Text style={styles.fieldLabel}>Telefone</Text>
          <TextInput accessibilityLabel="Telefone do cliente" value={phone} onChangeText={updateField(setPhone)} placeholder="DDD e número" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="phone-pad" style={styles.input} />
          <Text style={styles.fieldLabel}>E-mail</Text>
          <TextInput accessibilityLabel="E-mail do cliente" value={email} onChangeText={updateField(setEmail)} placeholder="nome@exemplo.com" placeholderTextColor={businessTheme.colors.textMuted} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
          <Text style={styles.fieldLabel}>Etiquetas</Text>
          <TextInput accessibilityLabel="Etiquetas do cliente" value={tags} onChangeText={updateField(setTags)} placeholder="Ex.: recorrente, indicação" placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} />
          <Text style={styles.fieldLabel}>Observações internas</Text>
          <TextInput accessibilityLabel="Observações internas do cliente" value={notes} onChangeText={updateField(setNotes)} placeholder="Informações visíveis apenas para a unidade" placeholderTextColor={businessTheme.colors.textMuted} multiline style={[styles.input, styles.notes]} />
          {createClient.error ? <BusinessNotice tone="danger" message={clientErrorMessage(createClient.error)} /> : null}
          <BusinessButton
            label={createClient.isError && requestId.current ? 'Tentar novamente com o mesmo comando' : 'Salvar cliente'}
            loading={createClient.isPending}
            disabled={!name.trim()}
            onPress={() => createClient.mutate()}
          />
        </BusinessCard>
      ) : null}

      <View style={styles.list}>
        <BusinessSectionTitle>Diretório</BusinessSectionTitle>
        {clients.isLoading ? <BusinessNotice message="Carregando clientes autorizados…" /> : null}
        {clients.error ? (
          <BusinessNotice tone="danger" message={clientErrorMessage(clients.error)} />
        ) : clients.data?.length === 0 ? (
          <BusinessNotice message="Nenhum cliente encontrado." />
        ) : clients.data?.map((client) => (
          <Pressable
            key={client.id}
            accessibilityRole="button"
            onPress={() => router.push(`/(app)/clients/${client.id}` as never)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <BusinessCard>
              <View style={styles.row}>
                <View style={styles.copy}>
                  <Text selectable style={styles.name}>{client.displayName}</Text>
                  <Text selectable style={styles.meta}>{client.phone ?? client.email ?? 'Sem contato cadastrado'}</Text>
                  <Text selectable style={styles.meta}>
                    {SOURCE_LABELS[client.source] ?? client.source}
                    {client.lastAppointmentAt
                      ? ` · Último ${new Date(client.lastAppointmentAt).toLocaleDateString('pt-BR', { timeZone: activeContext?.timezone })}`
                      : ' · Sem atendimentos'}
                  </Text>
                  {client.tags.length ? <Text selectable style={styles.tags}>{client.tags.join(' · ')}</Text> : null}
                  <View style={styles.pills}>
                    <BusinessPill label={STATUS_LABELS[client.status]} tone={statusPillTone(client.status)} />
                    <BusinessPill label={LINK_LABELS[client.linkStatus]} tone={linkPillTone(client.linkStatus)} />
                  </View>
                </View>
              </View>
            </BusinessCard>
          </Pressable>
        ))}
      </View>
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
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
  fieldLabel: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  form: { gap: businessTheme.spacing.sm },
  list: { gap: businessTheme.spacing.sm },
  row: { flexDirection: 'row', gap: businessTheme.spacing.sm, alignItems: 'flex-start' },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  name: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  meta: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  tags: { ...businessTheme.typography.caption, color: businessTheme.colors.accent },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: businessTheme.spacing.xs, marginTop: businessTheme.spacing.xs },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: businessTheme.spacing.md,
  },
  toggleLabel: { ...businessTheme.typography.body, color: businessTheme.colors.text },
  pressed: { opacity: businessTheme.opacity.pressed },
});
