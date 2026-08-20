import { Redirect, Stack } from 'expo-router';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { BusinessLoadingScreen } from '@/screens/business-loading';

export default function BusinessAppLayout() {
  const { isLoading: isSessionLoading } = useBusinessSession();
  const { activeContext, isLoading: isContextLoading } = useBusinessOperational();

  if (isSessionLoading || isContextLoading) {
    return <BusinessLoadingScreen message="Confirmando seu contexto…" />;
  }
  if (!activeContext) return <Redirect href="/establishments" />;
  if (activeContext.accessMode === 'blocked') return <Redirect href="/blocked" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
