import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthField } from '@/components/auth/auth-field';
import { AuthNotice } from '@/components/auth/auth-notice';
import { AuthScreen } from '@/components/auth/auth-screen';
import { useBusinessSession } from '@/contexts/business-session';
import {
  consumeBusinessAuthCallback,
  getBusinessAuthCallbackUrlFromParams,
  getBusinessInvitePath,
  type BusinessAuthCallbackRouteParams,
} from '@/lib/business-auth-deep-link';

type ResetPhase = 'verifying' | 'ready' | 'error';

export function ResetPasswordScreen() {
  const router = useRouter();
  const linkingUrl = Linking.useLinkingURL();
  const params = useLocalSearchParams<BusinessAuthCallbackRouteParams>();
  const { updatePassword } = useBusinessSession();
  const [phase, setPhase] = useState<ResetPhase>('verifying');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const consumedUrl = useRef<string | null>(null);
  const routeUrl = getBusinessAuthCallbackUrlFromParams('recovery', params);
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
    void consumeBusinessAuthCallback(callbackUrl, 'recovery')
      .then((result) => {
        if (!active) return;
        setInvitationToken(result.invitationToken);
        setPhase('ready');
      })
      .catch(() => {
        if (active) setPhase('error');
      });

    return () => {
      active = false;
    };
  }, [callbackUrl]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await updatePassword(password, confirmation);
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    const invitePath = invitationToken
      ? getBusinessInvitePath(invitationToken)
      : null;
    router.replace({
      pathname: '/sign-in',
      params: invitePath ? { redirect: invitePath } : {},
    } as never);
  };

  return (
    <AuthScreen
      testID="business-reset-password-screen"
      eyebrow="NOVA SENHA"
      title={phase === 'verifying' ? 'Validando o link…' : 'Defina uma nova senha.'}
      description={phase === 'ready'
        ? 'Ao concluir, sua sessão de recuperação será encerrada e você poderá entrar novamente.'
        : 'Este acesso é temporário e só pode ser usado para alterar sua senha.'}
    >
      {phase === 'verifying' ? (
        <AuthNotice message="Aguarde enquanto verificamos a recuperação." />
      ) : null}
      {phase === 'error' ? (
        <>
          <AuthNotice
            testID="business-reset-password-link-error"
            tone="danger"
            message="Este link expirou ou já foi utilizado. Solicite uma nova recuperação."
          />
          <AuthButton
            label="Solicitar novo link"
            variant="secondary"
            onPress={() => router.replace('/forgot-password' as never)}
          />
        </>
      ) : null}
      {phase === 'ready' ? (
        <>
          {error ? (
            <AuthNotice testID="business-reset-password-error" message={error} tone="danger" />
          ) : null}
          <AuthField
            testID="business-reset-password"
            label="Nova senha"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="Crie uma senha forte"
            secureTextEntry
          />
          <AuthField
            testID="business-reset-password-confirmation"
            label="Confirmar nova senha"
            value={confirmation}
            onChangeText={setConfirmation}
            autoCapitalize="none"
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          <AuthNotice
            message="Use 8 ou mais caracteres, com maiúscula, minúscula, número e símbolo."
          />
          <AuthButton
            testID="business-reset-password-submit"
            label="Salvar nova senha"
            busy={busy}
            onPress={() => void submit()}
          />
        </>
      ) : null}
    </AuthScreen>
  );
}
