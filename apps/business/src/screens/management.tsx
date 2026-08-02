import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { businessTheme } from '@/theme/business-theme';

export function BusinessManagementScreen() {
  const router = useRouter();
  const { activeContext, hasCapability } = useBusinessOperational();
  if (activeContext?.operationalRole === 'professional') {
    return <Redirect href="/today" />;
  }

  const readOnly = activeContext?.accessMode === 'read_only';
  const modules = [
    {
      name: 'Clientes',
      description: 'Diretório local, origem, consentimento, vínculo, arquivamento e merge auditado.',
      route: '/(app)/clients' as const,
      enabled: hasCapability('view_clients'),
    },
    {
      name: 'Serviços',
      description: 'Catálogo, duração, preço e disponibilidade operacional.',
      route: null,
      enabled: false,
    },
    {
      name: 'Equipe',
      description: 'Profissionais vinculados, convites e permissões.',
      route: null,
      enabled: false,
    },
    {
      name: 'Jornadas',
      description: 'Escalas, folgas e regras de atendimento.',
      route: null,
      enabled: false,
    },
    {
      name: 'Configurações',
      description: 'Preferências essenciais da unidade ativa.',
      route: null,
      enabled: false,
    },
  ] as const;

  return (
    <BusinessPage testID="business-management-screen">
      <BusinessHeader
        eyebrow="GESTÃO"
        title="Operação da unidade"
        description="Áreas administrativas da unidade ativa."
      />
      <BusinessNotice
        tone={readOnly ? 'warning' : 'neutral'}
        message={readOnly
          ? 'As áreas administrativas permanecem consultáveis, mas alterações estão bloqueadas pelo backend.'
          : 'Mutações de clientes usam RPCs específicas; a autorização é recalculada pelo backend.'}
      />
      <View style={styles.grid}>
        {modules.map((module) => (
          <BusinessCard key={module.name} style={styles.module}>
            <Text selectable style={styles.moduleName}>{module.name}</Text>
            <Text selectable style={styles.moduleDescription}>{module.description}</Text>
            {module.route && module.enabled ? (
              <BusinessButton
                label={`Abrir ${module.name}`}
                variant="secondary"
                onPress={() => router.push(module.route as never)}
              />
            ) : (
              <Text style={styles.moduleStatus}>{readOnly ? 'SOMENTE LEITURA' : 'PRÓXIMO CICLO'}</Text>
            )}
          </BusinessCard>
        ))}
      </View>
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  grid: { gap: businessTheme.spacing.sm },
  module: { gap: businessTheme.spacing.xs },
  moduleName: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  moduleDescription: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  moduleStatus: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
});
