import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { clientTheme } from '@/theme/client-theme';

export default function ClientTabsLayout() {
  return (
    <NativeTabs
      backgroundColor={clientTheme.colors.canvas}
      iconColor={{ default: clientTheme.colors.inkMuted, selected: clientTheme.colors.forest }}
      indicatorColor={clientTheme.colors.forestSoft}
      labelStyle={{
        default: { color: clientTheme.colors.inkMuted, fontSize: 11 },
        selected: { color: clientTheme.colors.forest, fontSize: 11, fontWeight: '800' },
      }}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
        <NativeTabs.Trigger.Label>Descobrir</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="appointments">
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
        <NativeTabs.Trigger.Label>Agenda</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
        <NativeTabs.Trigger.Label>Conta</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
