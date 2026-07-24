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
