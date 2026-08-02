import type { ControlPermission } from '@/types/control';
import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';

export type CloudNavModuleId = 'central' | 'operation' | 'support' | 'gsp' | 'finance';

export type CloudNavItem = {
  id: string;
  label: string;
  href: CloudRoutePath;
  /** Optional in-module section when multiple items share the same route. */
  section?: string;
  /** Optional sidebar group label (rendered once before the first item of the group). */
  group?: string;
  permission: ControlPermission | ControlPermission[];
  exact?: boolean;
};

export type CloudNavModule = {
  id: CloudNavModuleId;
  label: string;
  href: CloudRoutePath;
  matchPrefixes: string[];
  items: CloudNavItem[];
};

export const CLOUD_NAV_MODULES: CloudNavModule[] = [
  {
    id: 'central',
    label: 'Central',
    href: CLOUD_ROUTES.central,
    matchPrefixes: ['/central'],
    items: [
      {
        id: 'central-overview',
        label: 'Visão geral',
        href: CLOUD_ROUTES.central,
        permission: 'control.dashboard.read',
        exact: true,
      },
      {
        id: 'central-recent',
        label: 'Acessos recentes',
        href: CLOUD_ROUTES.central,
        section: 'recent',
        permission: 'control.dashboard.read',
        exact: true,
      },
      {
        id: 'central-security',
        label: 'Segurança',
        href: CLOUD_ROUTES.gsp.acessos,
        permission: 'control.access.manage',
      },
      {
        id: 'central-preferences',
        label: 'Preferências',
        href: CLOUD_ROUTES.central,
        section: 'preferences',
        permission: 'control.dashboard.read',
        exact: true,
      },
    ],
  },
  {
    id: 'operation',
    label: 'Operação',
    href: CLOUD_ROUTES.operacao.root,
    matchPrefixes: ['/operacao'],
    items: [
      {
        id: 'op-overview',
        label: 'Visão geral',
        href: CLOUD_ROUTES.operacao.root,
        permission: 'control.dashboard.read',
        exact: true,
        group: 'Monitoramento',
      },
      {
        id: 'op-services',
        label: 'Serviços',
        href: CLOUD_ROUTES.operacao.root,
        section: 'services',
        permission: 'control.dashboard.read',
        exact: true,
        group: 'Monitoramento',
      },
      {
        id: 'op-live',
        label: 'Tempo real',
        href: CLOUD_ROUTES.operacao.tempoReal,
        permission: 'control.live.read',
        group: 'Monitoramento',
      },
      {
        id: 'op-incidents',
        label: 'Incidentes',
        href: CLOUD_ROUTES.operacao.incidentes,
        permission: 'control.dashboard.read',
        group: 'Monitoramento',
      },
      {
        id: 'op-health',
        label: 'Saúde dos dados',
        href: CLOUD_ROUTES.operacao.saudeDosDados,
        permission: 'control.dashboard.read',
        group: 'Confiabilidade',
      },
    ],
  },
  {
    id: 'support',
    label: 'Suporte',
    href: CLOUD_ROUTES.suporte.root,
    matchPrefixes: ['/suporte'],
    items: [
      {
        id: 'sup-overview',
        label: 'Visão geral',
        href: CLOUD_ROUTES.suporte.root,
        permission: 'control.support.read',
        exact: true,
      },
      {
        id: 'sup-tickets',
        label: 'Atendimentos',
        href: CLOUD_ROUTES.suporte.atendimentos,
        permission: 'control.support.read',
      },
      {
        id: 'sup-clients',
        label: 'Clientes',
        href: CLOUD_ROUTES.suporte.clientes,
        permission: 'control.support.read',
      },
      {
        id: 'sup-monitor',
        label: 'Monitoramento',
        href: CLOUD_ROUTES.suporte.monitoramento,
        permission: 'control.support.read',
      },
      {
        id: 'sup-assisted',
        label: 'Operações assistidas',
        href: CLOUD_ROUTES.suporte.operacoesAssistidas,
        permission: 'control.support.manage',
      },
    ],
  },
  {
    id: 'gsp',
    label: 'GSP',
    href: CLOUD_ROUTES.gsp.root,
    matchPrefixes: ['/gsp'],
    items: [
      {
        id: 'gsp-overview',
        label: 'Visão geral',
        href: CLOUD_ROUTES.gsp.root,
        permission: ['control.governance.read', 'control.knowledge.read', 'control.access.manage'],
        exact: true,
      },
      {
        id: 'gsp-users',
        label: 'Usuários e grupos',
        href: CLOUD_ROUTES.gsp.acessos,
        section: 'users',
        permission: 'control.access.manage',
      },
      {
        id: 'gsp-access',
        label: 'Acessos',
        href: CLOUD_ROUTES.gsp.acessos,
        permission: 'control.access.manage',
      },
      {
        id: 'gsp-reviews',
        label: 'Revisões de acesso',
        href: CLOUD_ROUTES.gsp.revisoes,
        permission: 'control.governance.read',
      },
      {
        id: 'gsp-audit',
        label: 'Auditoria',
        href: CLOUD_ROUTES.gsp.auditoria,
        permission: 'control.governance.read',
      },
      {
        id: 'gsp-policies',
        label: 'Políticas',
        href: CLOUD_ROUTES.gsp.politicas,
        permission: 'control.governance.read',
      },
      {
        id: 'gsp-knowledge',
        label: 'Conhecimento',
        href: CLOUD_ROUTES.gsp.conhecimento,
        permission: 'control.knowledge.read',
      },
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    href: CLOUD_ROUTES.financeiro.root,
    matchPrefixes: ['/financeiro'],
    items: [
      {
        id: 'fin-overview',
        label: 'Visão geral',
        href: CLOUD_ROUTES.financeiro.root,
        permission: 'control.billing.read',
        exact: true,
        group: 'Gestão',
      },
      {
        id: 'fin-charges',
        label: 'Cobranças',
        href: CLOUD_ROUTES.financeiro.cobrancas,
        permission: 'control.billing.read',
        group: 'Gestão',
      },
      {
        id: 'fin-subs',
        label: 'Assinaturas',
        href: CLOUD_ROUTES.financeiro.assinaturas,
        permission: 'control.billing.read',
        group: 'Gestão',
      },
      {
        id: 'fin-movements',
        label: 'Movimentações',
        href: CLOUD_ROUTES.financeiro.movimentacoes,
        permission: 'control.billing.read',
        group: 'Operação financeira',
      },
      {
        id: 'fin-reconcile',
        label: 'Conciliação',
        href: CLOUD_ROUTES.financeiro.conciliacao,
        permission: 'control.billing.read',
        group: 'Operação financeira',
      },
    ],
  },
];

function canAccess(
  can: (permission: ControlPermission) => boolean,
  permission: ControlPermission | ControlPermission[],
) {
  return Array.isArray(permission) ? permission.some((item) => can(item)) : can(permission);
}

export function resolveActiveNavModule(pathname: string): CloudNavModule {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;

  const match = CLOUD_NAV_MODULES.find((module) => (
    module.matchPrefixes.some((prefix) => (
      normalized === prefix || normalized.startsWith(`${prefix}/`)
    ))
  ));

  return match ?? CLOUD_NAV_MODULES[0];
}

export function navItemsForModule(
  moduleId: CloudNavModuleId,
  can: (permission: ControlPermission) => boolean,
): CloudNavItem[] {
  const module = CLOUD_NAV_MODULES.find((entry) => entry.id === moduleId);
  if (!module) return [];
  return module.items.filter((item) => canAccess(can, item.permission));
}

export function modulesForSwitcher(
  can: (permission: ControlPermission) => boolean,
): CloudNavModule[] {
  return CLOUD_NAV_MODULES.filter((module) => (
    navItemsForModule(module.id, can).length > 0
  ));
}

export function navItemHref(item: CloudNavItem): string | { pathname: CloudRoutePath; params: { section: string } } {
  if (!item.section) return item.href;
  return { pathname: item.href, params: { section: item.section } };
}

export function isNavItemSelected(
  pathname: string,
  item: CloudNavItem,
  section?: string | null,
): boolean {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const activeSection = section?.trim() || null;

  if (item.exact) {
    if (normalized !== item.href) return false;
    if (item.section) return activeSection === item.section;
    return !activeSection;
  }

  if (normalized !== item.href && !normalized.startsWith(`${item.href}/`)) return false;
  if (item.section) return activeSection === item.section;
  // Prefer exact non-section item only when no section is active, unless nested path.
  if (normalized === item.href) return !activeSection;
  return true;
}

/** In-memory last module for "Continuar em…" (tab session only, not auth persistence). */
let lastModuleId: CloudNavModuleId | null = null;

export function rememberLastModule(moduleId: CloudNavModuleId) {
  if (moduleId === 'central') return;
  lastModuleId = moduleId;
}

export function getLastModuleId(): CloudNavModuleId | null {
  return lastModuleId;
}
