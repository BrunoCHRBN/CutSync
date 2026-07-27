import type { ControlContext, ControlPermission, GovernanceRole } from '@/types/control';
import { controlPermissions } from '@/types/control';

const governanceRoles: GovernanceRole[] = ['SaaS_Viewer', 'SaaS_Editor', 'SaaS_Owner'];
const knownPermissions = new Set<string>(controlPermissions);

type ControlContextPayload = {
  profile_id?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
  permissions?: unknown;
};

export function parseControlContext(value: unknown): ControlContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('control_context_invalid');
  }

  const payload = value as ControlContextPayload;
  if (
    typeof payload.profile_id !== 'string'
    || typeof payload.name !== 'string'
    || typeof payload.email !== 'string'
    || typeof payload.role !== 'string'
    || !governanceRoles.includes(payload.role as GovernanceRole)
    || !Array.isArray(payload.permissions)
    || !payload.permissions.every((permission) => typeof permission === 'string' && knownPermissions.has(permission))
  ) {
    throw new Error('control_context_invalid');
  }

  return {
    profileId: payload.profile_id,
    name: payload.name,
    email: payload.email,
    role: payload.role as GovernanceRole,
    permissions: payload.permissions as ControlPermission[],
  };
}

export function hasControlPermission(
  context: ControlContext | null,
  permission: ControlPermission,
): boolean {
  return Boolean(context?.permissions.includes(permission));
}
