import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import {
  AuthButton,
  AuthField,
  AuthLink,
  AuthNotice,
  AuthPasswordField,
  AuthScreen,
  AuthSecurityNote,
} from '@/components/auth/auth-form';
import { useSession } from '@/contexts/session-context';

export function ClientSignInScreen() {
  const router = useRouter();
  const { passwordReset } = useLocalSearchParams<{ passwordReset?: string }>();
  const { bootstrapError, isConfigured, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(bootstrapError);

  const handleSignIn = async () => {
    Keyboard.dismiss();
    setError(null);
    setIsSubmitting(true);
    const result = await signIn(email, password);
    if (!result.ok) setError(result.message);
    setIsSubmitting(false);
  };

  const disabled = isSubmitting || !isConfigured;

  return (
    <AuthScreen
      testID="client-sign-in-screen"
      eyebrow="SEU HORÁRIO COMEÇA AQUI"
      title="Bom ter você de volta."
      description="Entre para encontrar seus lugares favoritos e cuidar dos próximos agendamentos."
    >
      {!isConfigured && (
        <AuthNotice
          testID="client-auth-config-message"
          tone="neutral"
          message="O aplicativo ainda não está conectado ao ambiente CutSync."
        />
      )}
      {passwordReset === 'success' && (
        <AuthNotice testID="client-password-reset-success" tone="success" message="Senha alterada. Entre novamente com a nova credencial." />
      )}
      <AuthField
        testID="client-sign-in-email"
        label="E-mail"
        autoCapitalize="none"
        autoComplete="email"
        editable={!isSubmitting}
        keyboardType="email-address"
        onChangeText={setEmail}
        onUnsafeInput={setError}
        placeholder="voce@exemplo.com"
        returnKeyType="next"
        value={email}
      />
      <AuthPasswordField
        testID="client-sign-in-password"
        label="Senha"
        autoCapitalize="none"
        autoComplete="current-password"
        editable={!isSubmitting}
        onChangeText={setPassword}
        onUnsafeInput={setError}
        onSubmitEditing={() => { if (!disabled) void handleSignIn(); }}
        placeholder="Digite sua senha"
        returnKeyType="done"
        value={password}
      />
      <AuthLink testID="client-forgot-password-link" label="Esqueci minha senha" onPress={() => router.push('/(auth)/forgot-password')} />
      {error && <AuthNotice testID="client-sign-in-error" message={error} />}
      <AuthButton
        testID="client-sign-in-submit"
        label="Entrar no CutSync"
        disabled={disabled}
        loading={isSubmitting}
        onPress={() => { void handleSignIn(); }}
      />
      <AuthLink testID="client-sign-up-link" label="Ainda não possui uma conta? Criar conta" onPress={() => router.push('/(auth)/sign-up')} />
      <AuthSecurityNote>Emojis, HTML e SVG não são aceitos nos campos de acesso.</AuthSecurityNote>
    </AuthScreen>
  );
}
