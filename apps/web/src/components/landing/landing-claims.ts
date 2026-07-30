import { LandingEvent } from './landing-analytics';

export interface LandingClaimCandidate {
  id: 'booking_speed' | 'message_reduction' | 'registration_conversion' | 'schedule_occupancy';
  proposedClaim: string;
  baselineEvent: LandingEvent['name'];
  metric: string;
  baselineWindowDays: 30;
  publicationCriterion: string;
}

export const LANDING_CLAIM_CANDIDATES: readonly LandingClaimCandidate[] = [
  {
    id: 'booking_speed',
    proposedClaim: 'Agendamento concluído em poucos minutos',
    baselineEvent: 'booking_started',
    metric: 'Tempo entre booking_started e confirmação do agendamento',
    baselineWindowDays: 30,
    publicationCriterion: 'Mediana comprovada em produção e amostra mínima definida antes do experimento',
  },
  {
    id: 'message_reduction',
    proposedClaim: 'Menos dependência de mensagens para agendar',
    baselineEvent: 'booking_started',
    metric: 'Participação dos agendamentos iniciados pela vitrine pública',
    baselineWindowDays: 30,
    publicationCriterion: 'Origem do agendamento mensurável e comparação aprovada com período anterior',
  },
  {
    id: 'registration_conversion',
    proposedClaim: 'Comece a organizar seu estabelecimento pelo CutSync',
    baselineEvent: 'registration_started',
    metric: 'Conversão de registration_started para cadastro concluído',
    baselineWindowDays: 30,
    publicationCriterion: 'Funil completo instrumentado, sem dados pessoais no payload',
  },
  {
    id: 'schedule_occupancy',
    proposedClaim: 'Ajude sua equipe a ocupar melhor a agenda',
    baselineEvent: 'landing_viewed',
    metric: 'Ocupação antes e depois da adoção, controlada por estabelecimento',
    baselineWindowDays: 30,
    publicationCriterion: 'Relação observada sem atribuir causalidade não comprovada',
  },
] as const;

export type LandingAvailabilityState = 'available' | 'validating';

export interface LandingAvailabilityItem {
  id: string;
  audience: 'client' | 'business' | 'shared';
  state: LandingAvailabilityState;
  title: string;
  description: string;
  claimId?: LandingClaimCandidate['id'];
}

/** Registro público de disponibilidade: alimenta a seção de transparência das landings. */
export const LANDING_AVAILABILITY: readonly LandingAvailabilityItem[] = [
  {
    id: 'public_discovery',
    audience: 'shared',
    state: 'available',
    title: 'Descoberta pública sem cadastro',
    description: 'Busca de estabelecimentos e serviços publicados, direto no navegador.',
  },
  {
    id: 'booking_flow',
    audience: 'client',
    state: 'available',
    title: 'Agendamento com confirmação',
    description: 'Escolha de serviço, profissional e horário, com confirmação após o acesso à conta.',
  },
  {
    id: 'appointment_management',
    audience: 'client',
    state: 'available',
    title: 'Gestão dos próprios compromissos',
    description: 'Consulta, remarcação e cancelamento conforme as regras da unidade.',
  },
  {
    id: 'operational_agenda',
    audience: 'business',
    state: 'available',
    title: 'Agenda operacional da unidade',
    description: 'Criação, confirmação, remarcação e conclusão de atendimentos.',
  },
  {
    id: 'catalog_team',
    audience: 'business',
    state: 'available',
    title: 'Catálogo de serviços e equipe',
    description: 'Serviços com preço e duração, convites, jornadas e responsabilidades.',
  },
  {
    id: 'professional_routine',
    audience: 'business',
    state: 'available',
    title: 'Rotina do profissional',
    description: 'Agenda pessoal do dia, próximo atendimento e conclusão do serviço.',
  },
  {
    id: 'booking_speed_metric',
    audience: 'shared',
    state: 'validating',
    title: 'Tempo típico até concluir um agendamento',
    description: 'Métrica em observação; nenhum número é publicado antes da amostra aprovada.',
    claimId: 'booking_speed',
  },
  {
    id: 'message_reduction_metric',
    audience: 'shared',
    state: 'validating',
    title: 'Redução da dependência de mensagens',
    description: 'Comparação em estudo entre agendamentos pela vitrine e atendimentos negociados por conversa.',
    claimId: 'message_reduction',
  },
  {
    id: 'occupancy_metric',
    audience: 'business',
    state: 'validating',
    title: 'Efeito na ocupação da agenda',
    description: 'Relação observada por estabelecimento, sem atribuição de causalidade.',
    claimId: 'schedule_occupancy',
  },
  {
    id: 'live_status_page',
    audience: 'shared',
    state: 'validating',
    title: 'Status operacional ao vivo',
    description: 'Só será exibido quando existir monitoramento próprio confiável do CutSync.',
  },
  {
    id: 'public_testimonials',
    audience: 'shared',
    state: 'validating',
    title: 'Depoimentos de clientes',
    description: 'Permanecem ocultos até existir autorização editorial registrada.',
  },
] as const;