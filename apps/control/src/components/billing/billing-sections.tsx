import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BillingOverviewLinks } from '@/components/billing/billing-navigation';
import { billingStyles as styles } from '@/components/billing/billing-styles';
import {
  type PendingBillingAction,
  subscriptionStatusLabels,
} from '@/components/billing/billing-types';
import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs } from '@/components/cloud/filter-tabs';
import {
  ControlButton,
  ControlCard,
  ControlEmptyState,
  ControlField,
  ControlMetricCard,
  ControlNotice,
  ControlStatusBadge,
} from '@/components/control-ui';
import type {
  BillingSubscriptionStatus,
  ControlBillingAccount,
  ControlBillingCutover,
  ControlBillingPlan,
  ControlBillingSnapshot,
  ControlIdentityConflict,
} from '@/services/control-billing';

type FinancePeriod = '7d' | '30d' | 'month' | 'custom';

const financePeriods: { id: FinancePeriod; label: string }[] = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'month', label: 'Mês atual' },
  { id: 'custom', label: 'Personalizado' },
];

/**
 * Contrato futuro para série temporal financeira (não fabricar barras sem RPC):
 * { date: string; receivedCents: number; pendingCents: number; forecastCents: number }
 */

const conflictReasonLabels: Record<string, string> = {
  duplicate_document: 'Documento já associado',
  legacy_record_ambiguous: 'Registro legado ambíguo',
  legal_entity_not_found: 'Entidade legal não localizada',
  organization_not_found: 'Organização não localizada',
};

function formatDate(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return 'Não informada';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatMoney(cents: number | null, currency: string): string {
  if (cents === null) return 'Preço não configurado';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

function getStatusTone(
  status: BillingSubscriptionStatus | null,
): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'active' || status === 'trialing') return 'success';
  if (status === 'past_due') return 'warning';
  if (status === 'suspended' || status === 'canceled') return 'danger';
  return 'neutral';
}

export function OverviewSection({
  snapshot,
}: {
  snapshot: ControlBillingSnapshot;
}) {
  const [period, setPeriod] = useState<FinancePeriod>('30d');
  const activeSubscriptions = snapshot.accounts.filter((item) => (
    item.subscriptionStatus === 'active' || item.subscriptionStatus === 'trialing'
  )).length;
  const attentionSubscriptions = snapshot.accounts.filter((item) => (
    item.subscriptionStatus === 'past_due' || item.subscriptionStatus === 'suspended'
  )).length;
  const pendingConflicts = snapshot.conflicts.filter((item) => item.status === 'pending').length;
  const configuredPlans = snapshot.plans.filter((plan) => plan.basePriceCents !== null).length;

  return (
    <>
      <View style={styles.periodRow}>
        <Text style={styles.bodyText}>Período de análise</Text>
        <FilterTabs tabs={financePeriods} value={period} onChange={setPeriod} />
        {period === 'custom' ? (
          <Text style={styles.bodyText}>
            Intervalo personalizado aguarda seletor de datas ligado à RPC de caixa.
          </Text>
        ) : null}
      </View>

      <View style={styles.metrics}>
        <ControlMetricCard
          label="Recebido"
          value="—"
          detail="Valor confirmado · série de caixa ainda indisponível"
          tone="success"
        />
        <ControlMetricCard
          label="Pendências"
          value={attentionSubscriptions.toLocaleString('pt-BR')}
          detail="Assinaturas em atraso ou suspensas (operacional)"
          tone={attentionSubscriptions > 0 ? 'warning' : 'neutral'}
        />
        <ControlMetricCard
          label="Conciliação"
          value={snapshot.cutovers.length.toLocaleString('pt-BR')}
          detail="Transições aguardando reconciliação"
          tone={snapshot.cutovers.length > 0 ? 'warning' : 'neutral'}
        />
        <ControlMetricCard
          label="Previsto"
          value={configuredPlans.toLocaleString('pt-BR')}
          detail="Planos com preço-base configurado (catálogo)"
          tone="info"
        />
      </View>

      <View style={styles.metrics}>
        <ControlMetricCard
          label="Contas"
          value={snapshot.accounts.length.toLocaleString('pt-BR')}
          detail="Organizações com conta de cobrança"
        />
        <ControlMetricCard
          label="Assinaturas vigentes"
          value={activeSubscriptions.toLocaleString('pt-BR')}
          detail="Ativas ou em avaliação"
          tone="success"
        />
        <ControlMetricCard
          label="Indicadores de fechamento"
          value={pendingConflicts.toLocaleString('pt-BR')}
          detail="Conflitos cadastrais pendentes"
          tone={pendingConflicts > 0 ? 'warning' : 'neutral'}
        />
      </View>

      <ControlCard style={styles.formCard}>
        <Text style={styles.cardTitle}>Fluxo financeiro</Text>
        <FeedbackState
          kind="partial"
          title="Histórico ainda indisponível"
          message={`O período ${financePeriods.find((item) => item.id === period)?.label} está selecionado, mas a RPC atual não expõe série temporal de recebido/pendente/previsto. Nenhum gráfico simulado é exibido.`}
        />
      </ControlCard>

      <ControlCard style={styles.formCard}>
        <Text style={styles.cardTitle}>Pendências financeiras</Text>
        <Text style={styles.bodyText}>
          {attentionSubscriptions > 0
            ? `${attentionSubscriptions} assinatura(s) exigem atenção operacional.`
            : 'Nenhuma assinatura em atraso ou suspensa no snapshot atual.'}
        </Text>
        <Text style={styles.bodyText}>
          {snapshot.cutovers.length > 0
            ? `${snapshot.cutovers.length} transição(ões) pendente(s) de conciliação.`
            : 'Nenhuma transição de cutover pendente.'}
        </Text>
      </ControlCard>

      <ControlCard style={styles.formCard}>
        <Text style={styles.cardTitle}>Movimentações recentes</Text>
        <DataTable
          columns={[
            { key: 'date', header: 'Data', render: (row: { date: string }) => row.date },
            { key: 'description', header: 'Descrição', render: (row: { description: string }) => row.description },
            { key: 'account', header: 'Conta', render: (row: { account: string }) => row.account },
            { key: 'type', header: 'Tipo', render: (row: { type: string }) => row.type },
            { key: 'status', header: 'Status', render: (row: { status: string }) => row.status },
            { key: 'amount', header: 'Valor', render: (row: { amount: string }) => row.amount },
          ]}
          rows={[] as {
            date: string;
            description: string;
            account: string;
            type: string;
            status: string;
            amount: string;
          }[]}
          rowKey={(row) => row.date + row.description}
          emptyLabel="Nenhuma movimentação de caixa disponível nesta sessão."
        />
      </ControlCard>

      <View style={styles.overviewLinks}>
        <BillingOverviewLinks />
      </View>
    </>
  );
}
export function PlansSection({
  isOwner,
  planCode,
  setPlanCode,
  basePrice,
  setBasePrice,
  plans,
  onConfigure,
}: {
  isOwner: boolean;
  planCode: string;
  setPlanCode: (value: string) => void;
  basePrice: string;
  setBasePrice: (value: string) => void;
  plans: ControlBillingPlan[];
  onConfigure: () => void;
}) {
  return (
    <ControlCard style={styles.formCard}>
      <View style={styles.cardHeading}>
        <Text style={styles.cardTitle}>Preço-base do plano</Text>
        <ControlStatusBadge label={isOwner ? 'Edição Owner' : 'Somente leitura'} tone={isOwner ? 'info' : 'neutral'} />
      </View>
      <Text style={styles.bodyText}>
        Selecione o catálogo correto antes de salvar. O preço é informado em reais e usado
        somente nas próximas operações de cobrança.
      </Text>
      <View style={styles.planOptions}>
        {plans.map((plan) => (
          <Pressable
            key={plan.code}
            accessibilityRole="radio"
            accessibilityState={{ checked: planCode === plan.code }}
            disabled={!isOwner}
            onPress={() => setPlanCode(plan.code)}
            style={[
              styles.planOption,
              planCode === plan.code && styles.planOptionSelected,
              !isOwner && styles.disabled,
            ]}
          >
            <Text style={[
              styles.planOptionLabel,
              planCode === plan.code && styles.planOptionLabelSelected,
            ]}>
              {plan.name}
            </Text>
            <Text style={styles.planOptionCode}>{plan.code}</Text>
            <Text style={styles.planOptionCode}>
              {formatMoney(plan.basePriceCents, plan.currency)}
            </Text>
          </Pressable>
        ))}
      </View>
      <ControlField
        label="Preço-base em reais"
        value={basePrice}
        onChangeText={setBasePrice}
        placeholder="Ex.: 49,90"
        keyboardType="decimal-pad"
        editable={isOwner}
        helper="Use vírgula ou ponto como separador decimal."
      />
      <ControlButton
        label="Revisar alteração"
        onPress={onConfigure}
        disabled={!isOwner}
      />
      {!isOwner ? (
        <ControlNotice
          tone="info"
          message="Somente SaaS_Owner pode alterar o catálogo de preços."
        />
      ) : null}
    </ControlCard>
  );
}

export function AccountsSection({
  accounts,
  canManage,
  isOwner,
  activationPlanCode,
  setActivationPlanCode,
  plans,
  onAction,
}: {
  accounts: ControlBillingAccount[];
  canManage: boolean;
  isOwner: boolean;
  activationPlanCode: string;
  setActivationPlanCode: (value: string) => void;
  plans: ControlBillingPlan[];
  onAction: (action: PendingBillingAction) => void;
}) {
  if (accounts.length === 0) {
    return (
      <ControlEmptyState
        title="Nenhuma conta de cobrança"
        description="As organizações com conta de cobrança aparecerão aqui."
      />
    );
  }

  const pricedPlans = plans.filter((plan) => plan.basePriceCents !== null);

  return (
    <View style={styles.sectionStack}>
      {canManage ? (
        <ControlCard>
          <Text style={styles.cardTitle}>Plano para novas ativações</Text>
          <Text style={styles.bodyText}>
            A seleção abaixo só será usada quando você revisar e confirmar uma ativação.
          </Text>
          {pricedPlans.length > 0 ? (
            <View style={styles.planOptions}>
              {pricedPlans.map((plan) => (
                <Pressable
                  key={plan.code}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: activationPlanCode === plan.code }}
                  onPress={() => setActivationPlanCode(plan.code)}
                  style={[
                    styles.planOption,
                    activationPlanCode === plan.code && styles.planOptionSelected,
                  ]}
                >
                  <Text style={[
                    styles.planOptionLabel,
                    activationPlanCode === plan.code && styles.planOptionLabelSelected,
                  ]}>
                    {plan.name}
                  </Text>
                  <Text style={styles.planOptionCode}>
                    {formatMoney(plan.basePriceCents, plan.currency)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <ControlNotice
              tone="warning"
              message="Nenhum plano possui preço configurado. Defina o catálogo antes de ativar assinaturas."
            />
          )}
        </ControlCard>
      ) : null}

      {accounts.map((account) => (
        <ControlCard key={account.billingAccountId}>
          <View style={styles.accountHeading}>
            <View style={styles.accountIdentity}>
              <Text style={styles.cardTitle}>{account.organizationName}</Text>
              <Text style={styles.bodyText}>
                {account.configuredUnits} unidade(s) vinculada(s) · período até {formatDate(account.currentPeriodEnd)}
              </Text>
            </View>
            <ControlStatusBadge
              label={account.subscriptionStatus
                ? subscriptionStatusLabels[account.subscriptionStatus]
                : 'Sem assinatura'}
              tone={getStatusTone(account.subscriptionStatus)}
            />
          </View>

          <View style={styles.accountFacts}>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Plano</Text>
              <Text style={styles.factValue}>{account.planCode ?? 'Não configurado'}</Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Bloqueio operacional</Text>
              <Text style={styles.factValue}>
                {account.enforcementEnabled ? 'Ativo' : 'Desativado'}
              </Text>
            </View>
            <View style={styles.fact}>
              <Text style={styles.factLabel}>Cobertura autoritativa</Text>
              <Text style={styles.factValue}>
                {account.activeCoverageUnits} ativa(s)
                {account.scheduledCoverageUnits > 0
                  ? ` · ${account.scheduledCoverageUnits} agendada(s)`
                  : ''}
              </Text>
            </View>
          </View>

          {account.subscriptionId && account.activeCoverageUnits === 0 ? (
            <ControlNotice
              tone="warning"
              message="A assinatura está configurada, mas nenhuma cobertura ativa foi confirmada. A emissão manual fica bloqueada até a reconciliação."
            />
          ) : null}

          {canManage ? (
            account.subscriptionId ? (
              <View style={styles.actions}>
                {(
                  ['active', 'past_due', 'suspended', 'canceled'] as BillingSubscriptionStatus[]
                ).map((status) => (
                  <ControlButton
                    key={status}
                    label={subscriptionStatusLabels[status]}
                    variant={status === 'suspended' || status === 'canceled' ? 'danger' : 'secondary'}
                    disabled={account.subscriptionStatus === status}
                    onPress={() => onAction({ kind: 'change_status', account, status })}
                  />
                ))}
                <ControlButton
                  label={account.activeCoverageUnits > 0 ? 'Emitir fatura' : 'Fatura indisponível'}
                  variant="secondary"
                  disabled={account.activeCoverageUnits === 0}
                  onPress={() => onAction({ kind: 'issue_invoice', account })}
                />
                {isOwner ? (
                  <ControlButton
                    label={account.enforcementEnabled ? 'Desativar bloqueio' : 'Ativar bloqueio'}
                    variant={account.enforcementEnabled ? 'secondary' : 'danger'}
                    onPress={() => onAction({
                      kind: 'change_enforcement',
                      account,
                      enabled: !account.enforcementEnabled,
                    })}
                  />
                ) : null}
              </View>
            ) : (
              <ControlButton
                label="Revisar ativação"
                disabled={pricedPlans.length === 0 || !activationPlanCode}
                onPress={() => onAction({
                  kind: 'activate_subscription',
                  account,
                  planCode: activationPlanCode,
                })}
              />
            )
          ) : (
            <ControlNotice
              tone="info"
              message="Seu papel permite consultar esta conta, mas não executar alterações."
            />
          )}
        </ControlCard>
      ))}
    </View>
  );
}

export function CutoversSection({
  cutovers,
  canManage,
  onAction,
}: {
  cutovers: ControlBillingCutover[];
  canManage: boolean;
  onAction: (action: PendingBillingAction) => void;
}) {
  if (cutovers.length === 0) {
    return (
      <ControlEmptyState
        title="Nenhuma transição pendente"
        description="Cortes agendados ou em reconciliação aparecerão aqui."
      />
    );
  }

  return (
    <View style={styles.sectionStack}>
      {cutovers.map((cutover) => (
        <ControlCard key={cutover.cutoverRequestId}>
          <View style={styles.accountHeading}>
            <View style={styles.accountIdentity}>
              <Text style={styles.cardTitle}>{cutover.organizationName}</Text>
              <Text style={styles.bodyText}>
                {cutover.unitCount} unidade(s) · corte em {formatDate(cutover.cutoverAt)}
              </Text>
            </View>
            <ControlStatusBadge
              label={cutover.status === 'reconciling' ? 'Em reconciliação' : 'Agendada'}
              tone="warning"
            />
          </View>
          <ControlButton
            label="Revisar reconciliação"
            disabled={!canManage}
            onPress={() => onAction({ kind: 'finalize_cutover', cutover })}
          />
        </ControlCard>
      ))}
    </View>
  );
}

export function ConflictsSection({
  conflicts,
  canManage,
  onAction,
}: {
  conflicts: ControlIdentityConflict[];
  canManage: boolean;
  onAction: (action: PendingBillingAction) => void;
}) {
  const pendingConflicts = conflicts.filter((item) => item.status === 'pending');
  if (pendingConflicts.length === 0) {
    return (
      <ControlEmptyState
        title="Nenhum conflito pendente"
        description="Novos conflitos cadastrais aparecerão aqui com dados mascarados."
      />
    );
  }

  return (
    <View style={styles.sectionStack}>
      {pendingConflicts.map((conflict) => (
        <ControlCard key={conflict.conflictId}>
          <View style={styles.accountHeading}>
            <View style={styles.accountIdentity}>
              <Text style={styles.cardTitle}>
                {conflict.documentType ?? 'Documento'} · {conflict.maskedDocument ?? 'não migrado'}
              </Text>
              <Text style={styles.bodyText}>
                {conflictReasonLabels[conflict.reasonCode] ?? 'Revisão cadastral necessária'}
                {' · '}origem {conflict.legacySource}
              </Text>
            </View>
            <ControlStatusBadge label="Pendente" tone="warning" />
          </View>
          <View style={styles.actions}>
            <ControlButton
              label="Vincular"
              variant="secondary"
              disabled={!canManage}
              onPress={() => onAction({
                kind: 'resolve_conflict',
                conflict,
                resolution: 'link',
              })}
            />
            <ControlButton
              label="Solicitar evidência"
              variant="secondary"
              disabled={!canManage}
              onPress={() => onAction({
                kind: 'resolve_conflict',
                conflict,
                resolution: 'request_evidence',
              })}
            />
            <ControlButton
              label="Rejeitar"
              variant="danger"
              disabled={!canManage}
              onPress={() => onAction({
                kind: 'resolve_conflict',
                conflict,
                resolution: 'reject',
              })}
            />
          </View>
        </ControlCard>
      ))}
    </View>
  );
}
