import { Redirect } from 'expo-router';
import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudRootGate } from '@/navigation/cloud-auth-gate';

export default function CloudRootGate() {
  const { status, context, message, retry } = useControlAuth();
  const decision = resolveCloudRootGate(status, message, context?.permissions ?? []);

  if (decision.kind === 'loading') {
    return <ControlState loading message="Preparando o CutSync Cloud..." />;
  }

  if (decision.kind === 'recoverable') {
    return (
      <ControlState
        title={decision.title}
        message={decision.message}
        actionLabel="Tentar novamente"
        onAction={() => { void retry(); }}
      />
    );
  }

  return <Redirect href={decision.href} />;
}
