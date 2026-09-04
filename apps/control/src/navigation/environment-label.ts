const labels: Record<string, string> = {
  local: 'LOCAL',
  development: 'DESENVOLVIMENTO',
  dev: 'DESENVOLVIMENTO',
  preview: 'HOMOLOGAÇÃO',
  homologation: 'HOMOLOGAÇÃO',
  homolog: 'HOMOLOGAÇÃO',
  staging: 'HOMOLOGAÇÃO',
  production: 'PRODUÇÃO',
  prod: 'PRODUÇÃO',
};

type CloudEnvironmentSource = {
  EXPO_PUBLIC_CONTROL_ENVIRONMENT?: string;
  EXPO_PUBLIC_APP_ENV?: string;
  NODE_ENV?: string;
};

export function resolveCloudEnvironmentLabel(
  environment: CloudEnvironmentSource,
): string {
  const configured = (
    environment.EXPO_PUBLIC_CONTROL_ENVIRONMENT
    ?? environment.EXPO_PUBLIC_APP_ENV
  )?.trim().toLowerCase();

  if (configured) return labels[configured] ?? configured.toUpperCase();
  if (environment.NODE_ENV === 'development') return 'DESENVOLVIMENTO';

  // NODE_ENV=production only describes the optimized bundle. It must never be
  // treated as evidence that the app is connected to the production backend.
  return 'NÃO CONFIGURADO';
}

/** Single source for topbar, sidebar footer and shell badges. */
export function getCloudEnvironmentLabel(): string {
  return resolveCloudEnvironmentLabel({
    EXPO_PUBLIC_CONTROL_ENVIRONMENT:
      process.env.EXPO_PUBLIC_CONTROL_ENVIRONMENT,
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });
}
