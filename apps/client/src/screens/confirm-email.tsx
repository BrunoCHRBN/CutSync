import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AuthButton, AuthLink, AuthNotice, AuthScreen, AuthSecurityNote } from '@/components/auth/auth-form';
import { consumeClientAuthCallback } from '@/lib/auth-deep-link';

type ConfirmationState = 'checking' | 'ready' | 'invalid';

export function ClientConfirmEmailScreen() {
  const router = useRouter();
  const callbackUrl = Linking.useLinkingURL();
  const consumedUrl = useRef<string | null>(null);
  const [state, setState] = useState<ConfirmationState>('checking');

  useEffect(() => {
    if (!callbackUrl || consumedUrl.current === callbackUrl) return;
    consumedUrl.current = callbackUrl;
    setState('checking');

    void consumeClientAuthCallback(callbackUrl, 'confirmation')
      .then(() => setState('ready'))
      .catch(() => setState('invalid'));
  }, [callbackUrl]);

  return (
    <AuthScreen
      testID="client-confirm-email-screen"
      eyebrow="CONFIRMAÇÃO DE CONTA"
      title={state === 'ready' ? 'E-mail confirmado.' : 'Validando seu link.'}
      description="O link é verificado com o Supabase antes de liberar o acesso ao Client."
    >
      {state === 'checking' && (
        <AuthNotice testID="client-confirm-email-checking" tone="neutral" message="Aguarde enquanto validamos a confirmação." />
      )}
      {state === 'ready' && (
        <>
          <AuthNotice testID="client-confirm-email-success" tone="success" message="Sua conta está pronta para usar." />
          <AuthButton testID="client-confirm-email-continue" label="Continuar no CutSync" onPress={() => router.replace('/')} />
        </>
      )}
      {state === 'invalid' && (
        <>
          <AuthNotice testID="client-confirm-email-error" message="Este link é inválido, expirou ou já foi utilizado." />
          <AuthButton testID="client-confirm-email-login" label="Voltar para entrar" onPress={() => router.replace('/(auth)/sign-in')} />
          <AuthLink testID="client-confirm-email-register" label="Criar uma nova conta" onPress={() => router.replace('/(auth)/sign-up')} />
        </>
      )}
      <AuthSecurityNote>Tokens recebidos pelo link não são exibidos nem registrados pelo aplicativo.</AuthSecurityNote>
    </AuthScreen>
  );
}
