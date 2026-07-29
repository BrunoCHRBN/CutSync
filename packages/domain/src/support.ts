export const SUPPORT_CATEGORIES = [
  'access_identity',
  'booking',
  'business_operations',
  'billing',
  'marketplace',
  'security_privacy',
  'platform_incident',
  'product_feedback',
  'other',
] as const;

export type SupportCategory = typeof SUPPORT_CATEGORIES[number];

export const SUPPORT_REQUEST_KINDS = ['question', 'request', 'incident'] as const;
export type SupportRequestKind = typeof SUPPORT_REQUEST_KINDS[number];

export const supportRequestKindLabels: Record<SupportRequestKind, string> = {
  question: 'Dúvida',
  request: 'Melhoria',
  incident: 'Incidente',
};

export const supportRequestKindDescriptions: Record<SupportRequestKind, string> = {
  question: 'Preciso de orientação para usar o CutSync.',
  request: 'Quero sugerir uma melhoria ou nova funcionalidade.',
  incident: 'Algo não funciona ou impede a utilização do sistema.',
};

export const CLIENT_SUPPORT_CATEGORIES = [
  'access_identity',
  'booking',
  'marketplace',
  'security_privacy',
  'other',
] as const satisfies readonly SupportCategory[];

export type ClientSupportCategory = typeof CLIENT_SUPPORT_CATEGORIES[number];

export const supportCategoryLabels: Record<SupportCategory, string> = {
  access_identity: 'Acesso e identidade',
  booking: 'Agendamentos',
  business_operations: 'Operação do estabelecimento',
  billing: 'Cobrança CutSync',
  marketplace: 'Descoberta e marketplace',
  security_privacy: 'Segurança e privacidade',
  platform_incident: 'Incidente da plataforma',
  product_feedback: 'Sugestão de produto',
  other: 'Outros',
};

export const supportCategoryDescriptions: Record<ClientSupportCategory, string> = {
  access_identity: 'Login, cadastro, perfil ou recuperação de acesso.',
  booking: 'Problemas relacionados a um atendimento.',
  marketplace: 'Busca, estabelecimentos, serviços ou profissionais.',
  security_privacy: 'Proteção da conta, dados pessoais ou privacidade.',
  other: 'Assuntos que não se encaixam nas opções anteriores.',
};

export const SUPPORT_IMPACTS = ['low', 'normal', 'high', 'critical'] as const;
export type SupportImpact = typeof SUPPORT_IMPACTS[number];

export const supportImpactLabels: Record<SupportImpact, string> = {
  low: 'Baixo',
  normal: 'Normal',
  high: 'Alto',
  critical: 'Crítico',
};

export const supportImpactDescriptions: Record<SupportImpact, string> = {
  low: 'Dúvida ou melhoria sem bloqueio.',
  normal: 'Dificulta o uso, mas existe alternativa.',
  high: 'Bloqueia uma ação importante.',
  critical: 'Risco de segurança ou indisponibilidade ampla.',
};

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type SupportPriority = typeof SUPPORT_PRIORITIES[number];

export const supportPriorityLabels: Record<SupportPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};

export const SUPPORT_TICKET_STATUSES = [
  'queued',
  'open',
  'in_progress',
  'waiting_user',
  'resolved',
  'closed',
  'sync_failed',
] as const;

export type SupportTicketStatus = typeof SUPPORT_TICKET_STATUSES[number];

export const supportTicketStatusLabels: Record<SupportTicketStatus, string> = {
  queued: 'Enviando',
  open: 'Aberto',
  in_progress: 'Em atendimento',
  waiting_user: 'Aguardando sua resposta',
  resolved: 'Resolvido',
  closed: 'Encerrado',
  sync_failed: 'Envio pendente',
};

export const SUPPORT_SYNC_STATUSES = ['pending', 'processing', 'synced', 'failed'] as const;
export type SupportSyncStatus = typeof SUPPORT_SYNC_STATUSES[number];

export const supportSyncStatusLabels: Record<SupportSyncStatus, string> = {
  pending: 'Aguardando envio',
  processing: 'Sincronizando',
  synced: 'Sincronizado',
  failed: 'Falha na sincronização',
};

export const SUPPORT_MESSAGE_AUTHORS = ['requester', 'support', 'system'] as const;
export type SupportMessageAuthor = typeof SUPPORT_MESSAGE_AUTHORS[number];

export const SUPPORT_ESCALATION_LEVELS = [0, 1, 2, 3] as const;
export type SupportEscalationLevel = typeof SUPPORT_ESCALATION_LEVELS[number];

export const supportEscalationLabels: Record<SupportEscalationLevel, string> = {
  0: 'Atendimento normal',
  1: 'Requer atenção',
  2: 'Investigação técnica',
  3: 'Incidente crítico',
};

export const isSupportCategory = (value: string): value is SupportCategory => (
  SUPPORT_CATEGORIES.includes(value as SupportCategory)
);

export const isSupportRequestKind = (value: string): value is SupportRequestKind => (
  SUPPORT_REQUEST_KINDS.includes(value as SupportRequestKind)
);

export const isSupportImpact = (value: string): value is SupportImpact => (
  SUPPORT_IMPACTS.includes(value as SupportImpact)
);

export const isSupportPriority = (value: string): value is SupportPriority => (
  SUPPORT_PRIORITIES.includes(value as SupportPriority)
);

export const isSupportTicketStatus = (value: string): value is SupportTicketStatus => (
  SUPPORT_TICKET_STATUSES.includes(value as SupportTicketStatus)
);

export const isSupportSyncStatus = (value: string): value is SupportSyncStatus => (
  SUPPORT_SYNC_STATUSES.includes(value as SupportSyncStatus)
);

export const isSupportMessageAuthor = (value: string): value is SupportMessageAuthor => (
  SUPPORT_MESSAGE_AUTHORS.includes(value as SupportMessageAuthor)
);

export const formatSupportDateTime = (
  value: string,
  timeZone = 'America/Sao_Paulo',
) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
};

export const createSupportIdempotencyKey = () => {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
};
