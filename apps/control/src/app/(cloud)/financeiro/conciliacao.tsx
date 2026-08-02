import React, { useState } from 'react';
import { View } from 'react-native';

import { BillingOperations } from '@/components/billing-operations';
import { FilterTabs } from '@/components/cloud/filter-tabs';
import { RequireControlPermission } from '@/components/require-control-permission';
import { SectionPage } from '@/components/section-page';
import { FinanceNavigation } from '@/modules/finance/finance-navigation';

type ConciliationTab = 'cutovers' | 'conflicts';

export default function ConciliacaoRoute() {
  const [tab, setTab] = useState<ConciliationTab>('cutovers');

  return (
    <RequireControlPermission permission="control.billing.read">
      <View>
        <SectionPage
          eyebrow="FINANCEIRO · CONCILIAÇÃO"
          title="Conciliação"
          description="Transições multiunidade e conflitos cadastrais, com confirmação para operações destrutivas."
        >
          <FinanceNavigation />
          <FilterTabs
            tabs={[
              { id: 'cutovers', label: 'Transições' },
              { id: 'conflicts', label: 'Conflitos' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </SectionPage>
        <BillingOperations hideChrome section={tab} />
      </View>
    </RequireControlPermission>
  );
}
