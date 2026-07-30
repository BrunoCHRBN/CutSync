import type {
  BillingSubscriptionStatus,
  ControlBillingAccount,
  ControlBillingCutover,
  ControlIdentityConflict,
  IdentityConflictResolution,
} from '@/services/control-billing';

export type BillingSection = 'overview' | 'plans' | 'accounts' | 'cutovers' | 'conflicts';

export type NoticeState = {
  tone: 'success' | 'warning' | 'danger' | 'info';
  title?: string;
  message: string;
} | null;

export type PendingBillingAction =
  | { kind: 'configure_plan'; planCode: string; basePriceCents: number }
  | { kind: 'activate_subscription'; account: ControlBillingAccount; planCode: string }
  | {
    kind: 'change_status';
    account: ControlBillingAccount;
    status: BillingSubscriptionStatus;
  }
  | { kind: 'issue_invoice'; account: ControlBillingAccount }
  | { kind: 'change_enforcement'; account: ControlBillingAccount; enabled: boolean }
  | { kind: 'finalize_cutover'; cutover: ControlBillingCutover }
  | {
    kind: 'resolve_conflict';
    conflict: ControlIdentityConflict;
    resolution: IdentityConflictResolution;
  };

export const subscriptionStatusLabels: Record<BillingSubscriptionStatus, string> = {
  trialing: 'Em avaliação',
  active: 'Ativa',
  past_due: 'Em atraso',
  suspended: 'Suspensa',
  canceled: 'Cancelada',
};
