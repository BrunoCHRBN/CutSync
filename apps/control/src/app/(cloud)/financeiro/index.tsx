import React from 'react';

import { BillingOperations } from '@/components/billing-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function FinanceiroRoute() {
  return (
    <RequireControlPermission
      permission="control.billing.read"
      title="Financeiro restrito"
      message="Seu papel não permite consultar o financeiro da plataforma."
    >
      <BillingOperations section="overview" />
    </RequireControlPermission>
  );
}
