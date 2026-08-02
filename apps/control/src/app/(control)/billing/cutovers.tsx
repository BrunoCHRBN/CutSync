import { Redirect } from 'expo-router';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function LegacyBillingCutoversRedirect() {
  return <Redirect href={CLOUD_ROUTES.financeiro.conciliacao} />;
}
