const CANCELLATION_REASON_LABELS: Readonly<Record<string, string>> = {
  client_transport: 'Problema com transporte',
  client_health: 'Questão de saúde',
  client_reschedule: 'Cliente precisou reagendar',
  client_requested: 'Cancelamento solicitado pelo cliente',
  professional_unavailable: 'Profissional indisponível',
  establishment_request: 'Cancelamento solicitado pelo estabelecimento',
  no_show: 'Cliente não compareceu',
};

const UX_TERM_LABELS: Readonly<Record<string, string>> = {
  lgpd_safe: 'Privacidade e proteção de dados',
  geodecisions: 'Regras de localização e atendimento',
  production_realized: 'Produção realizada',
  revenue_received: 'Receita recebida',
  saas_billing: 'Cobrança da plataforma',
};

export function cancellationReasonLabel(code?: string | null): string {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return 'Motivo não informado';
  return CANCELLATION_REASON_LABELS[normalized] ?? 'Outro motivo';
}

export function uxTermLabel(code?: string | null): string {
  const normalized = code?.trim().toLowerCase();
  if (!normalized) return '';
  return UX_TERM_LABELS[normalized] ?? normalized.replace(/[_-]+/g, ' ');
}

export const UX_COPY = {
  productionIsNotCash: 'Produção realizada não representa dinheiro recebido, saldo em caixa ou lucro.',
  unavailableTitle: 'Vamos encontrar outra opção',
  unavailableDescription: 'Tente a próxima data disponível ou amplie a busca para qualquer profissional.',
  staleContent: 'Você está vendo a última atualização disponível.',
  sessionExpired: 'Sua sessão expirou. Entre novamente para continuar com segurança.',
} as const;
