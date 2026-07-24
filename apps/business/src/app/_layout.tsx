import { Stack } from 'expo-router';
import { BusinessSessionProvider } from '@/contexts/business-session';

export default function BusinessRootLayout() {
  return (
    <BusinessSessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </BusinessSessionProvider>
  );
}
