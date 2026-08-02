import { Redirect, Slot } from 'expo-router';
import React from 'react';

import { CloudShell } from '@/components/cloud/cloud-shell';
import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveProtectedLayoutDecision } from '@/navigation/cloud-auth-gate';

export default function CloudProtectedLayout() {
  const { status, message, retry } = useControlAuth();
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

  return (
    <CloudShell>
      <Slot />
    </CloudShell>
  );
}
