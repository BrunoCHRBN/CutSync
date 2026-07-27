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

interface InviteSignUpScreenProps {
  redirect?: string | string[];
}

export function InviteSignUpScreen({ redirect }: InviteSignUpScreenProps) {
  const router = useRouter();
  const {
    session,
    isLoading,
    isConfigured,
    signUpFromInvite,
  } = useBusinessSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitationToken = getBusinessInvitationTokenFromRedirect(redirect);
  const safeRedirect = getSafeBusinessAuthRedirect(redirect);

  if (!isLoading && session && invitationToken) {
    return <Redirect href={safeRedirect as never} />;
  }

  const submit = async () => {
    if (!invitationToken) return;

    setBusy(true);
    setError(null);
    const result = await signUpFromInvite(
      name,
      email,
      password,
      confirmation,
      invitationToken,
    );
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.confirmationRequired) {
      router.replace({
        pathname: '/check-email',
        params: { redirect: safeRedirect },
      } as never);
      return;
    }
    router.replace(safeRedirect as never);
  };

  if (!invitationToken) {
    return (
      <AuthScreen
        testID="business-invite-sign-up-invalid"
        eyebrow="CADASTRO PROTEGIDO"
        title="É necessário um convite."
        description="O cadastro no CutSync Business começa por um convite pessoal enviado pela unidade."
      >
        <AuthNotice
          tone="danger"
          message="Este link de convite é inválido ou não está mais disponível."
        />
        <AuthButton
          label="Voltar para entrar"
          variant="secondary"
          onPress={() => router.replace('/sign-in' as never)}
        />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      testID="business-invite-sign-up-screen"
      eyebrow="CADASTRO POR CONVITE"
      title="Crie sua conta operacional."
      description="Use exatamente o e-mail que recebeu o convite. O vínculo só será liberado depois da confirmação."
      footer={(
        <AuthButton
          label="Já tenho conta"
          variant="text"
          onPress={() => router.replace({
            pathname: '/sign-in',
            params: { redirect: safeRedirect },
          } as never)}
        />
      )}
    >
      {!isConfigured ? (
        <AuthNotice message="Este ambiente ainda não está configurado." tone="danger" />
      ) : null}
      {error ? <AuthNotice testID="business-sign-up-error" message={error} tone="danger" /> : null}
      <AuthField
        testID="business-sign-up-name"
        label="Nome"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        placeholder="Seu nome completo"
      />
      <AuthField
        testID="business-sign-up-email"
        label="E-mail convidado"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="voce@exemplo.com"
      />
      <AuthField
        testID="business-sign-up-password"
        label="Senha"
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="Crie uma senha forte"
        secureTextEntry
      />
      <AuthField
        testID="business-sign-up-confirmation"
        label="Confirmar senha"
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="none"
        autoComplete="new-password"
        placeholder="Repita a senha"
        secureTextEntry
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <AuthNotice
        message="Use 8 ou mais caracteres, com maiúscula, minúscula, número e símbolo."
      />
      <AuthButton
        testID="business-sign-up-submit"
        label="Criar conta"
        busy={busy}
        disabled={!isConfigured}
        onPress={() => void submit()}
      />
    </AuthScreen>
  );
}
