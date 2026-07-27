import { useLocalSearchParams } from 'expo-router';

import { InviteSignUpScreen } from '@/screens/auth/invite-sign-up-screen';

export default function BusinessInviteSignUpRoute() {
  const { redirect } = useLocalSearchParams<{
    redirect?: string | string[];
  }>();

  return <InviteSignUpScreen redirect={redirect} />;
}
