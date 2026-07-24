import { Redirect } from 'expo-router';
import { useBusinessSession } from '@/contexts/business-session';

export default function BusinessIndexRoute() {
  const { session, access, loading } = useBusinessSession();
  if (loading) return <Redirect href="/loading" />;
  if (!session) return <Redirect href="/sign-in" />;
  if (!access) return <Redirect href="/loading" />;
  if (access.access_mode !== 'full') return <Redirect href="/restricted" />;
  return <Redirect href="/operation" />;
}
