import { useLocalSearchParams } from 'expo-router';

import { SignInScreen } from '@/screens/auth/sign-in-screen';

export default function BusinessSignInRoute() {
  const { redirect } = useLocalSearchParams<{
    redirect?: string | string[];
  }>();

  return <SignInScreen redirect={redirect} />;
}
