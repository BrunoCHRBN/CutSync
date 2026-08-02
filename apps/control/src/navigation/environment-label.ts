const labels: Record<string, string> = {
  local: 'LOCAL',
  development: 'DESENVOLVIMENTO',
  dev: 'DESENVOLVIMENTO',
  homologation: 'HOMOLOGAÇÃO',
  homolog: 'HOMOLOGAÇÃO',
  staging: 'HOMOLOGAÇÃO',
  production: 'PRODUÇÃO',
  prod: 'PRODUÇÃO',
};

/** Single source for topbar, sidebar footer and shell badges. */
export function getCloudEnvironmentLabel(): string {
  const configured = (
    process.env.EXPO_PUBLIC_CONTROL_ENVIRONMENT
    ?? process.env.EXPO_PUBLIC_APP_ENV
  )?.trim().toLowerCase();

  if (configured) return labels[configured] ?? configured.toUpperCase();
  return process.env.NODE_ENV === 'production' ? 'PRODUÇÃO' : 'DESENVOLVIMENTO';
}
