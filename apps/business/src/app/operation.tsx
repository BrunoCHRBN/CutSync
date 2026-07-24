import { Redirect } from 'expo-router';
import { useBusinessSession } from '@/contexts/business-session';
import { BusinessHomeScreen } from '@/screens/home';

export default function OperationRoute() {
  const { session, access } = useBusinessSession();
  if (!session) return <Redirect href="/sign-in" />;
  if (access?.access_mode !== 'full') return <Redirect href="/restricted" />;
  return <BusinessHomeScreen />;
}
