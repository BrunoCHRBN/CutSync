import { useLocalSearchParams } from 'expo-router';

import { InviteScreen } from '@/screens/auth/invite-screen';

export default function BusinessInviteRoute() {
  const { token } = useLocalSearchParams<{
    token?: string | string[];
  }>();

  return <InviteScreen token={token} />;
}
