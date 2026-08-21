import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';
import {
  controlPermissionChecker,
  resolveDefaultCloudRoute,
} from '@/navigation/cloud-route-access';
import type { ControlPermission } from '@/types/control';

export type CloudAuthStatus =
  | 'loading'
  | 'signed_out'
  | 'mfa_required'
  | 'unauthorized'
  | 'ready'
  | 'error';

export type CloudGateDecision =
  | { kind: 'loading' }
  | { kind: 'redirect'; href: CloudRoutePath }
  | { kind: 'recoverable'; title: string; message: string }
  | { kind: 'ready'; href: CloudRoutePath };

/**
 * Pure gate for `/` (published as `/cloud`).
 * Reuses ControlAuth status machine without changing security contracts.
 */
export function resolveCloudRootGate(
  status: CloudAuthStatus,
  message = '',
  permissions: readonly ControlPermission[] = [],
): CloudGateDecision {
  switch (status) {
    case 'loading':
      return { kind: 'loading' };
    case 'signed_out':
      return { kind: 'redirect', href: CLOUD_ROUTES.login };
    case 'mfa_required':
      return { kind: 'redirect', href: CLOUD_ROUTES.mfa };
    case 'unauthorized':
      return { kind: 'redirect', href: CLOUD_ROUTES.semAcesso };
    case 'error':
      return {
        kind: 'recoverable',
        title: 'Não foi possível abrir o CutSync Cloud',
        message: message || 'Tente novamente em instantes.',
      };
    case 'ready':
      return {
        kind: 'redirect',
        href: resolveDefaultCloudRoute(controlPermissionChecker(permissions)),
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function resolveProtectedLayoutDecision(
  status: CloudAuthStatus,
): CloudGateDecision {
  switch (status) {
    case 'loading':
      return { kind: 'loading' };
    case 'signed_out':
      return { kind: 'redirect', href: CLOUD_ROUTES.login };
    case 'mfa_required':
      return { kind: 'redirect', href: CLOUD_ROUTES.mfa };
    case 'unauthorized':
      return { kind: 'redirect', href: CLOUD_ROUTES.semAcesso };
    case 'error':
      return {
        kind: 'recoverable',
        title: 'Não foi possível abrir o CutSync Cloud',
        message: 'Recarregue o contexto de acesso para continuar.',
      };
    case 'ready':
      return { kind: 'ready', href: CLOUD_ROUTES.central };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
