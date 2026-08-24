import { CLOUD_ROUTES, listCloudRoutePaths, type CloudRoutePath } from '@/navigation/cloud-routes';
import {
  canAccessCloudRoute,
  controlPermissionChecker,
  resolveDefaultCloudRoute,
} from '@/navigation/cloud-route-access';
import type { ControlPermission } from '@/types/control';

const BLOCKED_PREFIXES = ['http:', 'https:', 'javascript:', 'data:', '//'] as const;

/**
 * Accepts only relative in-app paths under the Cloud route registry.
 * Rejects protocol-relative, absolute, and external destinations.
 */
export function sanitizeReturnTo(raw: unknown): CloudRoutePath | null {
  if (typeof raw !== 'string') return null;

  const value = raw.trim();
  if (!value.startsWith('/')) return null;
  if (value.includes('\\')) return null;

  const lower = value.toLowerCase();
  for (const prefix of BLOCKED_PREFIXES) {
    if (lower.startsWith(prefix) || lower.includes(`:${prefix}`)) return null;
  }

  // Strip query/hash for allowlist check; preserve path only.
  const pathOnly = value.split(/[?#]/, 1)[0] ?? '';
  if (!pathOnly.startsWith('/') || pathOnly.startsWith('//')) return null;

  const normalized = pathOnly.length > 1 && pathOnly.endsWith('/')
    ? pathOnly.slice(0, -1)
    : pathOnly;

  // Auth endpoints are not valid post-login destinations.
  if (
    normalized === CLOUD_ROUTES.login
    || normalized === CLOUD_ROUTES.mfa
    || normalized === CLOUD_ROUTES.root
    || normalized === CLOUD_ROUTES.semAcesso
  ) {
    return null;
  }

  if (!listCloudRoutePaths().includes(normalized as CloudRoutePath)) {
    return null;
  }

  return normalized as CloudRoutePath;
}

export function resolvePostAuthDestination(
  returnTo: unknown,
  permissions: readonly ControlPermission[],
): CloudRoutePath {
  const can = controlPermissionChecker(permissions);
  const destination = sanitizeReturnTo(returnTo);

  if (destination && canAccessCloudRoute(destination, can) === true) {
    return destination;
  }

  return resolveDefaultCloudRoute(can);
}
