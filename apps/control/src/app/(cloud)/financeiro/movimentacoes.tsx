import React from 'react';

import { FeedbackState } from '@/components/cloud/feedback-state';
import { RequireControlPermission } from '@/components/require-control-permission';
import { SectionPage } from '@/components/section-page';
import { FinanceNavigation } from '@/modules/finance/finance-navigation';

export default function MovimentacoesRoute() {
  return (
    <RequireControlPermission permission="control.billing.read">
      <SectionPage
        eyebrow="FINANCEIRO"
        title="Movimentações"
        description="Período, recebido, pendente e previsto. Exportação e filtros avançados usam as operações já existentes de cobrança."
      >
        <FinanceNavigation />
        <FeedbackState
          kind="partial"
          title="Movimentações em consolidação"
          message="Use Cobranças e Assinaturas para as operações já homologadas. Esta visão agregada evolui sem dados simulados."
        />
      </SectionPage>
    </RequireControlPermission>
  );
}
