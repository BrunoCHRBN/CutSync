import { Redirect } from 'expo-router';
import React from 'react';

import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCorporateCasesLandingRoute } from '@/navigation/cloud-route-access';

export default function CorporateCasesIndexRoute() {
  const { can } = useControlAuth();
  const destination = resolveCorporateCasesLandingRoute(can);
  return <Redirect href={destination} />;
}
