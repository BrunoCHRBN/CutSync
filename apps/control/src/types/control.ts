export type GovernanceRole = 'SaaS_Viewer' | 'SaaS_Editor' | 'SaaS_Owner';

export const controlPermissions = [
  'control.dashboard.read',
  'control.live.read',
  'control.support.read',
  'control.governance.read',
  'control.knowledge.read',
  'control.billing.read',
  'control.support.manage',
  'control.governance.manage',
  'control.knowledge.manage',
  'control.billing.manage',
  'control.access.manage',
  'control.commercial.read',
  'control.commercial.manage',
  'control.access.request',
  'control.access.approve',
  'control.access.apply',
  'control.audit.read',
  'control.audit.export',
  'control.auth_recovery.manage',
  'control.auth_recovery.approve',
  'control.cases.request',
  'control.cases.read',
  'control.cases.triage',
  'control.cases.route',
  'control.cases.manage',
  'control.cases.audit',
  'control.cases.fulfill',
] as const;

export type ControlPermission = (typeof controlPermissions)[number];

export interface ControlAccessAssignment {
  assignmentId: string;
  profileKey: string;
  profileLabel: string;
  sourceType: 'role_compat' | 'approved_request' | 'migration';
  scopeType: 'global' | 'module' | 'organization' | 'establishment';
  scopeId: string | null;
  validUntil: string | null;
}

export interface ControlPermissionSource {
  permission: ControlPermission;
  profileKey: string;
  assignmentId: string;
}

export interface ControlContext {
  profileId: string;
  name: string;
  email: string;
  role: GovernanceRole;
  permissions: ControlPermission[];
  assignments: ControlAccessAssignment[];
  permissionSources: ControlPermissionSource[];
  contextVersion: number;
  assuranceLevel: 'aal2';
}
