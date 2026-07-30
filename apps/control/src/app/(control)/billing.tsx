import { BillingOperations } from '@/components/billing-operations';
import { RequireControlPermission } from '@/components/require-control-permission';

export default function BillingRoute() {
  return (
    <RequireControlPermission
      permission="control.billing.read"
      title="Cobrança restrita"
      message="Seu papel não permite consultar a cobrança da plataforma."
    >
      <BillingOperations section="overview" />
    </RequireControlPermission>
  );
}
