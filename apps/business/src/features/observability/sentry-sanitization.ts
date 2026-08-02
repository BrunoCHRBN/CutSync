const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PHONE_PATTERN = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}\b/g;
const CPF_PATTERN = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g;
const URL_QUERY_PATTERN = /([?&](?:token|code|access_token|refresh_token|apikey|key)=)[^&#\s]+/gi;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HEX_TOKEN_SEGMENT_PATTERN = /^[0-9a-f]{64}$/i;
const UUID_SEGMENT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BUSINESS_DYNAMIC_ROUTE_SEGMENTS: Record<string, '[id]' | '[token]'> = {
  appointments: '[id]',
  clients: '[id]',
  invitations: '[id]',
  invites: '[id]',
  invite: '[token]',
};

const ALLOWED_TAGS = new Set([
  'app.environment',
  'app.version',
  'app.build',
  'app.release',
  'app.platform',
  'app.route',
  'app.operation',
  'error.code',
  'error.type',
  'request.correlation_id',
  'expo.update_id',
  'expo.embedded_update',
  'expo.channel',
  'expo.runtime_version',
]);

export const sanitizeSentryText = (value: string) => value
  .replace(JWT_PATTERN, '[token]')
  .replace(URL_QUERY_PATTERN, '$1[redacted]')
  .replace(EMAIL_PATTERN, '[email]')
  .replace(PHONE_PATTERN, '[phone]')
  .replace(CPF_PATTERN, '[cpf]')
  .replace(UUID_PATTERN, '[id]')
  .slice(0, 500);

const routePathFrom = (value: string) => {
  const normalized = value.trim();
  try {
    const parsed = new URL(normalized);
    const customSchemeHost = parsed.protocol !== 'http:' && parsed.protocol !== 'https:'
      ? parsed.hostname
      : '';
    return `${customSchemeHost ? `/${customSchemeHost}` : ''}${parsed.pathname}` || '/';
  } catch {
    return normalized.split(/[?#]/u, 1)[0] ?? '';
  }
};

export const sanitizeSentryRoute = (value: string) => {
  const routePath = routePathFrom(value);
  const segments = routePath.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  const sanitizedSegments = segments.map((segment, index) => {
    if (segment === '[id]' || segment === '[token]' || segment === '[slug]') return segment;
    const previousSegment = segments[index - 1]?.toLowerCase();
    const routePlaceholder = previousSegment
      ? BUSINESS_DYNAMIC_ROUTE_SEGMENTS[previousSegment]
      : undefined;
    if (routePlaceholder) return routePlaceholder;
    if (HEX_TOKEN_SEGMENT_PATTERN.test(segment)) return '[token]';
    if (UUID_SEGMENT_PATTERN.test(segment)) return '[id]';
    return sanitizeSentryText(segment);
  });

  return `/${sanitizedSegments.join('/')}`.slice(0, 500);
};

export const sanitizeCorrelationId = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized && SAFE_CORRELATION_ID.test(normalized) ? normalized : undefined;
};

export const buildSentryRelease = (
  slug: string,
  version: string,
  build: string,
) => `${slug}@${version}+${build}`.slice(0, 200);

export const SENTRY_TRACES_SAMPLE_RATE = 0;

export const dropSentryTransaction = () => null;

export const createSanitizedSentryError = (error: unknown, code: string) => {
  const safeCode = sanitizeSentryText(code) || 'captured_error';
  const capturedError = new Error(safeCode);
  if (!(error instanceof Error)) return capturedError;

  const safeName = sanitizeSentryText(error.name || 'Error') || 'Error';
  const safeFrames = error.stack
    ?.split(/\r?\n/)
    .slice(1)
    .map((frame) => sanitizeSentryText(frame))
    .filter(Boolean)
    .slice(0, 100);

  capturedError.name = safeName;
  if (safeFrames?.length) {
    capturedError.stack = `${safeName}: ${safeCode}\n${safeFrames.join('\n')}`;
  }
  return capturedError;
};

type SentryLikeBreadcrumb = Record<string, unknown>;

type SentryLikeEvent = {
  user?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  request?: unknown;
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: SentryLikeBreadcrumb[];
  message?: string;
  transaction?: string;
  exception?: {
    values?: {
      value?: string;
      type?: string;
      stacktrace?: unknown;
    }[];
  };
};

export const sanitizeSentryBreadcrumb = <T>(breadcrumb: T): T => {
  const target = breadcrumb as SentryLikeBreadcrumb;
  return {
    category: typeof target.category === 'string'
      ? sanitizeSentryText(target.category)
      : undefined,
    level: target.level,
    timestamp: target.timestamp,
    type: target.type,
  } as T;
};

export const sanitizeSentryEvent = <T>(event: T): T => {
  const sanitizedEvent = event as SentryLikeEvent;

  if (sanitizedEvent.user) {
    sanitizedEvent.user = typeof sanitizedEvent.user.id === 'string'
      ? { id: sanitizedEvent.user.id }
      : undefined;
  }

  sanitizedEvent.request = undefined;
  sanitizedEvent.extra = undefined;
  sanitizedEvent.contexts = undefined;

  if (sanitizedEvent.tags) {
    sanitizedEvent.tags = Object.fromEntries(
      Object.entries(sanitizedEvent.tags)
        .filter(([key]) => ALLOWED_TAGS.has(key))
        .flatMap(([key, value]) => {
          if (typeof value !== 'string') return [[key, value]];
          if (key === 'request.correlation_id') {
            const correlationId = sanitizeCorrelationId(value);
            return correlationId ? [[key, correlationId]] : [];
          }
          if (key === 'app.route') return [[key, sanitizeSentryRoute(value)]];
          return [[key, sanitizeSentryText(value)]];
        }),
    );
  }

  if (sanitizedEvent.message) sanitizedEvent.message = 'captured_event';
  if (sanitizedEvent.transaction) {
    sanitizedEvent.transaction = sanitizeSentryText(sanitizedEvent.transaction);
  }

  sanitizedEvent.exception?.values?.forEach((exception) => {
    if (exception.value) exception.value = 'captured_exception';
    if (exception.type) exception.type = sanitizeSentryText(exception.type);
  });

  sanitizedEvent.breadcrumbs = sanitizedEvent.breadcrumbs
    ?.slice(-30)
    .map(sanitizeSentryBreadcrumb);

  return event;
};

export const isSentryDiagnosticEnabled = (environment: string | undefined) => (
  environment === 'development' || environment === 'preview'
);
