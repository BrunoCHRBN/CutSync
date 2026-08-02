import type {
  EstablishmentClientConsentStatus,
  EstablishmentClientLinkStatus,
  EstablishmentClientStatus,
} from '@cutsync/database';

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

export const CONSENT_OPTIONS: EstablishmentClientConsentStatus[] = [
  'unknown',
  'granted',
  'revoked',
];

export const linkPillTone = (
  status: EstablishmentClientLinkStatus,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  if (status === 'confirmed') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'neutral';
};

export const statusPillTone = (
  status: EstablishmentClientStatus,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  if (status === 'active') return 'success';
  if (status === 'archived') return 'warning';
  return 'neutral';
};

/** Recurrence summary from visit aggregates already returned by the RPC. */
export const describeClientRecurrence = (input: {
  appointmentCount: number;
  firstAppointmentAt: string | null;
  lastAppointmentAt: string | null;
  timeZone?: string;
}) => {
  if (input.appointmentCount <= 0) {
    return {
      label: 'Sem atendimentos',
      detail: 'Nenhuma visita vinculada a este cadastro.',
    };
  }

  const format = (value: string) => new Date(value).toLocaleDateString('pt-BR', {
    timeZone: input.timeZone,
  });
  const first = input.firstAppointmentAt ? format(input.firstAppointmentAt) : null;
  const last = input.lastAppointmentAt ? format(input.lastAppointmentAt) : null;
  const range = first && last && first !== last
    ? `${first} → ${last}`
    : first || last || null;

  if (input.appointmentCount === 1) {
    return {
      label: '1 atendimento',
      detail: range ? `Única visita em ${range}.` : 'Uma visita registrada.',
    };
  }

  return {
    label: `${input.appointmentCount} atendimentos`,
    detail: range
      ? `Cliente recorrente · ${range}.`
      : 'Cliente com mais de um atendimento vinculado.',
  };
};
