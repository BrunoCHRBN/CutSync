import type { ControlPermission } from '@/types/control';
import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';

export type CloudModuleId = 'operation' | 'support' | 'gsp' | 'finance';
export type CloudModuleAccent = 'blue' | 'green' | 'violet' | 'amber';

export type CloudModule = {
  id: CloudModuleId;
  label: string;
  description: string;
  href: CloudRoutePath;
  readPermission: ControlPermission;
  managePermission?: ControlPermission;
  searchPlaceholder: string;
  accent: CloudModuleAccent;
};

export type CloudSearchAction = {
  id: string;
  label: string;
  href: CloudRoutePath;
  permission: ControlPermission;
  keywords: string[];
  moduleId: CloudModuleId | 'central';
};

export const CLOUD_MODULES: CloudModule[] = [
  {
    id: 'operation',
    label: 'Operação',
    description: 'Indicadores, tempo real, saúde dos dados e incidentes.',
    href: CLOUD_ROUTES.operacao.root,
    readPermission: 'control.dashboard.read',
    searchPlaceholder: 'Buscar serviços, alertas e latência',
    accent: 'blue',
  },
  {
    id: 'support',
    label: 'Suporte',
    description: 'Fila de atendimentos, SLA e distribuição da equipe.',
    href: CLOUD_ROUTES.suporte.root,
    readPermission: 'control.support.read',
    managePermission: 'control.support.manage',
    searchPlaceholder: 'Buscar atendimentos, responsáveis e SLA',
    accent: 'green',
  },
  {
    id: 'gsp',
    label: 'GSP',
    description: 'Governança, segurança, políticas, conhecimento e acessos.',
    href: CLOUD_ROUTES.gsp.root,
    readPermission: 'control.governance.read',
    managePermission: 'control.access.manage',
    searchPlaceholder: 'Buscar políticas, revisões e acessos',
    accent: 'violet',
  },
  {
    id: 'finance',
    label: 'Financeiro',
    description: 'Cobranças, assinaturas, movimentações e conciliação.',
    href: CLOUD_ROUTES.financeiro.root,
    readPermission: 'control.billing.read',
    managePermission: 'control.billing.manage',
    searchPlaceholder: 'Buscar cobranças, planos e pendências',
    accent: 'amber',
  },
];

export const CLOUD_SEARCH_ACTIONS: CloudSearchAction[] = [
  {
    id: 'go-central',
    label: 'Abrir Central',
    href: CLOUD_ROUTES.central,
    permission: 'control.dashboard.read',
    keywords: ['central', 'inicio', 'home'],
    moduleId: 'central',
  },
  {
    id: 'go-operacao',
    label: 'Abrir Operação',
    href: CLOUD_ROUTES.operacao.root,
    permission: 'control.dashboard.read',
    keywords: ['operacao', 'dashboard', 'metricas'],
    moduleId: 'operation',
  },
  {
    id: 'go-tempo-real',
    label: 'Abrir Tempo real',
    href: CLOUD_ROUTES.operacao.tempoReal,
    permission: 'control.live.read',
    keywords: ['ao vivo', 'live', 'tempo real'],
    moduleId: 'operation',
  },
  {
    id: 'go-saude',
    label: 'Abrir Saúde dos dados',
    href: CLOUD_ROUTES.operacao.saudeDosDados,
    permission: 'control.dashboard.read',
    keywords: ['qualidade', 'dados', 'saude'],
    moduleId: 'operation',
  },
  {
    id: 'go-suporte',
    label: 'Abrir Suporte',
    href: CLOUD_ROUTES.suporte.root,
    permission: 'control.support.read',
    keywords: ['suporte', 'atendimento', 'jira'],
    moduleId: 'support',
  },
  {
    id: 'go-gsp',
    label: 'Abrir GSP',
    href: CLOUD_ROUTES.gsp.root,
    permission: 'control.governance.read',
    keywords: ['gsp', 'governanca', 'seguranca'],
    moduleId: 'gsp',
  },
  {
    id: 'go-acessos',
    label: 'Abrir diretório de acessos',
    href: CLOUD_ROUTES.gsp.acessos,
    permission: 'control.access.manage',
    keywords: ['acessos', 'owner', 'permissoes'],
    moduleId: 'gsp',
  },
  {
    id: 'go-conhecimento',
    label: 'Abrir Conhecimento',
    href: CLOUD_ROUTES.gsp.conhecimento,
    permission: 'control.knowledge.read',
    keywords: ['conhecimento', 'base', 'docs'],
    moduleId: 'gsp',
  },
  {
    id: 'go-financeiro',
    label: 'Abrir Financeiro',
    href: CLOUD_ROUTES.financeiro.root,
    permission: 'control.billing.read',
    keywords: ['financeiro', 'cobranca', 'billing'],
    moduleId: 'finance',
  },
];

export function modulesVisibleTo(
  can: (permission: ControlPermission) => boolean,
): CloudModule[] {
  return CLOUD_MODULES.filter((module) => {
    if (module.id === 'gsp') {
      return (
        can('control.governance.read')
        || can('control.knowledge.read')
        || can('control.access.manage')
      );
    }
    if (module.id === 'operation') {
      return can('control.dashboard.read') || can('control.live.read');
    }
    return can(module.readPermission);
  });
}

export function searchCloudActions(
  query: string,
  can: (permission: ControlPermission) => boolean,
): CloudSearchAction[] {
  const normalized = query.trim().toLowerCase();
  return CLOUD_SEARCH_ACTIONS.filter((action) => {
    if (!can(action.permission)) return false;
    if (!normalized) return true;
    return (
      action.label.toLowerCase().includes(normalized)
      || action.keywords.some((keyword) => keyword.includes(normalized))
    );
  });
}
