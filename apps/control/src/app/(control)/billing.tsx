import { BillingOperations } from '@/components/billing-operations';
import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function BillingRoute() {
  const { can } = useControlAuth();
  if (!can('control.billing.manage')) {
    return <ControlState title="Acesso somente operacional" message="Seu papel não permite alterar cobrança." />;
  }
  return <BillingOperations />;
}
