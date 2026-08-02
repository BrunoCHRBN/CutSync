import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BillingOperations } from '@/components/billing-operations';
import { FilterTabs } from '@/components/cloud/filter-tabs';
import { RequireControlPermission } from '@/components/require-control-permission';
import { cloudTheme } from '@/theme/cloud-components';

type ConciliationTab = 'cutovers' | 'conflicts';

export default function ConciliacaoRoute() {
  const [tab, setTab] = useState<ConciliationTab>('cutovers');

  return (
    <RequireControlPermission permission="control.billing.read">
      <View style={styles.wrap}>
        <View style={styles.tabs}>
          <FilterTabs
            tabs={[
              { id: 'cutovers', label: 'Transições' },
              { id: 'conflicts', label: 'Conflitos' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </View>
        <BillingOperations hideChrome section={tab} />
      </View>
    </RequireControlPermission>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  tabs: {
    paddingHorizontal: cloudTheme.layout.contentPadding,
    paddingTop: cloudTheme.spacing.lg,
  },
});
