import { Redirect } from 'expo-router';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function LegacyDataQualityRedirect() {
  return <Redirect href={CLOUD_ROUTES.operacao.saudeDosDados} />;
}
