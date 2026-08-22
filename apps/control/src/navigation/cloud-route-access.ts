import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';
import type { ControlPermission } from '@/types/control';

type CloudRouteAccessRule = {
  path: CloudRoutePath;
  match: 'exact' | 'prefix';
  anyOf: readonly ControlPermission[];
};

const GSP_ENTRY_PERMISSIONS = [
  'control.governance.read',
  'control.knowledge.read',
  'control.access.manage',
  'control.access.request',
  'control.access.approve',
  'control.access.apply',
] as const satisfies readonly ControlPermission[];

const CASES_ENTRY_PERMISSIONS = [
  'control.cases.request',
  'control.cases.read',
  'control.cases.triage',
  'control.cases.route',
  'control.cases.manage',
  'control.cases.audit',
  'control.cases.fulfill',
] as const satisfies readonly ControlPermission[];

const CASES_READ_PERMISSIONS = [
  'control.cases.read',
  'control.cases.triage',
  'control.cases.route',
  'control.cases.manage',
  'control.cases.audit',
] as const satisfies readonly ControlPermission[];

/**
 * Canonical frontend route manifest. This controls discovery and client-side
 * routing only; protected RPCs and RLS remain the authorization boundary.
 */
export const CLOUD_ROUTE_ACCESS_RULES: readonly CloudRouteAccessRule[] = [
  { path: CLOUD_ROUTES.central, match: 'exact', anyOf: ['control.dashboard.read'] },

  { path: CLOUD_ROUTES.chamados.observando, match: 'exact', anyOf: CASES_READ_PERMISSIONS },
  { path: CLOUD_ROUTES.chamados.pendencias, match: 'exact', anyOf: CASES_READ_PERMISSIONS },
  { path: CLOUD_ROUTES.chamados.novo, match: 'exact', anyOf: ['control.cases.request'] },
  {
    path: CLOUD_ROUTES.chamados.execucao,
    match: 'exact',
    anyOf: ['control.cases.fulfill'],
  },
  {
    path: CLOUD_ROUTES.chamados.fila,
    match: 'exact',
    anyOf: ['control.cases.triage', 'control.cases.route', 'control.cases.manage', 'control.cases.audit'],
  },
  {
    path: CLOUD_ROUTES.chamados.todos,
    match: 'exact',
    anyOf: ['control.cases.manage', 'control.cases.audit'],
  },
  { path: CLOUD_ROUTES.chamados.meus, match: 'exact', anyOf: CASES_ENTRY_PERMISSIONS },
  { path: CLOUD_ROUTES.chamados.notificacoes, match: 'exact', anyOf: CASES_ENTRY_PERMISSIONS },
  { path: CLOUD_ROUTES.chamados.root, match: 'prefix', anyOf: CASES_ENTRY_PERMISSIONS },

  { path: CLOUD_ROUTES.operacao.tempoReal, match: 'exact', anyOf: ['control.live.read'] },
  { path: CLOUD_ROUTES.operacao.saudeDosDados, match: 'exact', anyOf: ['control.dashboard.read'] },
  { path: CLOUD_ROUTES.operacao.incidentes, match: 'exact', anyOf: ['control.dashboard.read'] },
  { path: CLOUD_ROUTES.operacao.root, match: 'exact', anyOf: ['control.dashboard.read'] },

  { path: CLOUD_ROUTES.suporte.operacoesAssistidas, match: 'exact', anyOf: ['control.support.manage'] },
  { path: CLOUD_ROUTES.suporte.atendimentos, match: 'prefix', anyOf: ['control.support.read'] },
  { path: CLOUD_ROUTES.suporte.clientes, match: 'exact', anyOf: ['control.support.read'] },
  { path: CLOUD_ROUTES.suporte.monitoramento, match: 'exact', anyOf: ['control.support.read'] },
  { path: CLOUD_ROUTES.suporte.root, match: 'exact', anyOf: ['control.support.read'] },

  { path: CLOUD_ROUTES.gsp.solicitarAcesso, match: 'exact', anyOf: ['control.access.request'] },
  { path: CLOUD_ROUTES.gsp.minhasSolicitacoes, match: 'exact', anyOf: ['control.access.request'] },
  { path: CLOUD_ROUTES.gsp.aprovacoes, match: 'exact', anyOf: ['control.access.approve'] },
  { path: CLOUD_ROUTES.gsp.aplicacao, match: 'exact', anyOf: ['control.access.apply'] },
  { path: CLOUD_ROUTES.gsp.acessos, match: 'exact', anyOf: ['control.access.manage'] },
  { path: CLOUD_ROUTES.gsp.revisoes, match: 'exact', anyOf: ['control.governance.read'] },
  { path: CLOUD_ROUTES.gsp.auditoria, match: 'exact', anyOf: ['control.governance.read'] },
  { path: CLOUD_ROUTES.gsp.politicas, match: 'exact', anyOf: ['control.governance.read'] },
  { path: CLOUD_ROUTES.gsp.conhecimento, match: 'exact', anyOf: ['control.knowledge.read'] },
  { path: CLOUD_ROUTES.gsp.root, match: 'exact', anyOf: GSP_ENTRY_PERMISSIONS },

  { path: CLOUD_ROUTES.financeiro.cobrancas, match: 'exact', anyOf: ['control.billing.read'] },
  { path: CLOUD_ROUTES.financeiro.assinaturas, match: 'exact', anyOf: ['control.billing.read'] },
  { path: CLOUD_ROUTES.financeiro.movimentacoes, match: 'exact', anyOf: ['control.billing.read'] },
  { path: CLOUD_ROUTES.financeiro.conciliacao, match: 'exact', anyOf: ['control.billing.read'] },
  { path: CLOUD_ROUTES.financeiro.root, match: 'exact', anyOf: ['control.billing.read'] },
] as const;

const DEFAULT_ROUTE_CANDIDATES: readonly Pick<CloudRouteAccessRule, 'path' | 'anyOf'>[] = [
  { path: CLOUD_ROUTES.central, anyOf: ['control.dashboard.read'] },
  { path: CLOUD_ROUTES.chamados.root, anyOf: CASES_ENTRY_PERMISSIONS },
  { path: CLOUD_ROUTES.operacao.root, anyOf: ['control.dashboard.read'] },
  { path: CLOUD_ROUTES.operacao.tempoReal, anyOf: ['control.live.read'] },
  { path: CLOUD_ROUTES.suporte.root, anyOf: ['control.support.read'] },
  { path: CLOUD_ROUTES.gsp.root, anyOf: GSP_ENTRY_PERMISSIONS },
  { path: CLOUD_ROUTES.financeiro.root, anyOf: ['control.billing.read'] },
] as const;

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? '';
  return pathOnly.length > 1 && pathOnly.endsWith('/')
    ? pathOnly.slice(0, -1)
    : pathOnly;
}

function routeMatches(pathname: string, rule: CloudRouteAccessRule): boolean {
  if (rule.match === 'exact') return pathname === rule.path;
  return pathname === rule.path || pathname.startsWith(`${rule.path}/`);
}

export function canAccessCloudRoute(
  pathname: string,
  can: (permission: ControlPermission) => boolean,
): boolean | null {
  const normalized = normalizePathname(pathname);
  const rule = CLOUD_ROUTE_ACCESS_RULES.find((entry) => routeMatches(normalized, entry));
  if (!rule) return null;
  return rule.anyOf.some((permission) => can(permission));
}

export function resolveDefaultCloudRoute(
  can: (permission: ControlPermission) => boolean,
): CloudRoutePath {
  const candidate = DEFAULT_ROUTE_CANDIDATES.find((entry) => (
    entry.anyOf.some((permission) => can(permission))
  ));
  return candidate?.path ?? CLOUD_ROUTES.semAcesso;
}

export function controlPermissionChecker(
  permissions: readonly ControlPermission[],
): (permission: ControlPermission) => boolean {
  const allowed = new Set<ControlPermission>(permissions);
  return (permission) => allowed.has(permission);
}
