import { Redirect } from 'expo-router';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function LegacyLiveRedirect() {
  return <Redirect href={CLOUD_ROUTES.operacao.tempoReal} />;
}
