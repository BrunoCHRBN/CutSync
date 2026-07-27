import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthNotice } from '@/components/auth/auth-notice';
import { AuthScreen } from '@/components/auth/auth-screen';
import {
  consumeBusinessAuthCallback,
  getBusinessAuthCallbackUrlFromParams,
  getBusinessInvitePath,
  type BusinessAuthCallbackRouteParams,
} from '@/lib/business-auth-deep-link';

type ConfirmationPhase = 'verifying' | 'error';

export function ConfirmEmailScreen() {
  const router = useRouter();
  const linkingUrl = Linking.useLinkingURL();
  const params = useLocalSearchParams<BusinessAuthCallbackRouteParams>();
  const [phase, setPhase] = useState<ConfirmationPhase>('verifying');
  const consumedUrl = useRef<string | null>(null);
  const routeUrl = getBusinessAuthCallbackUrlFromParams('confirmation', params);
  const callbackUrl = routeUrl ?? linkingUrl;

  useEffect(() => {
    if (!callbackUrl) {
      setPhase('error');
      return;
    }
    if (consumedUrl.current === callbackUrl) return;
    consumedUrl.current = callbackUrl;
    let active = true;

    setPhase('verifying');
    void consumeBusinessAuthCallback(callbackUrl, 'confirmation')
      .then(({ invitationToken }) => {
        if (!active) return;
        const invitePath = invitationToken
          ? getBusinessInvitePath(invitationToken)
          : null;
        router.replace((invitePath ?? '/') as never);
      })
      .catch(() => {
        if (active) setPhase('error');
      });

    return () => {
      active = false;
    };
  }, [callbackUrl, router]);

  return (
    <AuthScreen
      testID="business-confirm-email-screen"
      eyebrow="CONFIRMAÇÃO DE E-MAIL"
      title={phase === 'verifying' ? 'Confirmando sua conta…' : 'O link não pôde ser confirmado.'}
      description={phase === 'verifying'
        ? 'Aguarde enquanto validamos o link e restauramos sua sessão com segurança.'
        : 'O link pode ter expirado ou já ter sido utilizado.'}
    >
      {phase === 'error' ? (
        <>
          <AuthNotice
            testID="business-confirm-email-error"
            tone="danger"
            message="Solicite um novo convite ou entre caso sua conta já esteja confirmada."
          />
          <AuthButton
            label="Ir para entrar"
            variant="secondary"
            onPress={() => router.replace('/sign-in' as never)}
          />
        </>
      ) : (
        <AuthNotice message="Não feche o aplicativo durante esta verificação." />
      )}
    </AuthScreen>
  );
}
