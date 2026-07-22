import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { AuthButton, AuthField, AuthLink, AuthNotice, AuthScreen, AuthSecurityNote } from '@/components/auth/auth-form';
import { useSession } from '@/contexts/session-context';

export function ClientForgotPasswordScreen() {
  const router = useRouter();
  const { isConfigured, requestPasswordReset } = useSession();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    Keyboard.dismiss();
    setError(null);
    setIsSubmitting(true);
    const result = await requestPasswordReset(email);
    setIsSubmitting(false);
    if (result.ok) setSent(true);
    else setError(result.message);
  };

  return (
    <AuthScreen
      testID="client-forgot-password-screen"
      eyebrow="RECUPERAÇÃO SEGURA"
      title="Vamos recuperar seu acesso."
      description="Informe o e-mail da conta. Enviaremos um link que retorna diretamente ao Client."
    >
      {sent ? (
        <>
          <AuthNotice
            testID="client-forgot-password-sent"
            tone="success"
            message="Se houver uma conta para este endereço, o link de recuperação chegará em instantes."
          />
          <AuthButton testID="client-forgot-password-login" label="Voltar para entrar" onPress={() => router.replace('/(auth)/sign-in')} />
          <AuthLink testID="client-forgot-password-again" label="Usar outro e-mail" onPress={() => setSent(false)} />
        </>
      ) : (
        <>
          <AuthField
            testID="client-forgot-password-email"
            label="E-mail da conta"
            autoCapitalize="none"
            autoComplete="email"
            editable={!isSubmitting}
            keyboardType="email-address"
            onChangeText={setEmail}
            onUnsafeInput={setError}
            onSubmitEditing={() => { if (!isSubmitting && isConfigured) void handleRequest(); }}
            placeholder="voce@exemplo.com"
            returnKeyType="send"
            value={email}
          />
          {error && <AuthNotice testID="client-forgot-password-error" message={error} />}
          <AuthButton
            testID="client-forgot-password-submit"
            label="Enviar link de recuperação"
            disabled={!isConfigured}
            loading={isSubmitting}
            onPress={() => { void handleRequest(); }}
          />
          <AuthLink testID="client-forgot-password-back" label="Voltar para entrar" onPress={() => router.replace('/(auth)/sign-in')} />
        </>
      )}
      <AuthSecurityNote>Nunca confirmamos se o e-mail está cadastrado e nunca solicitamos sua senha por mensagem.</AuthSecurityNote>
    </AuthScreen>
  );
}
