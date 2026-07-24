const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PHONE_PATTERN = /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-.\s]?\d{4}\b/g;
const URL_QUERY_PATTERN = /([?&](?:token|code|access_token|refresh_token|apikey|key)=)[^&#\s]+/gi;

const ALLOWED_TAGS = new Set([
  'app.environment',
  'app.version',
  'app.build',
  'app.platform',
  'app.route',
  'error.code',
  'expo.update_id',
  'expo.embedded_update',
]);

export const sanitizeSentryText = (value: string) => value
  .replace(JWT_PATTERN, '[token]')
  .replace(URL_QUERY_PATTERN, '$1[redacted]')
  .replace(EMAIL_PATTERN, '[email]')
  .replace(PHONE_PATTERN, '[phone]')
  .replace(UUID_PATTERN, '[id]')
  .slice(0, 500);

type SentryLikeEvent = {
  user?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  request?: unknown;
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: Record<string, unknown>[];
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
        .map(([key, value]) => [key, typeof value === 'string' ? sanitizeSentryText(value) : value]),
    );
  }

  if (sanitizedEvent.message) sanitizedEvent.message = sanitizeSentryText(sanitizedEvent.message);
  if (sanitizedEvent.transaction) sanitizedEvent.transaction = sanitizeSentryText(sanitizedEvent.transaction);

  sanitizedEvent.exception?.values?.forEach((exception) => {
    if (exception.value) exception.value = sanitizeSentryText(exception.value);
    if (exception.type) exception.type = sanitizeSentryText(exception.type);
  });

  sanitizedEvent.breadcrumbs = sanitizedEvent.breadcrumbs?.slice(-30).map((breadcrumb) => ({
    category: typeof breadcrumb.category === 'string'
      ? sanitizeSentryText(breadcrumb.category)
      : undefined,
    level: breadcrumb.level,
    message: typeof breadcrumb.message === 'string'
      ? sanitizeSentryText(breadcrumb.message)
      : undefined,
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
  }));

  return event;
};

export const isSentryDiagnosticEnabled = (environment: string | undefined) => (
  environment === 'development' || environment === 'preview'
);
