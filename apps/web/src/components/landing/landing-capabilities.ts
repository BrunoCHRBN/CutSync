export type LandingCapabilityId = 'agenda' | 'services' | 'team';

export interface LandingCapability {
  id: LandingCapabilityId;
  label: string;
  title: string;
  description: string;
}

export const LANDING_CAPABILITIES: readonly LandingCapability[] = [
  {
    id: 'agenda',
    label: 'Agenda',
    title: 'Agenda e encaixe rápido',
    description: 'Criação, confirmação e conclusão de atendimentos na rotina da unidade.',
  },
  {
    id: 'services',
    label: 'Serviços',
    title: 'Catálogo sob controle',
    description: 'Edição, duplicação, ordenação e desativação consciente dos serviços.',
  },
  {
    id: 'team',
    label: 'Equipe',
    title: 'Equipe, convites e escalas',
    description: 'Convites, jornadas de trabalho e responsabilidades organizados em um só lugar.',
  },
] as const;

