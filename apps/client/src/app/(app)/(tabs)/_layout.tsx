import { sharedBrand } from '@cutsync/brand';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function ClientTabsLayout() {
  return (
    <NativeTabs
      backgroundColor="#FBF8F2"
      iconColor={{ default: '#8A9089', selected: sharedBrand.colors.forest }}
      indicatorColor={sharedBrand.colors.forestSoft}
      labelStyle={{
        default: { color: '#8A9089', fontSize: 11 },
        selected: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '800' },
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
