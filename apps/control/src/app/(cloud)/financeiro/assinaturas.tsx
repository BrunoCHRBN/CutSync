import React from 'react';

import { BillingOperations } from '@/components/billing-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function AssinaturasRoute() {
  return (
    <RequireControlPermission permission="control.billing.read">
      <BillingOperations section="plans" />
    </RequireControlPermission>
  );
}
