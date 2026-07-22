import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';

import {
  AuthButton,
  AuthLink,
  AuthNotice,
  AuthPasswordField,
  AuthScreen,
  AuthSecurityNote,
} from '@/components/auth/auth-form';
import { useSession } from '@/contexts/session-context';
import { consumeClientAuthCallback } from '@/lib/auth-deep-link';

type RecoveryState = 'checking' | 'ready' | 'invalid';

export function ClientResetPasswordScreen() {
  const router = useRouter();
  const callbackUrl = Linking.useLinkingURL();
  const consumedUrl = useRef<string | null>(null);
  const { updatePassword } = useSession();
  const [state, setState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callbackUrl || consumedUrl.current === callbackUrl) return;
    consumedUrl.current = callbackUrl;
    setState('checking');

    void consumeClientAuthCallback(callbackUrl, 'recovery')
      .then(() => setState('ready'))
      .catch(() => setState('invalid'));
  }, [callbackUrl]);

  const handleUpdate = async () => {
    Keyboard.dismiss();
    setError(null);
    setIsSubmitting(true);
    const result = await updatePassword(password, confirmation);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace({ pathname: '/(auth)/sign-in', params: { passwordReset: 'success' } });
  };

  return (
    <AuthScreen
      testID="client-reset-password-screen"
      eyebrow="NOVA CREDENCIAL"
      title="Crie uma nova senha."
      description="O link precisa ser válido antes que o Client permita alterar a credencial."
    >
      {state === 'checking' && (
        <AuthNotice testID="client-reset-password-checking" tone="neutral" message="Validando o link de recuperação." />
      )}
      {state === 'invalid' && (
        <>
          <AuthNotice testID="client-reset-password-invalid" message="Este link é inválido, expirou ou já foi utilizado." />
          <AuthButton testID="client-reset-password-new-link" label="Solicitar novo link" onPress={() => router.replace('/(auth)/forgot-password')} />
          <AuthLink testID="client-reset-password-login" label="Voltar para entrar" onPress={() => router.replace('/(auth)/sign-in')} />
        </>
      )}
      {state === 'ready' && (
        <>
          <AuthPasswordField
            testID="client-reset-password-new"
            label="Nova senha"
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!isSubmitting}
            onChangeText={setPassword}
            onUnsafeInput={setError}
            placeholder="Digite uma senha forte"
            returnKeyType="next"
            value={password}
          />
          <AuthPasswordField
            testID="client-reset-password-confirmation"
            label="Confirmar nova senha"
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!isSubmitting}
            onChangeText={setConfirmation}
            onUnsafeInput={setError}
            onSubmitEditing={() => { if (!isSubmitting) void handleUpdate(); }}
            placeholder="Repita a nova senha"
            returnKeyType="done"
            value={confirmation}
          />
          {error && <AuthNotice testID="client-reset-password-error" message={error} />}
          <AuthButton
            testID="client-reset-password-submit"
            label="Salvar nova senha"
            loading={isSubmitting}
            onPress={() => { void handleUpdate(); }}
          />
        </>
      )}
      <AuthSecurityNote>Emojis e conteúdo SVG são rejeitados também nas senhas.</AuthSecurityNote>
    </AuthScreen>
  );
}
