import type {
  EstablishmentClient,
  EstablishmentClientConsentStatus,
  EstablishmentClientDetail,
  EstablishmentClientLinkStatus,
  EstablishmentClientStatus,
} from '@cutsync/database';

export type {
  EstablishmentClient,
  EstablishmentClientConsentStatus,
  EstablishmentClientDetail,
  EstablishmentClientLinkStatus,
  EstablishmentClientStatus,
};

export type DuplicateConfidence = 'high' | 'medium' | 'low';

export interface DuplicateSuggestion {
  client: EstablishmentClient;
  confidence: DuplicateConfidence;
  reason: string;
}

export interface EstablishmentClientFormValues {
  name: string;
  phone: string;
  email: string;
  tags: string;
  notes: string;
  marketingConsentStatus: EstablishmentClientConsentStatus;
}

export const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  walk_in: 'Balcão',
  client_booking: 'Agendamento',
  import: 'Importação',
};

export const STATUS_LABELS: Record<EstablishmentClientStatus, string> = {
  active: 'Ativo',
  archived: 'Arquivado',
  merged: 'Unificado',
};

export const CONSENT_LABELS: Record<EstablishmentClientConsentStatus, string> = {
  unknown: 'Sem evidência',
  granted: 'Autorizado',
  revoked: 'Revogado',
};

export const LINK_LABELS: Record<EstablishmentClientLinkStatus, string> = {
  unlinked: 'Sem vínculo',
  pending: 'Vínculo pendente',
  confirmed: 'Conta CutSync',
  rejected: 'Vínculo recusado',
};

export const CONFIDENCE_LABELS: Record<DuplicateConfidence, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Aguardando confirmação',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

export const LINK_MATCH_LABELS: Record<string, string> = {
  phone: 'Telefone',
  email: 'E-mail',
  manual: 'Manual',
  self_claim: 'Solicitação do cliente',
};

export const maskProfileId = (profileId: string) => {
  if (profileId.length <= 10) return `${profileId.slice(0, 4)}…`;
  return `${profileId.slice(0, 4)}…${profileId.slice(-4)}`;
};
