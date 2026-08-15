import { Redirect, useRouter } from 'expo-router';
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

interface SignInScreenProps {
  redirect?: string | string[];
}

export function SignInScreen({ redirect }: SignInScreenProps) {
  const router = useRouter();
  const {
    session,
    isLoading,
    isConfigured,
    bootstrapError,
    signIn,
  } = useBusinessSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const safeRedirect = getSafeBusinessAuthRedirect(redirect);
  const invitationToken = getBusinessInvitationTokenFromRedirect(redirect);

  if (!isLoading && session) {
    return <Redirect href={safeRedirect as never} />;
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace(safeRedirect as never);
  };

  const openForgotPassword = () => {
    router.push({
      pathname: '/forgot-password',
      params: safeRedirect !== '/' ? { redirect: safeRedirect } : {},
    } as never);
  };

  const openInviteSignUp = () => {
    router.push({
      pathname: '/sign-up',
      params: { redirect: safeRedirect },
    } as never);
  };

  return (
    <AuthScreen
      testID="business-sign-in-screen"
      eyebrow="CUTSYNC BUSINESS"
      title="Sua rotina começa aqui."
      description="Acesse a agenda, sua equipe e os atendimentos do dia."
      footer={(
        <>
          <AuthButton
            testID="business-sign-in-forgot-password"
            label="Esqueci minha senha"
            variant="text"
            onPress={openForgotPassword}
          />
          {invitationToken ? (
            <AuthButton
              testID="business-sign-in-invite-sign-up"
              label="Criar conta com este convite"
              variant="text"
              onPress={openInviteSignUp}
            />
          ) : null}
        </>
      )}
    >
      {!isConfigured ? (
        <AuthNotice message="Este ambiente ainda não está configurado." tone="danger" />
      ) : null}
      {bootstrapError ? <AuthNotice message={bootstrapError} tone="danger" /> : null}
      {error ? <AuthNotice testID="business-sign-in-error" message={error} tone="danger" /> : null}
      <AuthField
        testID="business-sign-in-email"
        label="E-mail"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="voce@exemplo.com"
        returnKeyType="next"
      />
      <AuthField
        testID="business-sign-in-password"
        label="Senha"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        placeholder="Sua senha"
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <AuthButton
        testID="business-sign-in-submit"
        label={isLoading ? 'Restaurando sessão…' : 'Entrar'}
        busy={busy || isLoading}
        disabled={!isConfigured || !email.trim() || !password}
        onPress={() => void submit()}
      />
    </AuthScreen>
  );
}
