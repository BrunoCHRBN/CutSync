import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthField } from '@/components/auth/auth-field';
import { AuthNotice } from '@/components/auth/auth-notice';
import { AuthScreen } from '@/components/auth/auth-screen';
import { useBusinessSession } from '@/contexts/business-session';
import {
  getBusinessInvitationTokenFromRedirect,
  getSafeBusinessAuthRedirect,
} from '@/lib/business-auth-deep-link';

interface ForgotPasswordScreenProps {
  redirect?: string | string[];
}

export function ForgotPasswordScreen({ redirect }: ForgotPasswordScreenProps) {
  const router = useRouter();
  const { isConfigured, requestPasswordReset } = useBusinessSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeRedirect = getSafeBusinessAuthRedirect(redirect);
  const invitationToken = getBusinessInvitationTokenFromRedirect(redirect);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email, invitationToken ?? undefined);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthScreen
      testID="business-forgot-password-screen"
      eyebrow="RECUPERAÇÃO SEGURA"
      title="Recupere seu acesso."
      description="Enviaremos um link de uso único para o e-mail da sua conta."
      footer={(
        <AuthButton
          label="Voltar para entrar"
          variant="text"
          onPress={() => router.replace({
            pathname: '/sign-in',
            params: safeRedirect === '/' ? {} : { redirect: safeRedirect },
          } as never)}
        />
      )}
    >
      {sent ? (
        <>
          <AuthNotice
            testID="business-password-reset-sent"
            tone="success"
            message="Se o e-mail estiver cadastrado, você receberá as instruções de recuperação."
          />
          <AuthButton
            label="Reenviar"
            variant="secondary"
            busy={busy}
            onPress={() => void submit()}
          />
        </>
      ) : (
        <>
          {!isConfigured ? (
            <AuthNotice message="Este ambiente ainda não está configurado." tone="danger" />
          ) : null}
          {error ? (
            <AuthNotice testID="business-forgot-password-error" message={error} tone="danger" />
          ) : null}
          <AuthField
            testID="business-forgot-password-email"
            label="E-mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="voce@exemplo.com"
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          <AuthButton
            testID="business-forgot-password-submit"
            label="Enviar recuperação"
            busy={busy}
            disabled={!isConfigured}
            onPress={() => void submit()}
          />
        </>
      )}
    </AuthScreen>
  );
}
