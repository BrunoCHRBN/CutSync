import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  BusinessCard,
  BusinessButton,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
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
      description: 'Diretório local, etiquetas, observações, histórico e merge auditado.',
      route: '/(app)/clients',
      enabled: hasCapability('view_clients'),
    },
    {
      name: 'Serviços',
      description: 'Catálogo, duração, preço, ordem e profissionais associados.',
      route: '/(app)/services',
      enabled: hasCapability('view_services'),
    },
    {
      name: 'Equipe',
      description: 'Membros, convites, acessos e comissão como repasse projetado.',
      route: '/(app)/team',
      enabled: hasCapability('manage_team'),
    },
    {
      name: 'Bloqueios',
      description: 'Intervalos, folgas, bloqueios e dias inteiros.',
      route: '/(app)/schedule-blocks',
      enabled: hasCapability('manage_own_blocks') || hasCapability('manage_team_blocks'),
    },
    {
      name: 'Jornadas',
      description: 'Jornadas recorrentes permanecem no próximo ciclo.',
      route: null,
      enabled: false,
    },
    {
      name: 'Configurações',
      description: 'Configurações operacionais recorrentes permanecem no próximo ciclo.',
      route: null,
      enabled: false,
    },
  ] as const;
  return (
    <BusinessPage testID="business-management-screen">
      <BusinessHeader
        eyebrow="GESTÃO OPERACIONAL"
        title="Gestão"
        description={activeContext?.establishmentName}
        trailing={<BusinessPill label={readOnly ? 'Leitura' : 'Acesso completo'} tone={readOnly ? 'warning' : 'success'} />}
      />
      <BusinessNotice
        tone={readOnly ? 'warning' : 'neutral'}
        message={readOnly
          ? 'As áreas administrativas permanecem consultáveis, mas alterações estão bloqueadas pelo backend.'
          : 'As mutações são enviadas por RPCs específicas e a autorização é recalculada pelo backend.'}
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
  module: { minHeight: 112, justifyContent: 'center' },
  moduleName: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  moduleDescription: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  moduleStatus: { ...businessTheme.typography.eyebrow, color: businessTheme.colors.textMuted, paddingTop: 4 },
});
