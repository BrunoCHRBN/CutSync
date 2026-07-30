const homologProjectRef = 'sphbbqdgcreowxzjgibj';
const productionProjectRef = 'hxoenfnszrrgaqxplzmd';
const supportedProjectRefs = new Set([homologProjectRef, productionProjectRef]);
const expectedProjectRef = process.argv[2];
const skipEdge = process.argv.includes('--skip-edge');
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const fail = (code) => {
  throw new Error(code);
};

if (!expectedProjectRef || !supportedProjectRefs.has(expectedProjectRef)) {
  fail('PUBLIC_SMOKE_EXPECTED_PROJECT_INVALID');
}
if (skipEdge && expectedProjectRef !== productionProjectRef) {
  fail('PUBLIC_SMOKE_EDGE_SKIP_NOT_ALLOWED');
}
if (!supabaseUrl) {
  fail('PUBLIC_SMOKE_SUPABASE_URL_MISSING');
}
if (!publishableKey?.startsWith('sb_publishable_')) {
  fail('PUBLIC_SMOKE_PUBLISHABLE_KEY_INVALID');
}

const parsedUrl = new URL(supabaseUrl);
const actualProjectRef = parsedUrl.hostname.split('.')[0];
if (
  parsedUrl.protocol !== 'https:'
  || parsedUrl.hostname !== `${expectedProjectRef}.supabase.co`
  || actualProjectRef !== expectedProjectRef
) {
  fail('PUBLIC_SMOKE_PROJECT_MISMATCH');
}

const request = async (path, init = {}) => {
  const response = await fetch(new URL(path, parsedUrl), {
    ...init,
    headers: {
      apikey: publishableKey,
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  return response;
};

const readErrorCode = async (response) => {
  try {
    const payload = await response.json();
    const value = payload?.error ?? payload?.code;
    return typeof value === 'string' && /^[a-z0-9_]+$/.test(value)
      ? value
      : 'unknown';
  } catch {
    return 'unknown';
  }
};

const run = async () => {
  const [authResponse, restResponse, functionResponse] = await Promise.all([
    request('/auth/v1/settings'),
    request('/rest/v1/establishments?select=id&limit=1'),
    skipEdge
      ? Promise.resolve(null)
      : request('/functions/v1/submit-business-registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
  ]);

  const functionError = functionResponse
    ? await readErrorCode(functionResponse)
    : 'skipped';
  const result = {
    projectRef: actualProjectRef,
    keyType: 'publishable',
    authStatus: authResponse.status,
    restStatus: restResponse.status,
    functionStatus: functionResponse?.status ?? 'skipped',
    functionError,
  };

  console.log(
    'Smoke público Supabase:',
    Object.entries(result)
      .map(([name, value]) => `${name}=${value}`)
      .join(' '),
  );

  if (authResponse.status !== 200) {
    fail('PUBLIC_SMOKE_AUTH_FAILED');
  }
  if (restResponse.status !== 200) {
    fail('PUBLIC_SMOKE_REST_FAILED');
  }
  if (
    functionResponse
    && (
      functionResponse.status !== 401
      || functionError !== 'authentication_required'
    )
  ) {
    fail('PUBLIC_SMOKE_EDGE_AUTHORIZATION_FAILED');
  }
};

run().catch((error) => {
  const code = error instanceof Error ? error.message : 'PUBLIC_SMOKE_FAILED';
  console.error(code);
  process.exitCode = 1;
});
