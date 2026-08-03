import { Redirect, Stack, usePathname } from 'expo-router';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { resolveBusinessDeepLink } from '@/features/links/business-deep-links';

export default function BusinessAppLayout() {
  const { isLoading: isSessionLoading, session } = useBusinessSession();
  const { activeContext, contexts, isLoading: isOperationalLoading } = useBusinessOperational();
  const pathname = usePathname();
  const isBootstrapping = isSessionLoading || Boolean(session && isOperationalLoading);
  const routeLink = resolveBusinessDeepLink(pathname);
  const canResolveAppointmentRoute = Boolean(
    session
    && routeLink?.kind === 'appointment'
    && contexts.some((context) => context.accessMode !== 'blocked'),
  );

  if (!isBootstrapping && !activeContext && !canResolveAppointmentRoute) {
    return <Redirect href="/establishments" />;
  }
  if (
    !isBootstrapping
    && activeContext?.accessMode === 'blocked'
    && !canResolveAppointmentRoute
  ) {
    return <Redirect href="/blocked" />;
  }

  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
