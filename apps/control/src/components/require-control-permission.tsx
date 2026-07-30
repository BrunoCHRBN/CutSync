import React from 'react';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import type { ControlPermission } from '@/types/control';

export interface RequireControlPermissionProps {
  permission: ControlPermission;
  children: React.ReactNode;
  title?: string;
  message?: string;
}

export function RequireControlPermission({
  permission,
  children,
  title = 'Acesso restrito',
  message = 'Seu papel não permite acessar esta área.',
}: RequireControlPermissionProps) {
  const { can } = useControlAuth();

  if (!can(permission)) {
    return <ControlState title={title} message={message} />;
  }

  return <>{children}</>;
}
