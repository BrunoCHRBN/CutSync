import { useRouter } from 'expo-router';

import { AuthButton } from '@/components/auth/auth-button';
import { AuthNotice } from '@/components/auth/auth-notice';
import { AuthScreen } from '@/components/auth/auth-screen';
import { getSafeBusinessAuthRedirect } from '@/lib/business-auth-deep-link';

interface CheckEmailScreenProps {
  redirect?: string | string[];
}

export function CheckEmailScreen({ redirect }: CheckEmailScreenProps) {
  const router = useRouter();
  const safeRedirect = getSafeBusinessAuthRedirect(redirect);

  return (
    <AuthScreen
      testID="business-check-email-screen"
      eyebrow="CONFIRMAÇÃO DE E-MAIL"
      title="Confira sua caixa de entrada."
      description="Abra o link no mesmo dispositivo para confirmar a conta e continuar o aceite do convite."
    >
      <AuthNotice
        tone="success"
        message="O convite permanece protegido até você confirmar o e-mail e aceitar o vínculo."
      />
      <AuthButton
        label="Já confirmei. Entrar"
        variant="secondary"
        onPress={() => router.replace({
          pathname: '/sign-in',
          params: safeRedirect === '/' ? {} : { redirect: safeRedirect },
        } as never)}
      />
    </AuthScreen>
  );
}
