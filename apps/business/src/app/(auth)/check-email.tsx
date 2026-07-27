import { useLocalSearchParams } from 'expo-router';

import { CheckEmailScreen } from '@/screens/auth/check-email-screen';

export default function BusinessCheckEmailRoute() {
  const { redirect } = useLocalSearchParams<{
    redirect?: string | string[];
  }>();

  return <CheckEmailScreen redirect={redirect} />;
}
