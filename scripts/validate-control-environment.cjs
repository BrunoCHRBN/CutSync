const CONTROL_SUPABASE_PROJECTS = Object.freeze({
  homolog: 'sphbbqdgcreowxzjgibj',
  production: 'hxoenfnszrrgaqxplzmd',
});

const CONTROL_ENVIRONMENT_ALIASES = Object.freeze({
  local: 'homolog',
  development: 'homolog',
  dev: 'homolog',
  preview: 'homolog',
  homologation: 'homolog',
  homolog: 'homolog',
  staging: 'homolog',
  production: 'production',
  prod: 'production',
});

const SUPABASE_HOST_PATTERN = /^([a-z0-9]{20})\.supabase\.co$/;

class ControlEnvironmentValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ControlEnvironmentValidationError';
    this.code = code;
  }
}

const clean = (value) => {
  if (typeof value !== 'string') return undefined;
  return value
    .trim()
    .split(/[\r\n\t]+/)
    .map((part) => part.trim())
    .find(Boolean);
};

const resolveControlEnvironment = (rawValue) => {
  const value = clean(rawValue)?.toLowerCase();
  if (!value) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_LABEL_MISSING');
  }

  const environment = CONTROL_ENVIRONMENT_ALIASES[value];
  if (!environment) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_NAME_INVALID');
  }
  return environment;
};

const getSupabaseProjectRef = (rawUrl) => {
  const value = clean(rawUrl);
  if (!value) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_URL_MISSING');
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_URL_INVALID');
  }

  const match = parsed.protocol === 'https:'
    && SUPABASE_HOST_PATTERN.exec(parsed.hostname);
  if (!match || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_URL_INVALID');
  }

  return match[1];
};

const getValidatedPublicKey = (rawKey) => {
  const key = clean(rawKey);
  if (!key) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_PUBLIC_KEY_MISSING');
  }
  if (!key.startsWith('sb_publishable_') || key.length <= 15) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_PUBLIC_KEY_INVALID');
  }
  return key;
};

const validateControlEnvironment = ({
  controlEnvironment,
  appEnvironment,
  supabaseUrl,
  publishableKey,
}) => {
  const configuredControlEnvironment = clean(controlEnvironment);
  const configuredAppEnvironment = clean(appEnvironment);
  if (!configuredControlEnvironment && !configuredAppEnvironment) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_LABEL_MISSING');
  }

  const resolvedControlEnvironment = configuredControlEnvironment
    ? resolveControlEnvironment(configuredControlEnvironment)
    : undefined;
  const resolvedAppEnvironment = configuredAppEnvironment
    ? resolveControlEnvironment(configuredAppEnvironment)
    : undefined;

  if (
    resolvedControlEnvironment
    && resolvedAppEnvironment
    && resolvedControlEnvironment !== resolvedAppEnvironment
  ) {
    throw new ControlEnvironmentValidationError('CONTROL_ENV_LABEL_MISMATCH');
  }

  const environment = resolvedControlEnvironment ?? resolvedAppEnvironment;
  const projectRef = getSupabaseProjectRef(supabaseUrl);
  if (projectRef !== CONTROL_SUPABASE_PROJECTS[environment]) {
    throw new ControlEnvironmentValidationError(
      'CONTROL_ENV_SUPABASE_PROJECT_MISMATCH',
    );
  }

  getValidatedPublicKey(publishableKey);

  return {
    environment,
    projectRef,
    keyType: 'publishable',
  };
};

const verifySupabasePublicKey = async ({
  supabaseUrl,
  publishableKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
}) => {
  const url = clean(supabaseUrl);
  getSupabaseProjectRef(url);
  const key = getValidatedPublicKey(publishableKey);

  if (typeof fetchImpl !== 'function') {
    throw new ControlEnvironmentValidationError(
      'CONTROL_ENV_REMOTE_CHECK_UNAVAILABLE',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(new URL('/auth/v1/settings', url), {
      method: 'GET',
      headers: { apikey: key },
      signal: controller.signal,
    });
  } catch {
    throw new ControlEnvironmentValidationError(
      'CONTROL_ENV_REMOTE_CHECK_FAILED',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response?.ok) {
    throw new ControlEnvironmentValidationError(
      'CONTROL_ENV_PUBLIC_KEY_REJECTED',
    );
  }
};

const run = async () => {
  const result = validateControlEnvironment({
    controlEnvironment: process.env.EXPO_PUBLIC_CONTROL_ENVIRONMENT,
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  await verifySupabasePublicKey({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  process.stdout.write(
    `Ambiente Control válido: environment=${result.environment}`
    + ` supabase=${result.projectRef} keyType=${result.keyType}\n`,
  );
};

if (require.main === module) {
  run().catch((error) => {
    const code = error instanceof ControlEnvironmentValidationError
      ? error.code
      : 'CONTROL_ENV_VALIDATION_FAILED';
    process.stderr.write(
      `Validação do ambiente Control falhou. Código: ${code}.\n`,
    );
    process.exitCode = 1;
  });
}

module.exports = {
  CONTROL_ENVIRONMENT_ALIASES,
  CONTROL_SUPABASE_PROJECTS,
  ControlEnvironmentValidationError,
  getSupabaseProjectRef,
  resolveControlEnvironment,
  validateControlEnvironment,
  verifySupabasePublicKey,
};
