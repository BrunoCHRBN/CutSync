import { Redirect, useRouter } from 'expo-router';
import {
  CalendarOff,
  ChevronRight,
  Clock3,
  Scissors,
  Settings2,
  UserRoundCog,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { businessTheme } from '@/theme/business-theme';

const toTestIdSegment = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-');

export function BusinessManagementScreen() {
  const router = useRouter();
  const { activeContext, hasCapability } = useBusinessOperational();
  if (activeContext?.operationalRole === 'professional') {
    return <Redirect href="/today" />;
  }

  const readOnly = activeContext?.accessMode === 'read_only';
  const modules: {
    name: string;
    description: string;
    route: string | null;
    enabled: boolean;
    icon: LucideIcon;
    comingSoon?: boolean;
  }[] = [
    {
      name: 'Clientes',
      description: 'Contatos, preferências e histórico de visitas.',
      route: '/(app)/clients',
      enabled: hasCapability('view_clients'),
      icon: UsersRound,
    },
    {
      name: 'Serviços',
      description: 'Preços, duração e profissionais disponíveis.',
      route: '/(app)/services',
      enabled: hasCapability('view_services'),
      icon: Scissors,
    },
    {
      name: 'Equipe',
      description: 'Profissionais, convites e permissões.',
      route: '/(app)/team',
      enabled: hasCapability('manage_team'),
      icon: UserRoundCog,
    },
    {
      name: 'Bloqueios',
      description: 'Folgas, pausas e horários indisponíveis.',
      route: '/(app)/schedule-blocks',
      enabled: hasCapability('manage_own_blocks') || hasCapability('manage_team_blocks'),
      icon: CalendarOff,
    },
    {
      name: 'Jornadas',
      description: 'Horários recorrentes de trabalho.',
      route: null,
      enabled: false,
      icon: Clock3,
      comingSoon: true,
    },
    {
      name: 'Configurações',
      description: 'Preferências da rotina do estabelecimento.',
      route: null,
      enabled: false,
      icon: Settings2,
      comingSoon: true,
    },
  ];
  return (
    <BusinessPage testID="business-management-screen">
      <BusinessHeader
        testID="business-management-header"
        eyebrow="GESTÃO"
        title="Organize sua operação"
        description={activeContext?.establishmentName}
        trailing={<BusinessPill testID="business-management-access" label={readOnly ? 'Consulta' : 'Acesso total'} tone={readOnly ? 'warning' : 'success'} />}
      />
      {readOnly ? (
        <BusinessNotice
          testID="business-management-read-only"
          tone="warning"
          message="Você pode consultar estas áreas, mas não fazer alterações."
        />
      ) : null}
      <View testID="business-management-modules" style={styles.list}>
        {modules.map((module) => {
          const Icon = module.icon;
          const canOpen = Boolean(module.route && module.enabled);
          const moduleTestId = `business-management-${toTestIdSegment(module.name)}`;
          return (
            <Pressable
              key={module.name}
              testID={moduleTestId}
              accessibilityRole="button"
              accessibilityLabel={`${module.name}. ${module.description}`}
              accessibilityState={{ disabled: !canOpen }}
              disabled={!canOpen}
              onPress={() => module.route && router.push(module.route as never)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed, !canOpen && !module.comingSoon && styles.rowDisabled]}
            >
              <View style={styles.iconWrap}>
                <Icon color={businessTheme.colors.accentStrong} size={22} strokeWidth={1.8} />
              </View>
              <View style={styles.copy}>
                <Text selectable style={styles.moduleName}>{module.name}</Text>
                <Text selectable style={styles.moduleDescription}>{module.description}</Text>
              </View>
              {module.comingSoon ? (
                <BusinessPill testID={`${moduleTestId}-status`} label="Em breve" />
              ) : canOpen ? (
                <ChevronRight color={businessTheme.colors.textMuted} size={20} />
              ) : (
                <Text style={styles.moduleStatus}>SEM ACESSO</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderColor: businessTheme.colors.border },
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: businessTheme.spacing.md,
    borderBottomWidth: 1,
    borderColor: businessTheme.colors.border,
    paddingVertical: businessTheme.spacing.md,
  },
  rowPressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.99 }] },
  rowDisabled: { opacity: businessTheme.opacity.disabled },
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: businessTheme.radii.md,
    backgroundColor: businessTheme.colors.accentSoft,
  },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  moduleName: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  moduleDescription: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
  moduleStatus: { ...businessTheme.typography.eyebrow, color: businessTheme.colors.textMuted },
});
