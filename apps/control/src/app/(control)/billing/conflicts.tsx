import { BillingOperations } from '@/components/billing-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function BillingConflictsRoute() {
  return (
    <RequireControlPermission permission="control.billing.read">
      <BillingOperations section="conflicts" />
    </RequireControlPermission>
  );
}
