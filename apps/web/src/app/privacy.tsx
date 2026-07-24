import { Link } from 'expo-router';
import { Text } from 'react-native';

import {
  ComplianceSection,
  PublicComplianceShell,
  publicComplianceStyles,
} from '../components/compliance/public-compliance-shell';

export default function PrivacyPage() {
  return (
    <PublicComplianceShell
      testID="public-privacy-page"
      eyebrow="PRIVACIDADE E PROTEÇÃO DE DADOS"
      title="Seus dados, com finalidade e controle."
      description="Esta página resume como o CutSync trata dados pessoais no aplicativo de clientes com identificador com.cutsync.client."
      footer={(
        <Link href="/account-deletion" asChild>
          <Text testID="privacy-account-deletion-link" style={publicComplianceStyles.backLink}>
            Acessar exclusão de conta
          </Text>
        </Link>
      )}
    >
      <ComplianceSection title="Dados utilizados">
        Usamos dados de cadastro, contato, preferências, dispositivo e agendamentos para autenticar sua conta, operar reservas, enviar comunicações solicitadas e proteger o serviço.
      </ComplianceSection>
      <ComplianceSection title="Compartilhamento e segurança">
        Os dados são disponibilizados somente aos estabelecimentos envolvidos no atendimento e a fornecedores necessários à operação, sob controles de acesso, auditoria e retenção compatível com a finalidade.
      </ComplianceSection>
      <ComplianceSection title="Retenção">
        O perfil é anonimizado quando a exclusão é executada. Registros transacionais, antifraude, fiscais ou de auditoria podem ser preservados pelo prazo exigido por lei ou para exercício regular de direitos.
      </ComplianceSection>
      <ComplianceSection title="Seus direitos">
        Você pode revisar dados do perfil, ajustar preferências e solicitar a exclusão da conta no aplicativo ou na página pública de exclusão.
      </ComplianceSection>
    </PublicComplianceShell>
  );
}
