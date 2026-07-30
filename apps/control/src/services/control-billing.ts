import { supabase } from '@/services/supabase';

export type BillingSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled';

export interface ControlBillingAccount {
  billingAccountId: string;
  organizationId: string;
  organizationName: string;
  subscriptionId: string | null;
  planCode: string | null;
  subscriptionStatus: BillingSubscriptionStatus | null;
  enforcementEnabled: boolean;
  configuredUnits: number;
  activeCoverageUnits: number;
  scheduledCoverageUnits: number;
  currentPeriodEnd: string | null;
}

export interface ControlIdentityConflict {
  conflictId: string;
  legacySource: string;
  documentType: 'CPF' | 'CNPJ' | null;
  maskedDocument: string | null;
  reasonCode: string;
  status: string;
  createdAt: string;
}

export interface ControlBillingCutover {
  cutoverRequestId: string;
  organizationId: string;
  organizationName: string;
  organizationSubscriptionId: string;
  status: 'scheduled' | 'reconciling';
  cutoverAt: string;
  unitCount: number;
}

export interface ControlBillingPlan {
  code: string;
  name: string;
  basePriceCents: number | null;
  currency: string;
  isNetwork: boolean;
}

export interface ControlBillingSnapshot {
  accounts: ControlBillingAccount[];
  conflicts: ControlIdentityConflict[];
  cutovers: ControlBillingCutover[];
  plans: ControlBillingPlan[];
}

export type IdentityConflictResolution = 'link' | 'reject' | 'request_evidence';

type ServiceError = {
  message?: string;
  code?: string;
  details?: string;
};

const errorMessages: Record<string, string> = {
  '23505': 'Já existe um registro de cobrança para este período.',
  aal2_required: 'Confirme o autenticador para realizar esta operação.',
  authentication_required: 'Sua sessão expirou. Entre novamente para continuar.',
  billing_account_not_found: 'A organização ainda não possui uma conta de cobrança.',
  billing_regularization_required: 'Regularize a cobrança antes de continuar.',
  cutover_not_due: 'A data programada para esta transição ainda não chegou.',
  cutover_request_not_found: 'A transição de cobrança não foi encontrada.',
  cutover_request_not_pending: 'Esta transição já foi concluída ou cancelada.',
  control_aal2_required: 'Confirme o autenticador para acessar o CutSync Control.',
  duplicate_invoice: 'Já existe uma fatura para este período.',
  forbidden: 'Seu nível de acesso não permite realizar esta operação.',
  individual_subscription_still_live:
    'Ainda existe uma assinatura individual vigente. Reconcilie o provedor antes de aplicar o corte.',
  invalid_plan_price: 'Informe um preço-base válido e uma moeda aceita.',
  invalid_reason: 'Informe uma justificativa entre 10 e 500 caracteres.',
  invalid_resolution: 'Revise a decisão e a justificativa antes de continuar.',
  invalid_subscription_status: 'O status selecionado não é aceito para esta assinatura.',
  network_plan_required: 'Contas com cinco ou mais unidades exigem o plano de rede.',
  organization_subscription_not_ready:
    'A assinatura consolidada ainda não está pronta para concluir a transição.',
  plan_not_found: 'O plano informado não foi encontrado ou está inativo.',
  plan_price_required: 'Configure o preço-base do plano antes de emitir a fatura.',
  priced_plan_not_found: 'Configure o preço-base do plano antes de ativar a assinatura.',
  resolution_failed: 'Não foi possível registrar a decisão cadastral.',
  standard_plan_price_fixed: 'O preço deste plano é controlado pelo catálogo padrão.',
  subscription_not_found: 'A assinatura informada não foi encontrada.',
};

function findKnownError(value: string): string | null {
  const normalized = value.toLowerCase();
  const code = Object.keys(errorMessages).find((candidate) => normalized.includes(candidate));
  return code ? errorMessages[code] : null;
}

export function getControlBillingErrorMessage(
  error: ServiceError | null | undefined,
  fallback = 'Não foi possível concluir a operação. Tente novamente.',
): string {
  if (!error) return fallback;
  return findKnownError(`${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`) ?? fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`billing_response_invalid:${field}`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`billing_response_invalid:${field}`);
  }
  return value;
}

function parseAccount(value: Record<string, unknown>): ControlBillingAccount {
  const rawStatus = asNullableString(value.subscription_status);
  const subscriptionStatus = (
    rawStatus
    && ['trialing', 'active', 'past_due', 'suspended', 'canceled'].includes(rawStatus)
  ) ? rawStatus as BillingSubscriptionStatus : null;
  if (rawStatus && !subscriptionStatus) {
    throw new Error('billing_response_invalid:subscription_status');
  }

  return {
    billingAccountId: requireString(value.billing_account_id, 'billing_account_id'),
    organizationId: requireString(value.organization_id, 'organization_id'),
    organizationName: requireString(value.organization_name, 'organization_name'),
    subscriptionId: asNullableString(value.subscription_id),
    planCode: asNullableString(value.plan_code),
    subscriptionStatus,
    enforcementEnabled: value.enforcement_enabled === true,
    configuredUnits: requireNumber(value.active_units, 'active_units'),
    activeCoverageUnits: 0,
    scheduledCoverageUnits: 0,
    currentPeriodEnd: asNullableString(value.current_period_end),
  };
}

function parseConflict(value: Record<string, unknown>): ControlIdentityConflict {
  const documentType = value.document_type === 'CPF' || value.document_type === 'CNPJ'
    ? value.document_type
    : null;
  return {
    conflictId: requireString(value.conflict_id, 'conflict_id'),
    legacySource: requireString(value.legacy_source, 'legacy_source'),
    documentType,
    maskedDocument: asNullableString(value.masked_document),
    reasonCode: requireString(value.reason_code, 'reason_code'),
    status: requireString(value.status, 'status'),
    createdAt: requireString(value.created_at, 'created_at'),
  };
}

function parseCutover(value: Record<string, unknown>): ControlBillingCutover {
  if (value.status !== 'scheduled' && value.status !== 'reconciling') {
    throw new Error('billing_response_invalid:cutover_status');
  }
  return {
    cutoverRequestId: requireString(value.cutover_request_id, 'cutover_request_id'),
    organizationId: requireString(value.organization_id, 'organization_id'),
    organizationName: requireString(value.organization_name, 'organization_name'),
    organizationSubscriptionId: requireString(
      value.organization_subscription_id,
      'organization_subscription_id',
    ),
    status: value.status,
    cutoverAt: requireString(value.cutover_at, 'cutover_at'),
    unitCount: requireNumber(value.unit_count, 'unit_count'),
  };
}

function parsePlan(value: Record<string, unknown>): ControlBillingPlan {
  const basePriceCents = value.base_price_cents;
  if (basePriceCents !== null && (
    typeof basePriceCents !== 'number'
    || !Number.isFinite(basePriceCents)
    || basePriceCents < 0
  )) {
    throw new Error('billing_response_invalid:base_price_cents');
  }
  if (typeof value.is_network !== 'boolean') {
    throw new Error('billing_response_invalid:is_network');
  }
  return {
    code: requireString(value.code, 'code'),
    name: requireString(value.name, 'name'),
    basePriceCents,
    currency: requireString(value.currency, 'currency'),
    isNetwork: value.is_network,
  };
}

function withCoverageContext(
  account: ControlBillingAccount,
  value: unknown,
): ControlBillingAccount {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('billing_response_invalid:billing_context');
  }
  const establishments = (value as { establishments?: unknown }).establishments;
  if (!Array.isArray(establishments)) {
    throw new Error('billing_response_invalid:establishments');
  }
  const coverageStatuses = establishments.map((item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? (item as { coverage_status?: unknown }).coverage_status
      : null
  ));
  return {
    ...account,
    activeCoverageUnits: coverageStatuses.filter((status) => status === 'active').length,
    scheduledCoverageUnits: coverageStatuses.filter((status) => status === 'scheduled').length,
  };
}

export async function getControlBillingSnapshot(): Promise<ControlBillingSnapshot> {
  const [accountsResult, conflictsResult, cutoversResult, plansResult] = await Promise.all([
    supabase.rpc('list_control_billing_accounts'),
    supabase.rpc('list_identity_migration_conflicts'),
    supabase.rpc('list_control_billing_cutovers'),
    supabase
      .from('organization_billing_plans')
      .select('code, name, base_price_cents, currency, is_network')
      .eq('active', true)
      .order('is_network', { ascending: true }),
  ]);

  const firstError = accountsResult.error
    ?? conflictsResult.error
    ?? cutoversResult.error
    ?? plansResult.error;
  if (firstError) throw new Error(getControlBillingErrorMessage(firstError));

  try {
    const parsedAccounts = (accountsResult.data ?? [])
      .map((item) => parseAccount(item as Record<string, unknown>));
    const contextResults = await Promise.all(parsedAccounts.map((account) => (
      supabase.rpc('get_organization_billing_context', {
        target_organization_id: account.organizationId,
      })
    )));
    const contextError = contextResults.find((result) => result.error)?.error;
    if (contextError) {
      throw new Error(getControlBillingErrorMessage(
        contextError,
        'Não foi possível confirmar as coberturas das organizações.',
      ));
    }

    return {
      accounts: parsedAccounts.map((account, index) => (
        withCoverageContext(account, contextResults[index].data)
      )),
      conflicts: (conflictsResult.data ?? []).map((item) => parseConflict(item as Record<string, unknown>)),
      cutovers: (cutoversResult.data ?? []).map((item) => parseCutover(item as Record<string, unknown>)),
      plans: (plansResult.data ?? []).map((item) => parsePlan(item as Record<string, unknown>)),
    };
  } catch (error) {
    if (
      error instanceof Error
      && !error.message.startsWith('billing_response_invalid:')
    ) {
      throw error;
    }
    throw new Error('Os dados de cobrança retornaram em um formato inesperado.');
  }
}

async function assertRpcSuccess(
  operation: PromiseLike<{ error: ServiceError | null }>,
  fallback: string,
): Promise<void> {
  const result = await operation;
  if (result.error) throw new Error(getControlBillingErrorMessage(result.error, fallback));
}

export async function configureControlPlan(
  planCode: string,
  basePriceCents: number,
): Promise<void> {
  await assertRpcSuccess(
    supabase.rpc('configure_control_plan', {
      target_plan_code: planCode,
      target_base_price_cents: basePriceCents,
      target_currency: 'BRL',
    }),
    'Não foi possível atualizar o preço do plano.',
  );
}

export async function activateControlSubscription(
  organizationId: string,
  planCode: string,
): Promise<void> {
  await assertRpcSuccess(
    supabase.rpc('activate_control_subscription', {
      target_organization_id: organizationId,
      target_plan_code: planCode,
    }),
    'Não foi possível ativar a assinatura.',
  );
}

export async function setControlSubscriptionStatus(
  subscriptionId: string,
  status: BillingSubscriptionStatus,
  reason: string,
): Promise<void> {
  await assertRpcSuccess(
    supabase.rpc('set_control_subscription_status', {
      target_subscription_id: subscriptionId,
      target_status: status,
      reason,
    }),
    'Não foi possível alterar o status da assinatura.',
  );
}

export async function issueControlInvoice(subscriptionId: string): Promise<void> {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const dueDateValue = [
    dueDate.getFullYear(),
    String(dueDate.getMonth() + 1).padStart(2, '0'),
    String(dueDate.getDate()).padStart(2, '0'),
  ].join('-');
  await assertRpcSuccess(
    supabase.rpc('issue_manual_billing_invoice', {
      target_subscription_id: subscriptionId,
      target_due_date: dueDateValue,
    }),
    'Não foi possível emitir a fatura.',
  );
}

export async function setControlSubscriptionEnforcement(
  subscriptionId: string,
  enabled: boolean,
  reason: string,
): Promise<void> {
  await assertRpcSuccess(
    supabase.rpc('set_control_subscription_enforcement', {
      target_subscription_id: subscriptionId,
      enabled,
      reason,
    }),
    'Não foi possível alterar o bloqueio operacional.',
  );
}

export async function finalizeControlBillingCutover(cutoverRequestId: string): Promise<void> {
  await assertRpcSuccess(
    supabase.rpc('finalize_organization_billing_cutover', {
      target_cutover_request_id: cutoverRequestId,
    }),
    'Não foi possível finalizar o corte de cobrança.',
  );
}

export async function resolveControlIdentityConflict(
  conflictId: string,
  action: IdentityConflictResolution,
  reason: string,
): Promise<void> {
  const result = await supabase.functions.invoke('resolve-identity-conflict', {
    body: { conflictId, action, reason },
  });
  const responseError = typeof result.data?.error === 'string'
    ? { message: result.data.error }
    : null;
  if (result.error || responseError) {
    throw new Error(getControlBillingErrorMessage(
      result.error ?? responseError,
      'Não foi possível registrar a decisão cadastral.',
    ));
  }
}
