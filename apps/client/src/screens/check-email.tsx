import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthButton, AuthLink, AuthNotice, AuthScreen, AuthSecurityNote } from '@/components/auth/auth-form';
import { useSession } from '@/contexts/session-context';

export function ClientCheckEmailScreen() {
  const router = useRouter();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { resendConfirmation } = useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    setMessage(null);
    setError(null);
    setIsSubmitting(true);
    const result = await resendConfirmation(email);
    setIsSubmitting(false);
    if (result.ok) setMessage('Se o cadastro estiver aguardando confirmação, um novo e-mail será enviado.');
    else setError(result.message);
  };

  return (
    <AuthScreen
      testID="client-check-email-screen"
      eyebrow="CONFIRME SEU E-MAIL"
      title="Falta só confirmar."
      description="Enviamos um link para o endereço informado. Abra-o no mesmo dispositivo para voltar ao CutSync."
    >
      <AuthNotice
        testID="client-check-email-address"
        tone="neutral"
        message={email ? `Verifique a caixa de entrada de ${email}.` : 'Verifique a caixa de entrada do e-mail informado.'}
      />
      {message && <AuthNotice testID="client-check-email-success" tone="success" message={message} />}
      {error && <AuthNotice testID="client-check-email-error" message={error} />}
      <AuthButton
        testID="client-check-email-resend"
        label="Enviar confirmação novamente"
        disabled={!email}
        loading={isSubmitting}
        onPress={() => { void handleResend(); }}
      />
      <AuthLink testID="client-check-email-login" label="Voltar para entrar" onPress={() => router.replace('/(auth)/sign-in')} />
      <AuthSecurityNote>Por segurança, o aplicativo não revela se um endereço já possui conta.</AuthSecurityNote>
    </AuthScreen>
  );
}
