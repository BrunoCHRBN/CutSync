import { Redirect } from 'expo-router';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { BusinessBlockedScreen } from '@/screens/blocked';

export default function BlockedRoute() {
  const { activeContext } = useBusinessOperational();

  if (!activeContext) return <Redirect href="/establishments" />;
  if (activeContext.accessMode !== 'blocked') return <Redirect href="/today" />;

  return <BusinessBlockedScreen />;
}
