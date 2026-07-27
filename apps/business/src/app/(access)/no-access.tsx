import { Redirect } from 'expo-router';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { BusinessNoAccessScreen } from '@/screens/no-access';

export default function NoAccessRoute() {
  const { contexts, isLoading } = useBusinessOperational();

  if (!isLoading && contexts.length > 0) return <Redirect href="/" />;

  return <BusinessNoAccessScreen />;
}
