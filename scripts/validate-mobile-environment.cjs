const fs = require('node:fs');
const path = require('node:path');

const MOBILE_APPS = ['client', 'business'];
const MOBILE_ENVIRONMENTS = ['development', 'preview', 'production'];

const MOBILE_SUPABASE_PROJECTS = Object.freeze({
  development: 'sphbbqdgcreowxzjgibj',
  preview: 'sphbbqdgcreowxzjgibj',
  production: 'hxoenfnszrrgaqxplzmd',
});

const MOBILE_EAS_PROJECTS = Object.freeze({
  client: 'ebed753a-2b13-4fa1-bb73-fc28270c2cec',
  business: 'e7525fdb-a629-40b7-b1e3-b2d043a88fea',
});

const SUPABASE_HOST_PATTERN = /^([a-z0-9]{20})\.supabase\.co$/;

class MobileEnvironmentValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'MobileEnvironmentValidationError';
    this.code = code;
  }
}

const clean = (value) => {
  if (typeof value !== 'string') return undefined;
  return value.trim().split(/[\r\n\t]+/).map((part) => part.trim()).find(Boolean);
};

const getSupabaseProjectRef = (rawUrl) => {
  const value = clean(rawUrl);
  if (!value) throw new MobileEnvironmentValidationError('MOBILE_ENV_URL_MISSING');

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_URL_INVALID');
  }

  const match = parsed.protocol === 'https:' && SUPABASE_HOST_PATTERN.exec(parsed.hostname);
  if (!match || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_URL_INVALID');
  }
  return match[1];
};

const getValidatedPublicKey = ({ publishableKey }) => {
  const publishable = clean(publishableKey);
  if (!publishable) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_PUBLIC_KEY_MISSING');
  }
  if (!publishable.startsWith('sb_publishable_') || publishable.length <= 15) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_PUBLIC_KEY_INVALID');
  }
  return { key: publishable, keyType: 'publishable' };
};

const validateMobileEnvironment = ({
  app,
  environment,
  supabaseUrl,
  publishableKey,
  appEnvironment,
  easProjectId,
}) => {
  if (!MOBILE_APPS.includes(app)) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_APP_INVALID');
  }
  if (!MOBILE_ENVIRONMENTS.includes(environment)) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_NAME_INVALID');
  }

  const normalizedAppEnvironment = clean(appEnvironment);
  if (!normalizedAppEnvironment) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_LABEL_MISSING');
  }
  if (normalizedAppEnvironment !== environment) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_LABEL_MISMATCH');
  }

  const expectedEasProjectId = MOBILE_EAS_PROJECTS[app];
  if (easProjectId !== expectedEasProjectId) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_EAS_PROJECT_MISMATCH');
  }

  const projectRef = getSupabaseProjectRef(supabaseUrl);
  if (projectRef !== MOBILE_SUPABASE_PROJECTS[environment]) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_SUPABASE_PROJECT_MISMATCH');
  }

  const { keyType } = getValidatedPublicKey({ publishableKey });

  return {
    app,
    environment,
    easProjectId,
    projectRef,
    keyType,
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
  const { key } = getValidatedPublicKey({ publishableKey });

  if (typeof fetchImpl !== 'function') {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_REMOTE_CHECK_UNAVAILABLE');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(new URL('auth/v1/settings', url), {
      method: 'GET',
      headers: { apikey: key },
      signal: controller.signal,
    });
  } catch {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_REMOTE_CHECK_FAILED');
  } finally {
    clearTimeout(timeout);
  }

  if (!response?.ok) {
    throw new MobileEnvironmentValidationError('MOBILE_ENV_PUBLIC_KEY_REJECTED');
  }
};

const readArguments = (argv) => {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) continue;
    values[argument.slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
};

const repositoryRoot = path.resolve(__dirname, '..');

const readEasProjectId = (app) => {
  const appJsonPath = path.join(repositoryRoot, 'apps', app, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  return appJson?.expo?.extra?.eas?.projectId;
};

const run = async () => {
  const argumentsByName = readArguments(process.argv.slice(2));
  const app = argumentsByName.app;
  const environment = argumentsByName.environment
    ?? process.env.EAS_BUILD_PROFILE
    ?? process.env.EXPO_PUBLIC_APP_ENV;

  const result = validateMobileEnvironment({
    app,
    environment,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    appEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
    easProjectId: readEasProjectId(app),
  });

  await verifySupabasePublicKey({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  process.stdout.write(
    `Ambiente mobile válido: app=${result.app} environment=${result.environment}`
    + ` supabase=${result.projectRef} easProject=${result.easProjectId}`
    + ` keyType=${result.keyType}\n`,
  );
};

if (require.main === module) {
  run().catch((error) => {
    const code = error instanceof MobileEnvironmentValidationError
      ? error.code
      : 'MOBILE_ENV_VALIDATION_FAILED';
    process.stderr.write(`Validação do ambiente mobile falhou. Código: ${code}.\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MOBILE_APPS,
  MOBILE_EAS_PROJECTS,
  MOBILE_ENVIRONMENTS,
  MOBILE_SUPABASE_PROJECTS,
  MobileEnvironmentValidationError,
  getSupabaseProjectRef,
  validateMobileEnvironment,
  verifySupabasePublicKey,
};
