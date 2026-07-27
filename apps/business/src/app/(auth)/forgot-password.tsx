import { useLocalSearchParams } from 'expo-router';

import { ForgotPasswordScreen } from '@/screens/auth/forgot-password-screen';

export default function BusinessForgotPasswordRoute() {
  const { redirect } = useLocalSearchParams<{
    redirect?: string | string[];
  }>();

  return <ForgotPasswordScreen redirect={redirect} />;
}
