/**
 * Standard critical-flow contract for CutSync Cloud.
 * UI layers should follow: confirm → loading → RPC → toast → refetch.
 */

export type CloudFlowId =
  | 'open_incident'
  | 'create_support_ticket'
  | 'review_access'
  | 'revoke_access'
  | 'create_charge'
  | 'change_priority'
  | 'close_support_ticket'
  | 'switch_module'
  | 'sign_out';

export type CloudFlowStep =
  | 'idle'
  | 'confirm'
  | 'loading'
  | 'success'
  | 'error';

export type CloudFlowState = {
  id: CloudFlowId;
  step: CloudFlowStep;
  requiresConfirmation: boolean;
  auditEvent: string | null;
};

const FLOW_META: Record<
  CloudFlowId,
  { requiresConfirmation: boolean; auditEvent: string | null }
> = {
  open_incident: { requiresConfirmation: true, auditEvent: 'cloud.incident.opened' },
  create_support_ticket: { requiresConfirmation: true, auditEvent: 'cloud.support.created' },
  review_access: { requiresConfirmation: true, auditEvent: 'cloud.access.reviewed' },
  revoke_access: { requiresConfirmation: true, auditEvent: 'cloud.access.revoked' },
  create_charge: { requiresConfirmation: true, auditEvent: 'cloud.finance.charge_created' },
  change_priority: { requiresConfirmation: true, auditEvent: 'cloud.support.priority_changed' },
  close_support_ticket: { requiresConfirmation: true, auditEvent: 'cloud.support.closed' },
  switch_module: { requiresConfirmation: false, auditEvent: null },
  sign_out: { requiresConfirmation: false, auditEvent: 'cloud.session.signed_out' },
};

export function createCloudFlowState(id: CloudFlowId): CloudFlowState {
  const meta = FLOW_META[id];
  return {
    id,
    step: meta.requiresConfirmation ? 'confirm' : 'loading',
    requiresConfirmation: meta.requiresConfirmation,
    auditEvent: meta.auditEvent,
  };
}

export function advanceCloudFlow(
  state: CloudFlowState,
  event: 'confirm' | 'success' | 'error' | 'cancel',
): CloudFlowState {
  if (event === 'cancel') {
    return { ...state, step: 'idle' };
  }
  if (event === 'confirm') {
    return { ...state, step: 'loading' };
  }
  if (event === 'success') {
    return { ...state, step: 'success' };
  }
  return { ...state, step: 'error' };
}

export function listCriticalCloudFlows(): CloudFlowId[] {
  return Object.keys(FLOW_META) as CloudFlowId[];
}
