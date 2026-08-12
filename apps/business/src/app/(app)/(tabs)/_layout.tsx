import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import {
  hasBusinessDecisionsNavigation,
  hasBusinessManagementNavigation,
} from '@/features/access/business-access';
import { businessTheme } from '@/theme/business-theme';

export default function BusinessTabsLayout() {
  const { activeContext } = useBusinessOperational();
  const canManage = hasBusinessManagementNavigation(activeContext?.capabilities);
  const canViewDecisions = hasBusinessDecisionsNavigation(activeContext?.capabilities);

  return (
    <NativeTabs
      key={`${activeContext?.establishmentId}:${activeContext?.capabilities.join(',')}`}
      backgroundColor={businessTheme.colors.canvasRaised}
      badgeBackgroundColor={businessTheme.colors.danger}
      iconColor={{
        default: businessTheme.colors.textMuted,
        selected: businessTheme.colors.accentStrong,
      }}
      indicatorColor={businessTheme.colors.accentSoft}
      labelStyle={{
        default: {
          color: businessTheme.colors.textMuted,
          fontSize: 12,
          fontWeight: '700',
        },
        selected: {
          color: businessTheme.colors.accentStrong,
          fontSize: 12,
          fontWeight: '800',
        },
      }}
      minimizeBehavior="onScrollDown"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="today">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bolt', selected: 'bolt.fill' }}
          md="today"
        />
        <NativeTabs.Trigger.Label>Hoje</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="agenda">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'calendar', selected: 'calendar.badge.clock' }}
          md="calendar_month"
        />
        <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="decisions" hidden={!canViewDecisions}>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'checklist', selected: 'checklist.checked' }}
          md="rule"
        />
        <NativeTabs.Trigger.Label>Decisões</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="management" hidden={!canManage}>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="dashboard"
        />
        <NativeTabs.Trigger.Label>Gestão</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md="account_circle"
        />
        <NativeTabs.Trigger.Label>Conta</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
