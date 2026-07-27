import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { businessTheme } from '@/theme/business-theme';

const roleLabel = {
  owner: 'Proprietário',
  admin: 'Administrador',
  professional: 'Profissional',
} as const;

export function EstablishmentSelectionScreen() {
  const router = useRouter();
  const {
    contexts,
    activeEstablishmentId,
    isLoading,
    isRefreshing,
    error,
    selectEstablishment,
    refreshContexts,
  } = useBusinessOperational();

  const choose = async (establishmentId: string) => {
    if (await selectEstablishment(establishmentId)) router.replace('/');
  };

  return (
    <BusinessPage testID="business-establishment-selection-screen">
      <BusinessHeader
        eyebrow="CONTEXTO OPERACIONAL"
        title="Escolha o estabelecimento"
        description="Cada unidade mantém agenda, permissões e acesso isolados."
      />

      {error ? <BusinessNotice tone="danger" message={error} /> : null}

      {isLoading ? (
        <ActivityIndicator color={businessTheme.colors.accent} />
      ) : contexts.length === 0 ? (
        <BusinessNotice message="Nenhum vínculo operacional ativo foi encontrado." />
      ) : (
        <View style={styles.list}>
          {contexts.map((context) => {
            const selected = context.establishmentId === activeEstablishmentId;
            const accessTone = context.accessMode === 'full'
              ? 'success'
              : context.accessMode === 'read_only'
                ? 'warning'
                : 'danger';
            const accessLabel = context.accessMode === 'full'
              ? 'Completo'
              : context.accessMode === 'read_only'
                ? 'Leitura'
                : 'Bloqueado';
            return (
              <Pressable
                key={context.establishmentId}
                testID={`business-establishment-${context.establishmentId}`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => void choose(context.establishmentId)}
              >
                <BusinessCard style={[styles.contextCard, selected ? styles.contextCardSelected : undefined]}>
                  <View style={styles.contextCopy}>
                    <Text selectable style={styles.contextName}>{context.establishmentName}</Text>
                    <Text selectable style={styles.contextMeta}>
                      {roleLabel[context.operationalRole]} · {context.timezone}
                    </Text>
                  </View>
                  <BusinessPill label={accessLabel} tone={accessTone} />
                </BusinessCard>
              </Pressable>
            );
          })}
        </View>
      )}

      <BusinessButton
        label="Atualizar vínculos"
        variant="secondary"
        loading={isRefreshing}
        onPress={() => void refreshContexts()}
      />
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  list: { gap: businessTheme.spacing.sm },
  contextCard: { flexDirection: 'row', alignItems: 'center' },
  contextCardSelected: { borderColor: businessTheme.colors.accent },
  contextCopy: { flex: 1, minWidth: 0, gap: 3 },
  contextName: { color: businessTheme.colors.text, fontSize: 15, fontWeight: '800' },
  contextMeta: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
});
