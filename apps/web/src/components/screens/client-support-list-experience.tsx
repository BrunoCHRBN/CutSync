import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Headphones, Plus } from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import {
  useClientSupportCapabilities,
  useClientSupportTickets,
} from '../../hooks/use-client-support';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { InlineNotice } from '../ui/InlineNotice';
import {
  ClientSupportPage,
  SupportTicketRow,
} from '../support/client-support-ui';

export const ClientSupportListExperience = () => {
  const router = useRouter();
  const { user } = useAuth();
  const { capabilities, isLoading: loadingCapabilities, error: capabilityError } = (
    useClientSupportCapabilities()
  );
  const { tickets, isLoading, error, refresh } = useClientSupportTickets(user?.id ?? null);
  const canCreate = Boolean(capabilities?.enabled && capabilities.allowNewTickets);

  return (
    <ClientSupportPage
      title="Seus chamados"
      description="Fale diretamente com a equipe CutSync e acompanhe cada atualização sem sair da sua conta."
    >
      <View style={styles.actions}>
        <AppButton
          testID="client-web-support-refresh"
          label="Atualizar"
          variant="secondary"
          onPress={() => { void refresh(); }}
        />
        <AppButton
          testID="client-web-support-new"
          label="Novo chamado"
          icon={<Plus size={16} color={colors.ink} />}
          disabled={!canCreate || loadingCapabilities}
          onPress={() => router.push('/(client)/support/new')}
        />
      </View>

      {capabilityError ? (
        <InlineNotice tone="danger" message={capabilityError} />
      ) : null}
      {!loadingCapabilities && capabilities && !canCreate ? (
        <InlineNotice
          tone={capabilities.enabled ? 'warning' : 'info'}
          title="Abertura temporariamente pausada"
          message={capabilities.maintenanceMessage
            || 'Você ainda pode acompanhar os chamados existentes.'}
        />
      ) : null}
      {error ? <InlineNotice tone="danger" message={error} /> : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={styles.loadingText}>Carregando seus chamados…</Text>
        </View>
      ) : tickets.length ? (
        <View style={styles.list}>
          {tickets.map((ticket) => (
            <SupportTicketRow
              key={ticket.id}
              {...ticket}
              onPress={() => router.push(`/(client)/support/${ticket.id}`)}
            />
          ))}
        </View>
      ) : (
        <AppCard testID="client-web-support-empty" style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Headphones size={22} color={colors.brandPrimary} />
          </View>
          <Text style={styles.emptyTitle}>Nenhum chamado por aqui.</Text>
          <Text style={styles.emptyText}>
            Quando você precisar, abra uma solicitação e acompanhe toda a conversa nesta área.
          </Text>
        </AppCard>
      )}
    </ClientSupportPage>
  );
};

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
  list: { gap: 10 },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSecondarySoft,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 18,
    marginTop: 15,
  },
  emptyText: {
    maxWidth: 480,
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 7,
  },
});
