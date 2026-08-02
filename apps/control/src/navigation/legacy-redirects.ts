import { CLOUD_ROUTES, type CloudRoutePath } from '@/navigation/cloud-routes';

/** Legacy Control paths (router-relative) → Cloud canonical paths. */
export const LEGACY_REDIRECTS: readonly {
  from: string;
  to: CloudRoutePath;
}[] = [
  { from: '/', to: CLOUD_ROUTES.central },
  { from: '/live', to: CLOUD_ROUTES.operacao.tempoReal },
  { from: '/data-quality', to: CLOUD_ROUTES.operacao.saudeDosDados },
  { from: '/support', to: CLOUD_ROUTES.suporte.root },
  { from: '/governance', to: CLOUD_ROUTES.gsp.root },
  { from: '/knowledge', to: CLOUD_ROUTES.gsp.conhecimento },
  { from: '/access', to: CLOUD_ROUTES.gsp.acessos },
  { from: '/billing', to: CLOUD_ROUTES.financeiro.root },
  { from: '/billing/plans', to: CLOUD_ROUTES.financeiro.assinaturas },
  { from: '/billing/accounts', to: CLOUD_ROUTES.financeiro.cobrancas },
  { from: '/billing/cutovers', to: CLOUD_ROUTES.financeiro.conciliacao },
  { from: '/billing/conflicts', to: CLOUD_ROUTES.financeiro.conciliacao },
] as const;

/** Apex host redirects for the dedicated Cloud Vercel project (include /cloud prefix). */
export const APEX_HOST_REDIRECTS: readonly {
  source: string;
  destination: string;
  permanent: boolean;
}[] = [
  { source: '/login', destination: '/cloud/login', permanent: false },
  { source: '/mfa', destination: '/cloud/mfa', permanent: false },
  { source: '/live', destination: '/cloud/operacao/tempo-real', permanent: false },
  { source: '/data-quality', destination: '/cloud/operacao/saude-dos-dados', permanent: false },
  { source: '/support', destination: '/cloud/suporte', permanent: false },
  { source: '/governance', destination: '/cloud/gsp', permanent: false },
  { source: '/knowledge', destination: '/cloud/gsp/conhecimento', permanent: false },
  { source: '/access', destination: '/cloud/gsp/acessos', permanent: false },
  { source: '/billing', destination: '/cloud/financeiro', permanent: false },
  { source: '/billing/plans', destination: '/cloud/financeiro/assinaturas', permanent: false },
  { source: '/billing/accounts', destination: '/cloud/financeiro/cobrancas', permanent: false },
  { source: '/billing/cutovers', destination: '/cloud/financeiro/conciliacao', permanent: false },
  { source: '/billing/conflicts', destination: '/cloud/financeiro/conciliacao', permanent: false },
] as const;

export function resolveLegacyRedirect(pathname: string): CloudRoutePath | null {
  const normalized = pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
  const match = LEGACY_REDIRECTS.find((entry) => entry.from === normalized);
  return match?.to ?? null;
}
