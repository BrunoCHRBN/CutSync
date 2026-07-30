import { BillingOperations } from '@/components/billing-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function BillingAccountsRoute() {
  return (
    <RequireControlPermission permission="control.billing.read">
      <BillingOperations section="accounts" />
    </RequireControlPermission>
  );
}
