import { Redirect, Stack } from 'expo-router';

import { useBusinessOperational } from '@/contexts/business-operational-context';

export default function BusinessAppLayout() {
  const { activeContext } = useBusinessOperational();

  if (!activeContext) return <Redirect href="/establishments" />;
  if (activeContext.accessMode === 'blocked') return <Redirect href="/blocked" />;

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
