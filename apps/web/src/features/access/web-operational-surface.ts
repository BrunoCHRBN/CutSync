import type { AuthorizedContext, BusinessCapability } from '@cutsync/database';

export type WebOperationalSurface = 'admin' | 'professional' | 'client';

const WEB_ADMIN_SURFACE_CAPABILITIES = new Set<BusinessCapability>([
  'create_team_walk_in',
  'manage_team_blocks',
  'manage_services',
  'manage_team',
  'view_unit_reports',
  'manage_operational_settings',
  'manage_clients',
  'manage_team_orders',
  'take_payments',
  'view_cash',
]);

export const resolveWebOperationalSurface = (
  context: Pick<AuthorizedContext, 'capabilities'> | null | undefined,
): WebOperationalSurface => {
  if (!context) return 'client';
  if (context.capabilities.some((capability) => WEB_ADMIN_SURFACE_CAPABILITIES.has(capability))) {
    return 'admin';
  }
  return context.capabilities.includes('view_own_agenda') ? 'professional' : 'client';
};
