import { sharedBrand } from '@cutsync/brand';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

export default function ClientTabsLayout() {
  return (
    <NativeTabs
      backgroundColor="#FBFAF6"
      iconColor={{ default: '#737970', selected: sharedBrand.colors.forest }}
      indicatorColor="#DDE7DD"
      labelStyle={{
        default: { color: '#737970', fontSize: 11 },
        selected: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '700' },
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
