import { useEffect, useState } from 'react';
import { Link, useRouter } from 'expo-router';
import { Text, View } from 'react-native';

import {
  ComplianceButton,
  ComplianceSection,
  PublicComplianceShell,
  publicComplianceStyles,
} from '../components/compliance/public-compliance-shell';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';

type RequestStatus = 'pending' | 'processing' | 'executed' | 'rejected' | 'failed';
type RpcResponse = {
  data: { status: RequestStatus }[] | null;
  error: { message?: string } | null;
};

const callDeletionRpc = (name: string) => (
  (supabase.rpc as unknown as (functionName: string) => Promise<RpcResponse>)(name)
);

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Solicitação recebida.',
  processing: 'Exclusão em processamento.',
  executed: 'Conta excluída.',
  rejected: 'Solicitação encerrada.',
  failed: 'A execução será tentada novamente pela equipe responsável.',
};

export default function AccountDeletionPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [confirmationStep, setConfirmationStep] = useState<0 | 1 | 2>(0);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<RequestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setStatus(null);
      return;
    }
    let active = true;
    setIsLoadingStatus(true);
    void callDeletionRpc('get_client_account_deletion_request').then((result) => {
      if (!active) return;
      setStatus(result.data?.[0]?.status ?? null);
      if (result.error) setError('Não foi possível consultar o estado da solicitação.');
      setIsLoadingStatus(false);
    });
    return () => { active = false; };
  }, [user]);

  const submitRequest = async () => {
    setIsSubmitting(true);
    setError(null);
    const result = await callDeletionRpc('submit_client_account_deletion_request');
    setIsSubmitting(false);

    if (result.error || !result.data?.[0]) {
      setError(
        result.error?.message?.includes('client_profile_required')
          ? 'A exclusão por esta página está disponível para contas de cliente ativas.'
          : 'Não foi possível registrar a solicitação. Tente novamente.',
      );
      return;
    }
    setStatus(result.data[0].status);
    setConfirmationStep(0);
  };

  return (
    <PublicComplianceShell
      testID="public-account-deletion-page"
      eyebrow="EXCLUSÃO DE CONTA"
      title="Solicite a exclusão sem reinstalar o aplicativo."
      description="Fluxo oficial do CutSync para o aplicativo com.cutsync.client. A solicitação é vinculada exclusivamente à conta autenticada."
      footer={(
        <Link href="/privacy" asChild>
          <Text testID="account-deletion-privacy-link" style={publicComplianceStyles.backLink}>
            Consultar política de privacidade
          </Text>
        </Link>
      )}
    >
      <ComplianceSection title="O que acontece">
        O acesso é revogado, o perfil é anonimizado e os vínculos ativos são encerrados. Registros que precisem ser preservados por obrigação legal, prevenção a fraude ou exercício regular de direitos permanecem protegidos durante o prazo aplicável.
      </ComplianceSection>
      <ComplianceSection title="Prazo e acompanhamento">
        A equipe processará a solicitação após validação de segurança. Enquanto ela estiver pendente, o estado poderá ser consultado na área Segurança do aplicativo.
      </ComplianceSection>

      {!user ? (
        <View style={publicComplianceStyles.actions}>
          <Text testID="account-deletion-sign-in-note" style={publicComplianceStyles.notice}>
            Entre na conta que deseja excluir. Depois da autenticação, você retornará automaticamente para esta página.
          </Text>
          <ComplianceButton
            testID="account-deletion-sign-in"
            label="Entrar para continuar"
            onPress={() => router.push('/(auth)/login?audience=client&redirect=/account-deletion')}
          />
        </View>
      ) : isLoadingStatus ? (
        <Text testID="account-deletion-loading" style={publicComplianceStyles.notice}>
          Consultando o estado da solicitação…
        </Text>
      ) : status ? (
        <Text testID="account-deletion-status" style={[publicComplianceStyles.notice, publicComplianceStyles.success]}>
          {statusLabels[status]}
        </Text>
      ) : confirmationStep === 0 ? (
        <ComplianceButton
          testID="account-deletion-start"
          label="Solicitar exclusão da conta"
          danger
          onPress={() => setConfirmationStep(1)}
        />
      ) : (
        <View testID="account-deletion-confirmation" style={publicComplianceStyles.confirmation}>
          <Text style={publicComplianceStyles.confirmationTitle}>
            {confirmationStep === 1 ? 'Entenda o impacto' : 'Confirmação final'}
          </Text>
          <Text style={publicComplianceStyles.confirmationText}>
            {confirmationStep === 1
              ? 'Depois da execução você não conseguirá entrar, acessar agendamentos ou recuperar o perfil.'
              : 'Confirme apenas se deseja encerrar definitivamente esta conta CutSync.'}
          </Text>
          <View style={publicComplianceStyles.actions}>
            <ComplianceButton
              testID="account-deletion-continue"
              label={confirmationStep === 1 ? 'Continuar' : 'Confirmar solicitação'}
              danger
              disabled={isSubmitting}
              onPress={() => {
                if (confirmationStep === 1) setConfirmationStep(2);
                else void submitRequest();
              }}
            />
            <ComplianceButton
              testID="account-deletion-cancel"
              label="Cancelar"
              disabled={isSubmitting}
              onPress={() => setConfirmationStep(0)}
            />
          </View>
        </View>
      )}

      {error && (
        <Text testID="account-deletion-error" style={[publicComplianceStyles.notice, publicComplianceStyles.error]}>
          {error}
        </Text>
      )}
    </PublicComplianceShell>
  );
}
