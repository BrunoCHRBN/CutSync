import { Redirect } from 'expo-router';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function LegacySupportRedirect() {
  return <Redirect href={CLOUD_ROUTES.suporte.root} />;
}
