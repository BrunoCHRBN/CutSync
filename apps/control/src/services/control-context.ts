import type {
  ControlAccessAssignment,
  ControlContext,
  ControlPermission,
  ControlPermissionSource,
  GovernanceRole,
} from '@/types/control';
import { controlPermissions } from '@/types/control';

const governanceRoles: GovernanceRole[] = ['SaaS_Viewer', 'SaaS_Editor', 'SaaS_Owner'];
const knownPermissions = new Set<string>(controlPermissions);

type ControlContextPayload = {
  profile_id?: unknown;
  name?: unknown;
  email?: unknown;
  role?: unknown;
  permissions?: unknown;
  assignments?: unknown;
  permission_sources?: unknown;
  context_version?: unknown;
  assurance_level?: unknown;
};

function parseAssignments(value: unknown): ControlAccessAssignment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('control_context_invalid');

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('control_context_invalid');
    }

    const assignment = entry as Record<string, unknown>;
    const sourceType = assignment.source_type;
    const scopeType = assignment.scope_type;
    if (
      typeof assignment.assignment_id !== 'string'
      || typeof assignment.profile_key !== 'string'
      || typeof assignment.profile_label !== 'string'
      || (sourceType !== 'role_compat' && sourceType !== 'approved_request' && sourceType !== 'migration')
      || (scopeType !== 'global' && scopeType !== 'module' && scopeType !== 'organization' && scopeType !== 'establishment')
      || (assignment.scope_id !== null && typeof assignment.scope_id !== 'string')
      || (assignment.valid_until !== null && typeof assignment.valid_until !== 'string')
    ) {
      throw new Error('control_context_invalid');
    }

    return {
      assignmentId: assignment.assignment_id,
      profileKey: assignment.profile_key,
      profileLabel: assignment.profile_label,
      sourceType,
      scopeType,
      scopeId: assignment.scope_id,
      validUntil: assignment.valid_until,
    };
  });
}

function parsePermissionSources(value: unknown): ControlPermissionSource[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('control_context_invalid');

  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('control_context_invalid');
    }

    const source = entry as Record<string, unknown>;
    if (
      typeof source.permission !== 'string'
      || !knownPermissions.has(source.permission)
      || typeof source.profile_key !== 'string'
      || typeof source.assignment_id !== 'string'
    ) {
      throw new Error('control_context_invalid');
    }

    return {
      permission: source.permission as ControlPermission,
      profileKey: source.profile_key,
      assignmentId: source.assignment_id,
    };
  });
}

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

  const contextVersion = payload.context_version ?? 1;
  const assuranceLevel = payload.assurance_level ?? 'aal2';
  if (
    typeof contextVersion !== 'number'
    || !Number.isInteger(contextVersion)
    || contextVersion < 1
    || assuranceLevel !== 'aal2'
  ) {
    throw new Error('control_context_invalid');
  }

  return {
    profileId: payload.profile_id,
    name: payload.name,
    email: payload.email,
    role: payload.role as GovernanceRole,
    permissions: payload.permissions as ControlPermission[],
    assignments: parseAssignments(payload.assignments),
    permissionSources: parsePermissionSources(payload.permission_sources),
    contextVersion,
    assuranceLevel,
  };
}

export function hasControlPermission(
  context: ControlContext | null,
  permission: ControlPermission,
): boolean {
  return Boolean(context?.permissions.includes(permission));
}
