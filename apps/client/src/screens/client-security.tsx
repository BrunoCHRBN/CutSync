import { useState } from 'react';
import { Alert } from 'react-native';

import {
  ClientSettingsPage,
  SettingsButton,
  SettingsCard,
  SettingsNotice,
  SettingsSectionLabel,
} from '@/components/settings/client-settings-ui';
import { useClientProfile } from '@/contexts/client-profile-context';
import { useSession } from '@/contexts/session-context';

export function ClientSecurityScreen() {
  const { profile } = useClientProfile();
  const { requestPasswordReset, signOut, user } = useSession();
  const [isRequestingPassword, setIsRequestingPassword] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'danger' | 'success' | 'neutral'>('neutral');

  const handlePasswordReset = async () => {
    const email = profile?.email || user?.email || '';
    setMessage(null);
    setIsRequestingPassword(true);
    const result = await requestPasswordReset(email);
    setIsRequestingPassword(false);
    if (result.ok) {
      setTone('success');
      setMessage('Se o endereço estiver apto, enviaremos um link seguro para alterar sua senha.');
    } else {
      setTone('danger');
      setMessage(result.message);
    }
  };

  const handleSignOut = async () => {
    setMessage(null);
    setIsSigningOut(true);
    const result = await signOut();
    if (!result.ok) {
      setTone('danger');
      setMessage(result.message);
      setIsSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sair deste dispositivo?',
      'Você precisará entrar novamente para acessar seus dados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => { void handleSignOut(); } },
      ],
    );
  };

  return (
    <ClientSettingsPage
      testID="client-security-screen"
      description="A senha é alterada por um link enviado ao e-mail confirmado da sua conta."
    >
      <SettingsSectionLabel>ACESSO</SettingsSectionLabel>
      <SettingsCard>
        <SettingsButton
          testID="client-request-password-reset"
          label="Enviar link para alterar senha"
          tone="secondary"
          loading={isRequestingPassword}
          disabled={isSigningOut}
          onPress={() => { void handlePasswordReset(); }}
        />
      </SettingsCard>

      <SettingsSectionLabel>SESSÃO</SettingsSectionLabel>
      <SettingsCard>
        <SettingsButton
          testID="client-sign-out-button"
          label="Sair deste dispositivo"
          tone="danger"
          loading={isSigningOut}
          disabled={isRequestingPassword}
          onPress={confirmSignOut}
        />
      </SettingsCard>

      {message && <SettingsNotice testID="client-security-message" message={message} tone={tone} />}
    </ClientSettingsPage>
  );
}
