import type { ControlPermission } from '@/types/control';
import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';

export type CloudModuleId = 'cases' | 'operation' | 'support' | 'gsp' | 'finance';
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
  permission: ControlPermission | ControlPermission[];
  keywords: string[];
  moduleId: CloudModuleId | 'central';
};

export const CLOUD_MODULES: CloudModule[] = [
  {
    id: 'cases',
    label: 'Chamados',
    description: 'Solicitações corporativas e fluxos internos.',
    href: CLOUD_ROUTES.chamados.root,
    readPermission: 'control.cases.read',
    managePermission: 'control.cases.manage',
    searchPlaceholder: 'Buscar protocolo, assunto e responsável',
    accent: 'blue',
  },
  {
    id: 'operation',
    label: 'Operação',
    description: 'Monitoramento e confiabilidade da plataforma.',
    href: CLOUD_ROUTES.operacao.root,
    readPermission: 'control.dashboard.read',
    searchPlaceholder: 'Buscar serviços, alertas e latência',
    accent: 'blue',
  },
  {
    id: 'support',
    label: 'Suporte',
    description: 'Atendimento e acompanhamento de solicitações.',
    href: CLOUD_ROUTES.suporte.root,
    readPermission: 'control.support.read',
    managePermission: 'control.support.manage',
    searchPlaceholder: 'Buscar atendimentos, responsáveis e SLA',
    accent: 'green',
  },
  {
    id: 'gsp',
    label: 'GSP',
    description: 'Governança, segurança e gestão de acessos.',
    href: CLOUD_ROUTES.gsp.root,
    readPermission: 'control.governance.read',
    managePermission: 'control.access.manage',
    searchPlaceholder: 'Buscar políticas, revisões e acessos',
    accent: 'violet',
  },
  {
    id: 'finance',
    label: 'Financeiro',
    description: 'Cobranças, assinaturas e conciliação.',
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
    id: 'go-chamados',
    label: 'Abrir Chamados',
    href: CLOUD_ROUTES.chamados.root,
    permission: [
      'control.cases.request',
      'control.cases.read',
      'control.cases.triage',
      'control.cases.route',
      'control.cases.approve',
      'control.cases.manage',
      'control.cases.audit',
      'control.cases.fulfill',
    ],
    keywords: ['chamados', 'solicitacoes', 'interno'],
    moduleId: 'cases',
  },
  {
    id: 'go-abrir-chamado',
    label: 'Abrir novo chamado',
    href: CLOUD_ROUTES.chamados.novo,
    permission: 'control.cases.request',
    keywords: ['novo', 'abrir', 'solicitar', 'acesso'],
    moduleId: 'cases',
  },
  {
    id: 'go-configurar-chamados',
    label: 'Configurar módulo de Chamados',
    href: CLOUD_ROUTES.chamados.configuracao,
    permission: 'control.cases.configure',
    keywords: ['configurar chamados', 'configuracao', 'ativacao', 'flags', 'runtime'],
    moduleId: 'cases',
  },
  {
    id: 'go-fila-chamados',
    label: 'Abrir fila de Chamados',
    href: CLOUD_ROUTES.chamados.fila,
    permission: 'control.cases.triage',
    keywords: ['fila', 'triagem', 'encaminhamento'],
    moduleId: 'cases',
  },
  {
    id: 'go-execucao-chamados',
    label: 'Abrir execução de acessos',
    href: CLOUD_ROUTES.chamados.execucao,
    permission: 'control.cases.fulfill',
    keywords: ['execucao', 'acessos', 'aplicacao', 'sla'],
    moduleId: 'cases',
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
    if (module.id === 'cases') {
      return (
        can('control.cases.request')
        || can('control.cases.read')
        || can('control.cases.triage')
        || can('control.cases.route')
        || can('control.cases.approve')
        || can('control.cases.manage')
        || can('control.cases.configure')
        || can('control.cases.audit')
        || can('control.cases.fulfill')
      );
    }
    if (module.id === 'gsp') {
      return (
        can('control.governance.read')
        || can('control.knowledge.read')
        || can('control.access.manage')
        || can('control.access.request')
        || can('control.access.approve')
        || can('control.access.apply')
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
    const allowed = Array.isArray(action.permission)
      ? action.permission.some((permission) => can(permission))
      : can(action.permission);
    if (!allowed) return false;
    if (!normalized) return true;
    return (
      action.label.toLowerCase().includes(normalized)
      || action.keywords.some((keyword) => keyword.includes(normalized))
    );
  });
}
