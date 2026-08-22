import { Redirect } from 'expo-router';
import React from 'react';

import { useControlAuth } from '@/contexts/control-auth-context';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function CorporateCasesIndexRoute() {
  const { can } = useControlAuth();
  const destination = can('control.cases.fulfill')
    && !can('control.cases.request')
    && !can('control.cases.read')
    && !can('control.cases.triage')
    && !can('control.cases.route')
    && !can('control.cases.manage')
    && !can('control.cases.audit')
    ? CLOUD_ROUTES.chamados.execucao
    : CLOUD_ROUTES.chamados.meus;
  return <Redirect href={destination} />;
}
