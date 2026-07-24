import { useEffect, useState } from 'react';
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
import {
  getClientAccountDeletionRequest,
  getClientAccountDeletionStatusLabel,
  submitClientAccountDeletionRequest,
  type ClientAccountDeletionRequest,
} from '@/features/account-deletion/client-account-deletion-service';
import { clientObservability } from '@/features/observability/client-observability';

export function ClientSecurityScreen() {
  const { profile } = useClientProfile();
  const { requestPasswordReset, signOut, user } = useSession();
  const [isRequestingPassword, setIsRequestingPassword] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isLoadingDeletion, setIsLoadingDeletion] = useState(true);
  const [isSubmittingDeletion, setIsSubmittingDeletion] = useState(false);
  const [deletionRequest, setDeletionRequest] = useState<ClientAccountDeletionRequest | null>(null);
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

  useEffect(() => {
    let active = true;
    void getClientAccountDeletionRequest().then((result) => {
      if (!active) return;
      setDeletionRequest(result.request);
      if (result.message) {
        setTone('danger');
        setMessage(result.message);
      }
      setIsLoadingDeletion(false);
    });
    return () => { active = false; };
  }, []);

  const submitDeletion = async () => {
    setMessage(null);
    setIsSubmittingDeletion(true);
    const result = await submitClientAccountDeletionRequest();
    setIsSubmittingDeletion(false);
    if (result.message || !result.request) {
      setTone('danger');
      setMessage(result.message ?? 'Não foi possível registrar a solicitação.');
      return;
    }
    setDeletionRequest(result.request);
    setTone('success');
    setMessage('Solicitação registrada. Você pode acompanhar o estado nesta tela.');
  };

  const confirmDeletionSecondStep = () => {
    Alert.alert(
      'Confirmar solicitação?',
      'Ao concluir, sua conta perderá acesso e seus dados pessoais serão anonimizados. Registros legais e transacionais poderão ser mantidos pelo prazo obrigatório.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Solicitar exclusão',
          style: 'destructive',
          onPress: () => { void submitDeletion(); },
        },
      ],
    );
  };

  const confirmDeletionFirstStep = () => {
    Alert.alert(
      'Excluir sua conta?',
      'Esta ação é irreversível depois de executada. Agendamentos e o acesso ao aplicativo serão encerrados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', style: 'destructive', onPress: confirmDeletionSecondStep },
      ],
    );
  };

  const hasActiveDeletionRequest = deletionRequest != null
    && ['pending', 'processing', 'failed'].includes(deletionRequest.status);

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

      <SettingsSectionLabel>EXCLUSÃO DA CONTA</SettingsSectionLabel>
      <SettingsCard>
        <SettingsNotice
          testID="client-account-deletion-explanation"
          tone="neutral"
          message="A exclusão remove seu acesso e anonimiza os dados do perfil. Informações que precisem ser preservadas por obrigação legal ou prevenção a fraude permanecem protegidas durante o prazo aplicável."
        />
        {deletionRequest && (
          <SettingsNotice
            testID="client-account-deletion-status"
            tone={deletionRequest.status === 'executed' ? 'success' : deletionRequest.status === 'rejected' ? 'danger' : 'neutral'}
            message={getClientAccountDeletionStatusLabel(deletionRequest.status)}
          />
        )}
        <SettingsButton
          testID="client-request-account-deletion"
          label={hasActiveDeletionRequest ? 'Solicitação já registrada' : 'Solicitar exclusão da conta'}
          tone="danger"
          loading={isSubmittingDeletion || isLoadingDeletion}
          disabled={
            isRequestingPassword
            || isSigningOut
            || hasActiveDeletionRequest
            || deletionRequest?.status === 'executed'
          }
          onPress={confirmDeletionFirstStep}
        />
      </SettingsCard>

      {clientObservability.diagnosticsEnabled && (
        <>
          <SettingsSectionLabel>DIAGNÓSTICO</SettingsSectionLabel>
          <SettingsCard>
            <SettingsButton
              testID="client-send-observability-diagnostic"
              label="Enviar diagnóstico de observabilidade"
              tone="secondary"
              disabled={isRequestingPassword || isSigningOut}
              onPress={() => {
                clientObservability.sendDiagnostic();
                setTone('success');
                setMessage('Diagnóstico enviado sem dados pessoais.');
              }}
            />
          </SettingsCard>
        </>
      )}

      {message && <SettingsNotice testID="client-security-message" message={message} tone={tone} />}
    </ClientSettingsPage>
  );
}
