import { Redirect } from 'expo-router';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function LegacyBillingPlansRedirect() {
  return <Redirect href={CLOUD_ROUTES.financeiro.assinaturas} />;
}
