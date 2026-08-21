/**
 * Router-relative Cloud paths.
 * With experiments.baseUrl "/cloud", static export serves these under /cloud/*.
 * Dev server ignores baseUrl, so the same paths resolve at the origin root.
 */
export const CLOUD_ROUTES = {
  root: '/',
  login: '/login',
  mfa: '/mfa',
  semAcesso: '/sem-acesso',
  central: '/central',
  operacao: {
    root: '/operacao',
    tempoReal: '/operacao/tempo-real',
    saudeDosDados: '/operacao/saude-dos-dados',
    incidentes: '/operacao/incidentes',
  },
  suporte: {
    root: '/suporte',
    atendimentos: '/suporte/atendimentos',
    clientes: '/suporte/clientes',
    monitoramento: '/suporte/monitoramento',
    operacoesAssistidas: '/suporte/operacoes-assistidas',
  },
  gsp: {
    root: '/gsp',
    acessos: '/gsp/acessos',
    solicitarAcesso: '/gsp/acessos/solicitar',
    minhasSolicitacoes: '/gsp/acessos/minhas-solicitacoes',
    aprovacoes: '/gsp/acessos/aprovacoes',
    aplicacao: '/gsp/acessos/aplicacao',
    revisoes: '/gsp/revisoes',
    auditoria: '/gsp/auditoria',
    politicas: '/gsp/politicas',
    conhecimento: '/gsp/conhecimento',
  },
  financeiro: {
    root: '/financeiro',
    cobrancas: '/financeiro/cobrancas',
    assinaturas: '/financeiro/assinaturas',
    movimentacoes: '/financeiro/movimentacoes',
    conciliacao: '/financeiro/conciliacao',
  },
} as const;

export type CloudRoutePath =
  | typeof CLOUD_ROUTES.root
  | typeof CLOUD_ROUTES.login
  | typeof CLOUD_ROUTES.mfa
  | typeof CLOUD_ROUTES.semAcesso
  | typeof CLOUD_ROUTES.central
  | (typeof CLOUD_ROUTES.operacao)[keyof typeof CLOUD_ROUTES.operacao]
  | (typeof CLOUD_ROUTES.suporte)[keyof typeof CLOUD_ROUTES.suporte]
  | (typeof CLOUD_ROUTES.gsp)[keyof typeof CLOUD_ROUTES.gsp]
  | (typeof CLOUD_ROUTES.financeiro)[keyof typeof CLOUD_ROUTES.financeiro];

/** Flat list of every canonical in-app path (without baseUrl prefix). */
export function listCloudRoutePaths(): CloudRoutePath[] {
  return [
    CLOUD_ROUTES.root,
    CLOUD_ROUTES.login,
    CLOUD_ROUTES.mfa,
    CLOUD_ROUTES.semAcesso,
    CLOUD_ROUTES.central,
    ...Object.values(CLOUD_ROUTES.operacao),
    ...Object.values(CLOUD_ROUTES.suporte),
    ...Object.values(CLOUD_ROUTES.gsp),
    ...Object.values(CLOUD_ROUTES.financeiro),
  ];
}

export function isCloudRoutePath(value: string): value is CloudRoutePath {
  return listCloudRoutePaths().includes(value as CloudRoutePath);
}

/** Opaque ticket UUID path for support detail (not a static registry entry). */
export function supportTicketPath(ticketId: string): string {
  return `${CLOUD_ROUTES.suporte.atendimentos}/${ticketId}`;
}
