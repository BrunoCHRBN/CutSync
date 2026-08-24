import { Redirect, Slot, usePathname, useRouter } from 'expo-router';
import React from 'react';

import { CloudShell } from '@/components/cloud/cloud-shell';
import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveProtectedLayoutDecision } from '@/navigation/cloud-auth-gate';
import { canAccessCloudRoute, resolveDefaultCloudRoute } from '@/navigation/cloud-route-access';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function CloudProtectedLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, message, retry, can } = useControlAuth();
  const decision = resolveProtectedLayoutDecision(status);

  if (decision.kind === 'loading') {
    return <ControlState loading message="Preparando o ambiente privado..." />;
  }

  if (decision.kind === 'redirect') {
    return <Redirect href={decision.href} />;
  }

  if (decision.kind === 'recoverable') {
    return (
      <ControlState
        title={decision.title}
        message={message || decision.message}
        actionLabel="Tentar novamente"
        onAction={() => { void retry(); }}
      />
    );
  }

  const routeAccess = canAccessCloudRoute(pathname, can);
  if (routeAccess === false) {
    const fallback = resolveDefaultCloudRoute(can);
    if (fallback === CLOUD_ROUTES.semAcesso) {
      return <Redirect href={CLOUD_ROUTES.semAcesso} />;
    }

    return (
      <ControlState
        title="Acesso restrito"
        message="Seu perfil não permite acessar esta tela."
        actionLabel="Ir para uma área permitida"
        onAction={() => { router.replace(fallback); }}
      />
    );
  }

  return (
    <CloudShell>
      <Slot />
    </CloudShell>
  );
}
