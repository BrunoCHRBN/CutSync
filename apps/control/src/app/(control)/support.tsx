import { ScrollView } from 'react-native';

import { ControlState } from '@/components/control-state';
import { SectionPage } from '@/components/section-page';
import { SupportOperations } from '@/components/support-operations';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function SupportRoute() {
  const { can } = useControlAuth();

  if (!can('control.support.read')) {
    return (
      <ControlState
        title="Acesso restrito"
        message="Seu papel não permite consultar a fila de suporte."
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <SectionPage
        eyebrow="ATENDIMENTO"
        title="Fila de suporte"
        description="Projeção operacional dos chamados oficiais do Jira Service Management. Respostas e comentários internos continuam no Jira."
      >
        <SupportOperations />
      </SectionPage>
    </ScrollView>
  );
}
