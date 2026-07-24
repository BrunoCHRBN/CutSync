import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import {
  isSentryDiagnosticEnabled,
  sanitizeSentryEvent,
} from './sentry-sanitization';

const environment = process.env.EXPO_PUBLIC_APP_ENV?.trim() || 'development';
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
const appVersion = Constants.expoConfig?.version ?? 'unknown';
const appBuild = Constants.nativeBuildVersion ?? 'development';

export const clientNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  useFullPathsForNavigationRoutes: true,
});

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment,
  sendDefaultPii: false,
  tracesSampleRate: environment === 'production' ? 0.1 : 1,
  enableAutoSessionTracking: true,
  integrations: [clientNavigationIntegration],
  beforeSend: (event) => sanitizeSentryEvent(event),
});

Sentry.setTags({
  'app.environment': environment,
  'app.version': appVersion,
  'app.build': appBuild,
  'app.platform': Platform.OS,
  'expo.update_id': Updates.updateId ?? 'embedded',
  'expo.embedded_update': String(Updates.isEmbeddedLaunch),
});

export const clientObservability = {
  isConfigured: Boolean(dsn),
  diagnosticsEnabled: Boolean(dsn) && isSentryDiagnosticEnabled(environment),
  setUser: (userId: string | null | undefined) => {
    Sentry.setUser(userId ? { id: userId } : null);
  },
  setRoute: (route: string) => {
    Sentry.setTag('app.route', route);
  },
  captureError: (error: unknown, code: string, route?: string) => {
    Sentry.withScope((scope) => {
      scope.setTag('error.code', code);
      if (route) scope.setTag('app.route', route);
      scope.setFingerprint([code]);
      Sentry.captureException(error instanceof Error ? error : new Error(code));
    });
  },
  sendDiagnostic: () => {
    Sentry.withScope((scope) => {
      scope.setTag('error.code', 'client_preview_diagnostic');
      scope.setFingerprint(['client_preview_diagnostic']);
      Sentry.captureException(new Error('client_preview_diagnostic'));
    });
  },
};
