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
] as const;

export type ControlPermission = (typeof controlPermissions)[number];

export interface ControlContext {
  profileId: string;
  name: string;
  email: string;
  role: GovernanceRole;
  permissions: ControlPermission[];
}
