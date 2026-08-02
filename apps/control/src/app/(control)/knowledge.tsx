import { Redirect } from 'expo-router';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function LegacyKnowledgeRedirect() {
  return <Redirect href={CLOUD_ROUTES.gsp.conhecimento} />;
}
