import React from 'react';
import { ScrollView } from 'react-native';

import { ControlState } from '@/components/control-state';
import { SectionPage } from '@/components/section-page';
import { SupportOperations } from '@/components/support-operations';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function SuporteRoute() {
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
        eyebrow="SUPORTE"
        title="Fila de atendimentos"
        description="Projeção operacional dos chamados oficiais. Criação de novos atendimentos permanece bloqueada até homologação ponta a ponta."
      >
        <SupportOperations />
      </SectionPage>
    </ScrollView>
  );
}
