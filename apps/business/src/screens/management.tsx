import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import {
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { businessTheme } from '@/theme/business-theme';

const modules = [
  { name: 'Serviços', description: 'Catálogo, duração, preço e disponibilidade operacional.' },
  { name: 'Equipe', description: 'Profissionais vinculados, convites e permissões.' },
  { name: 'Jornadas', description: 'Escalas, folgas e regras de atendimento.' },
  { name: 'Configurações', description: 'Preferências essenciais da unidade ativa.' },
] as const;

export function BusinessManagementScreen() {
  const { activeContext } = useBusinessOperational();
  if (activeContext?.operationalRole === 'professional') {
    return <Redirect href="/today" />;
  }

  const readOnly = activeContext?.accessMode === 'read_only';
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
          : 'A estrutura administrativa está pronta. Os fluxos completos entram na fatia de Serviços e equipe.'}
      />
      <View style={styles.grid}>
        {modules.map((module) => (
          <BusinessCard key={module.name} style={styles.module}>
            <Text selectable style={styles.moduleName}>{module.name}</Text>
            <Text selectable style={styles.moduleDescription}>{module.description}</Text>
            <Text style={styles.moduleStatus}>{readOnly ? 'SOMENTE LEITURA' : 'FUNDAÇÃO DISPONÍVEL'}</Text>
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
