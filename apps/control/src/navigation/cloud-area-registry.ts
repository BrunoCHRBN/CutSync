import type { ControlPermission } from '@/types/control';
import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';
import type { CloudModuleAccent } from '@/navigation/module-registry';

export type CloudAreaId = 'central' | 'cases' | 'operation' | 'support' | 'gsp' | 'finance';

export type CloudArea = {
  id: CloudAreaId;
  label: string;
  shortDescription: string;
  href: CloudRoutePath;
  accent: CloudModuleAccent | 'brand';
  /** Permissions that unlock at least one route in the area. */
  anyOf: ControlPermission[];
};

export const CLOUD_AREAS: CloudArea[] = [
  {
    id: 'central',
    label: 'Central',
    shortDescription: 'Início do CutSync Cloud',
    href: CLOUD_ROUTES.central,
    accent: 'brand',
    anyOf: ['control.dashboard.read'],
  },
  {
    id: 'cases',
    label: 'Chamados',
    shortDescription: 'Solicitações e fluxos internos',
    href: CLOUD_ROUTES.chamados.root,
    accent: 'blue',
    anyOf: [
      'control.cases.request',
      'control.cases.read',
      'control.cases.triage',
      'control.cases.route',
      'control.cases.approve',
      'control.cases.manage',
      'control.cases.configure',
      'control.cases.audit',
      'control.cases.fulfill',
    ],
  },
  {
    id: 'operation',
    label: 'Operação',
    shortDescription: 'Monitoramento e confiabilidade',
    href: CLOUD_ROUTES.operacao.root,
    accent: 'blue',
    anyOf: ['control.dashboard.read', 'control.live.read'],
  },
  {
    id: 'support',
    label: 'Suporte',
    shortDescription: 'Atendimento e acompanhamento',
    href: CLOUD_ROUTES.suporte.root,
    accent: 'green',
    anyOf: ['control.support.read'],
  },
  {
    id: 'gsp',
    label: 'GSP',
    shortDescription: 'Governança, segurança e acessos',
    href: CLOUD_ROUTES.gsp.root,
    accent: 'violet',
    anyOf: [
      'control.governance.read',
      'control.knowledge.read',
      'control.access.manage',
    ],
  },
  {
    id: 'finance',
    label: 'Financeiro',
    shortDescription: 'Cobranças e conciliação',
    href: CLOUD_ROUTES.financeiro.root,
    accent: 'amber',
    anyOf: ['control.billing.read'],
  },
];

/** Descriptions used on Central launcher cards (slightly fuller than switcher). */
export const CLOUD_AREA_LAUNCHER_COPY: Record<Exclude<CloudAreaId, 'central'>, string> = {
  cases: 'Solicitações corporativas, pendências e acompanhamento interno.',
  operation: 'Monitoramento e confiabilidade da plataforma.',
  support: 'Atendimento e acompanhamento de solicitações.',
  gsp: 'Governança, segurança e gestão de acessos.',
  finance: 'Cobranças, assinaturas e conciliação.',
};

export function areaIsVisible(
  area: CloudArea,
  can: (permission: ControlPermission) => boolean,
): boolean {
  return area.anyOf.some((permission) => can(permission));
}

export function areasVisibleTo(
  can: (permission: ControlPermission) => boolean,
  options?: { includeCentral?: boolean },
): CloudArea[] {
  const includeCentral = options?.includeCentral ?? true;
  return CLOUD_AREAS.filter((area) => {
    if (area.id === 'central' && !includeCentral) return false;
    return areaIsVisible(area, can);
  });
}

export function launcherAreasVisibleTo(
  can: (permission: ControlPermission) => boolean,
): CloudArea[] {
  return areasVisibleTo(can, { includeCentral: false });
}

export function findCloudArea(id: CloudAreaId): CloudArea {
  const area = CLOUD_AREAS.find((entry) => entry.id === id);
  if (!area) throw new Error(`cloud_area_missing:${id}`);
  return area;
}
