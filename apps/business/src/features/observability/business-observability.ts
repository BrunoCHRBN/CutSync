import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import {
  buildSentryRelease,
  createSanitizedSentryError,
  dropSentryTransaction,
  isSentryDiagnosticEnabled,
  SENTRY_TRACES_SAMPLE_RATE,
  sanitizeCorrelationId,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeSentryRoute,
  sanitizeSentryText,
} from './sentry-sanitization';

const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim() || 'development';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const appSlug = Constants.expoConfig?.slug ?? 'cutsync-business';
const appVersion = Constants.expoConfig?.version ?? 'unknown';
const appBuild = Constants.nativeBuildVersion ?? 'development';
const release = buildSentryRelease(appSlug, appVersion, appBuild);

export interface BusinessObservabilityContext {
  route?: string;
  operation?: string;
  correlationId?: string;
}

export const businessNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  useFullPathsForNavigationRoutes: true,
});

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  release,
  dist: appBuild,
  sendDefaultPii: false,
  tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  tracePropagationTargets: [],
  enableAutoSessionTracking: true,
  integrations: [businessNavigationIntegration],
  beforeBreadcrumb: (breadcrumb) => sanitizeSentryBreadcrumb(breadcrumb),
  beforeSend: (event) => sanitizeSentryEvent(event),
  beforeSendTransaction: dropSentryTransaction,
});

Sentry.setTags({
  'app.environment': environment,
  'app.version': appVersion,
  'app.build': appBuild,
  'app.release': release,
  'app.platform': Platform.OS,
  'expo.update_id': Updates.updateId ?? 'embedded',
  'expo.embedded_update': String(Updates.isEmbeddedLaunch),
  'expo.channel': Updates.channel ?? 'development',
  'expo.runtime_version': Updates.runtimeVersion ?? appVersion,
});

const getErrorType = (error: unknown) => {
  if (error instanceof Error && error.name) return sanitizeSentryText(error.name);
  return typeof error;
};

export const businessObservability = {
  isConfigured: Boolean(dsn),
  diagnosticsEnabled: Boolean(dsn) && isSentryDiagnosticEnabled(environment),
  release,
  setUser: (userId: string | null | undefined) => {
    Sentry.setUser(userId ? { id: userId } : null);
  },
  setRoute: (route: string) => {
    Sentry.setTag('app.route', sanitizeSentryRoute(route));
  },
  captureError: (
    error: unknown,
    code: string,
    context: BusinessObservabilityContext = {},
  ) => {
    Sentry.withScope((scope) => {
      scope.setTag('error.code', code);
      scope.setTag('error.type', getErrorType(error));
      if (context.route) scope.setTag('app.route', sanitizeSentryRoute(context.route));
      if (context.operation) {
        scope.setTag('app.operation', sanitizeSentryText(context.operation));
      }
      const correlationId = sanitizeCorrelationId(context.correlationId);
      if (correlationId) scope.setTag('request.correlation_id', correlationId);
      scope.setFingerprint([code]);
      Sentry.captureException(createSanitizedSentryError(error, code));
    });
  },
  sendDiagnostic: () => {
    Sentry.withScope((scope) => {
      scope.setTag('error.code', 'business_preview_diagnostic');
      scope.setFingerprint(['business_preview_diagnostic']);
      Sentry.captureException(new Error('business_preview_diagnostic'));
    });
  },
};
