import { Redirect } from 'expo-router';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { resolveBusinessEntryState } from '@/features/access/business-access';
import { BusinessLoadingScreen } from '@/screens/business-loading';

export default function BusinessIndexRoute() {
  const { session, isLoading: isSessionLoading } = useBusinessSession();
  const {
    activeContext,
    contexts,
    isLoading: isContextLoading,
  } = useBusinessOperational();

  const entryState = resolveBusinessEntryState({
    sessionLoading: isSessionLoading,
    hasSession: Boolean(session),
    contextLoading: isContextLoading,
    contextCount: contexts.length,
    activeAccessMode: activeContext?.accessMode ?? null,
  });

  switch (entryState) {
    case 'loading_session':
      return <BusinessLoadingScreen message="Restaurando sua sessão…" />;
    case 'signed_out':
      return <Redirect href="/sign-in" />;
    case 'loading_context':
      return <BusinessLoadingScreen message="Confirmando seus vínculos…" />;
    case 'no_access':
      return <Redirect href="/no-access" />;
    case 'select_establishment':
      return <Redirect href="/establishments" />;
    case 'blocked':
      return <Redirect href="/blocked" />;
    case 'operational':
      return <Redirect href="/today" />;
  }
}
