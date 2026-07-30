import { BillingOperations } from '@/components/billing-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function BillingCutoversRoute() {
  return (
    <RequireControlPermission permission="control.billing.read">
      <BillingOperations section="cutovers" />
    </RequireControlPermission>
  );
}
