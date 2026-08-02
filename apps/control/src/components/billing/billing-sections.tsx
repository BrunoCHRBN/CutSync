import { Link } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { billingStyles as styles } from '@/components/billing/billing-styles';
import { type PendingBillingAction } from '@/components/billing/billing-types';
import { DataTable } from '@/components/cloud/data-table';
import { FeedbackState } from '@/components/cloud/feedback-state';
import { FilterTabs } from '@/components/cloud/filter-tabs';
import { StatusBadge } from '@/components/cloud/status-badge';
import {
  ControlButton,
  ControlCard,
  ControlEmptyState,
  ControlField,
  ControlNotice,
} from '@/components/control-ui';
import {
  buildFinanceOperationItems,
  buildFinancePendingItems,
  cashAvailability,
  formatFinanceDate,
  formatFinanceRelative,
  formatMoneyCents,
  formatUnitCount,
  labelForConflictReason,
  labelForDataAvailability,
  labelForPlanCode,
  labelForSubscriptionStatus,
  toBillingAccountSummary,
  toPlanCatalogEntry,
  toReconciliationSummary,
  toSubscriptionSummary,
  toneForDataAvailability,
  type BillingAccountSummary,
} from '@/modules/finance/presentation';
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
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

const statusChoices: BillingSubscriptionStatus[] = [
  'active',
  'past_due',
  'suspended',
  'canceled',
];

function DefRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.defRow}>
      <Text style={styles.defLabel}>{label}</Text>
      <Text style={styles.defValue} selectable>{value}</Text>
    </View>
  );
}

export function OverviewSection({
  snapshot,
  loadedAt,
  onRefresh,
}: {
  snapshot: ControlBillingSnapshot;
  loadedAt: string | null;
  onRefresh: () => void;
}) {
  const [period, setPeriod] = useState<FinancePeriod>('30d');
  const pendingItems = useMemo(() => buildFinancePendingItems(snapshot), [snapshot]);
  const operationItems = useMemo(() => buildFinanceOperationItems(snapshot), [snapshot]);
  const cashState = cashAvailability();
  const attentionCount = snapshot.accounts.filter((item) => (
    item.subscriptionStatus === 'past_due' || item.subscriptionStatus === 'suspended'
  )).length;

  return (
    <View style={styles.sectionStack}>
      <View style={styles.periodRow}>
        <FilterTabs tabs={financePeriods} value={period} onChange={setPeriod} />
        <View style={styles.periodMeta}>
          <Text style={styles.metaText}>
            {loadedAt ? `Atualizado ${formatFinanceRelative(loadedAt)}` : 'Sem atualização'}
          </Text>
          <ControlButton label="Atualizar" variant="secondary" onPress={onRefresh} />
        </View>
      </View>
      {period === 'custom' ? (
        <Text style={styles.bodyText}>
          Intervalo personalizado aguarda seletor ligado a uma fonte temporal de caixa.
        </Text>
      ) : (
        <Text style={styles.bodyText}>
          O período ({financePeriods.find((item) => item.id === period)?.label}) não altera
          o snapshot atual — a fonte de cobrança é consolidada, sem série temporal.
        </Text>
      )}

      <ControlCard style={styles.stripCard}>
        <View style={styles.strip}>
          <StripCell
            label="Recebido"
            value="—"
            detail="Valor confirmado"
            badge={labelForDataAvailability(cashState)}
            tone={toneForDataAvailability(cashState)}
          />
          <StripCell
            label="Pendente"
            value={attentionCount.toLocaleString('pt-BR')}
            detail="Assinaturas em atraso ou suspensas"
            badge={attentionCount > 0 ? 'Atenção' : 'Sem pendências'}
            tone={attentionCount > 0 ? 'warning' : 'success'}
          />
          <StripCell
            label="Previsto"
            value="—"
            detail="Previsão de caixa indisponível nesta fonte"
            badge={labelForDataAvailability('history_unavailable')}
            tone="info"
          />
          <StripCell
            label="Conciliação"
            value={snapshot.cutovers.length.toLocaleString('pt-BR')}
            detail="Transições aguardando reconciliação"
            badge={snapshot.cutovers.length > 0 ? 'Operacional' : 'Em dia'}
            tone={snapshot.cutovers.length > 0 ? 'warning' : 'success'}
          />
        </View>
      </ControlCard>

      <View style={styles.grid}>
        <ControlCard style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.cardTitle}>Pendências financeiras</Text>
            <StatusBadge
              label={pendingItems.length === 0 ? 'Nenhuma' : `${pendingItems.length}`}
              tone={pendingItems.length === 0 ? 'success' : 'warning'}
            />
          </View>
          {pendingItems.length === 0 ? (
            <FeedbackState
              kind="empty"
              title="Nenhuma pendência encontrada no período"
              message="Não há assinaturas em atraso, suspensões, conciliações ou conflitos no snapshot atual."
            />
          ) : (
            <DataTable
              columns={[
                { key: 'type', header: 'Tipo', render: (row) => row.type },
                { key: 'qty', header: 'Qtde', render: (row) => String(row.quantity) },
                { key: 'amount', header: 'Valor', render: (row) => row.amountLabel },
                { key: 'oldest', header: 'Mais antiga', render: (row) => row.oldestLabel },
              ]}
              rows={pendingItems}
              rowKey={(row) => row.id}
            />
          )}
          <Link href={CLOUD_ROUTES.financeiro.cobrancas} asChild>
            <Pressable style={styles.textLinkWrap}>
              <Text style={styles.textLink}>Ver todas as cobranças →</Text>
            </Pressable>
          </Link>
        </ControlCard>

        <ControlCard style={styles.panel}>
          <Text style={styles.cardTitle}>Estado da operação</Text>
          <View style={styles.opList}>
            {operationItems.map((item) => (
              <Link key={item.id} href={item.href as never} asChild>
                <Pressable style={styles.opRow}>
                  <View style={styles.opMain}>
                    <Text style={styles.opLabel}>{item.label}</Text>
                    <Text style={styles.opDetail}>{item.detail}</Text>
                  </View>
                  <Text style={styles.opCount}>{item.count.toLocaleString('pt-BR')}</Text>
                  <Text style={styles.opChevron}>›</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </ControlCard>
      </View>

      <View style={styles.grid}>
        <ControlCard style={styles.panel}>
          <Text style={styles.cardTitle}>Fluxo financeiro</Text>
          <FeedbackState
            kind="partial"
            title="Histórico financeiro ainda indisponível"
            message="A fonte atual fornece somente o resumo consolidado de contas, planos e conciliações. Dados simulados não são utilizados."
          />
        </ControlCard>

        <ControlCard style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.cardTitle}>Movimentações recentes</Text>
            <Link href={CLOUD_ROUTES.financeiro.movimentacoes} asChild>
              <Pressable>
                <Text style={styles.textLink}>Ver todas</Text>
              </Pressable>
            </Link>
          </View>
          <DataTable
            columns={[
              { key: 'date', header: 'Data', render: (row: { date: string }) => row.date },
              { key: 'description', header: 'Descrição', render: (row: { description: string }) => row.description },
              { key: 'type', header: 'Tipo', render: (row: { type: string }) => row.type },
              { key: 'amount', header: 'Valor', render: (row: { amount: string }) => row.amount },
              { key: 'status', header: 'Status', render: (row: { status: string }) => row.status },
            ]}
            rows={[] as {
              date: string;
              description: string;
              type: string;
              amount: string;
              status: string;
            }[]}
            rowKey={(row) => row.date + row.description}
            emptyLabel="Nenhuma movimentação financeira disponível nesta sessão."
          />
        </ControlCard>
      </View>
    </View>
  );
}

function StripCell({
  label,
  value,
  detail,
  badge,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  badge: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}) {
  return (
    <View style={styles.stripCell}>
      <Text style={styles.stripLabel}>{label}</Text>
      <Text style={styles.stripValue}>{value}</Text>
      <Text style={styles.stripDetail}>{detail}</Text>
      <StatusBadge label={badge} tone={tone} />
    </View>
  );
}

export function PlansSection({
  isOwner,
  canManage,
  planCode,
  setPlanCode,
  basePrice,
  setBasePrice,
  plans,
  accounts,
  activationPlanCode,
  setActivationPlanCode,
  onConfigure,
  onAction,
}: {
  isOwner: boolean;
  canManage: boolean;
  planCode: string;
  setPlanCode: (value: string) => void;
  basePrice: string;
  setBasePrice: (value: string) => void;
  plans: ControlBillingPlan[];
  accounts: ControlBillingAccount[];
  activationPlanCode: string;
  setActivationPlanCode: (value: string) => void;
  onConfigure: () => void;
  onAction: (action: PendingBillingAction) => void;
}) {
  const [tab, setTab] = useState<'subscriptions' | 'catalog'>('subscriptions');
  const subscriptions = useMemo(
    () => accounts.map(toSubscriptionSummary).filter((item): item is NonNullable<typeof item> => Boolean(item)),
    [accounts],
  );
  const catalog = useMemo(() => plans.map(toPlanCatalogEntry), [plans]);
  const selectedPlan = catalog.find((item) => item.code === planCode) ?? null;
  const pricedPlans = plans.filter((plan) => plan.basePriceCents !== null);

  return (
    <View style={styles.sectionStack}>
      <FilterTabs
        tabs={[
          { id: 'subscriptions', label: 'Assinaturas' },
          { id: 'catalog', label: 'Catálogo e preços' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <StatusBadge label="Fontes operacionais parciais" tone="info" />

      {tab === 'subscriptions' ? (
        <ControlCard style={styles.panel}>
          <Text style={styles.cardTitle}>Assinaturas vigentes</Text>
          <Text style={styles.bodyText}>
            Contratos existentes derivados das contas de cobrança. Início individual não é
            exposto pela fonte atual.
          </Text>
          {canManage && pricedPlans.length > 0 ? (
            <View style={styles.inlineSelect}>
              <Text style={styles.factLabel}>Plano para novas ativações</Text>
              <View style={styles.chipRow}>
                {pricedPlans.map((plan) => (
                  <Pressable
                    key={plan.code}
                    onPress={() => setActivationPlanCode(plan.code)}
                    style={[
                      styles.filterChip,
                      activationPlanCode === plan.code && styles.filterChipOn,
                    ]}
                  >
                    <Text style={styles.filterChipText}>{labelForPlanCode(plan.code)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          {subscriptions.length === 0 ? (
            <ControlEmptyState
              title="Nenhuma assinatura individual disponível nesta sessão"
              description="Contas sem assinatura aparecem em Cobranças para ativação."
            />
          ) : (
            <DataTable
              columns={[
                { key: 'org', header: 'Organização', render: (row) => row.organizationName },
                { key: 'plan', header: 'Plano', render: (row) => row.planLabel },
                {
                  key: 'state',
                  header: 'Estado',
                  render: (row) => <StatusBadge label={row.lifecycleLabel} tone={row.lifecycleTone} />,
                },
                { key: 'start', header: 'Início', render: (row) => row.startLabel },
                { key: 'renewal', header: 'Renovação', render: (row) => row.renewalLabel },
                {
                  key: 'billing',
                  header: 'Cobrança',
                  render: (row) => row.billingStatusLabel,
                },
              ]}
              rows={subscriptions}
              rowKey={(row) => row.id}
            />
          )}
          {canManage ? (
            <View style={styles.sectionStack}>
              {accounts.filter((account) => !account.subscriptionId).map((account) => (
                <ControlCard key={account.billingAccountId}>
                  <Text style={styles.cardTitle}>{account.organizationName}</Text>
                  <Text style={styles.bodyText}>Conta sem assinatura ativa.</Text>
                  <ControlButton
                    label="Revisar ativação"
                    disabled={pricedPlans.length === 0 || !activationPlanCode}
                    onPress={() => onAction({
                      kind: 'activate_subscription',
                      account,
                      planCode: activationPlanCode,
                    })}
                  />
                </ControlCard>
              ))}
            </View>
          ) : null}
        </ControlCard>
      ) : (
        <View style={styles.grid}>
          <ControlCard style={[styles.panel, styles.panelWide]}>
            <Text style={styles.cardTitle}>Catálogo e preços</Text>
            <DataTable
              columns={[
                {
                  key: 'plan',
                  header: 'Plano',
                  render: (row) => (
                    <View>
                      <Text style={styles.cellStrong}>{row.name}</Text>
                      <Text style={styles.cellMono}>{row.code}</Text>
                    </View>
                  ),
                },
                { key: 'price', header: 'Preço-base', render: (row) => row.priceLabel },
                {
                  key: 'state',
                  header: 'Estado',
                  render: (row) => <StatusBadge label={row.stateLabel} tone={row.stateTone} />,
                },
                {
                  key: 'actions',
                  header: 'Ações',
                  render: (row) => (
                    <ControlButton
                      label="Selecionar"
                      variant="secondary"
                      disabled={!isOwner}
                      onPress={() => {
                        setPlanCode(row.code);
                        setBasePrice(
                          row.raw.basePriceCents !== null
                            ? (row.raw.basePriceCents / 100).toFixed(2).replace('.', ',')
                            : '',
                        );
                      }}
                    />
                  ),
                },
              ]}
              rows={catalog}
              rowKey={(row) => row.code}
              emptyLabel="Nenhum plano ativo no catálogo."
            />
            <Text style={styles.metaText}>Exibindo {catalog.length} de {catalog.length} planos</Text>
          </ControlCard>

          <ControlCard style={styles.panel}>
            <Text style={styles.cardTitle}>Configurar preço-base</Text>
            {selectedPlan ? (
              <>
                <DefRow label="Plano" value={selectedPlan.name} />
                <DefRow label="Código interno" value={selectedPlan.code} />
                <DefRow label="Preço atual" value={selectedPlan.priceLabel} />
                <ControlField
                  label="Novo preço"
                  value={basePrice}
                  onChangeText={setBasePrice}
                  placeholder="0,00"
                  keyboardType="decimal-pad"
                  editable={isOwner}
                  helper="Use vírgula ou ponto como separador decimal."
                />
                <ControlNotice
                  tone="info"
                  message="O novo valor será usado nas próximas operações de cobrança configuradas pelo backend. Assinaturas já faturadas não são reescritas por esta tela."
                />
                <View style={styles.actions}>
                  <ControlButton
                    label="Cancelar"
                    variant="secondary"
                    disabled={!isOwner}
                    onPress={() => setBasePrice('')}
                  />
                  <ControlButton
                    label="Revisar alteração"
                    onPress={onConfigure}
                    disabled={!isOwner}
                  />
                </View>
              </>
            ) : (
              <Text style={styles.bodyText}>Selecione um plano na tabela para editar o preço-base.</Text>
            )}
            {!isOwner ? (
              <ControlNotice
                tone="info"
                message="Somente Proprietário pode alterar o catálogo de preços."
              />
            ) : null}
          </ControlCard>
        </View>
      )}
    </View>
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
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BillingSubscriptionStatus | 'none' | null>(null);
  const [blockFilter, setBlockFilter] = useState<'yes' | 'no' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusPickerFor, setStatusPickerFor] = useState<ControlBillingAccount | null>(null);
  const [draftStatus, setDraftStatus] = useState<BillingSubscriptionStatus>('active');

  const summaries = useMemo(() => accounts.map(toBillingAccountSummary), [accounts]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return summaries.filter((row) => {
      if (needle && !row.organizationName.toLowerCase().includes(needle)) return false;
      if (statusFilter === 'none' && row.raw.subscriptionStatus) return false;
      if (statusFilter && statusFilter !== 'none' && row.raw.subscriptionStatus !== statusFilter) {
        return false;
      }
      if (blockFilter === 'yes' && !row.raw.enforcementEnabled) return false;
      if (blockFilter === 'no' && row.raw.enforcementEnabled) return false;
      return true;
    });
  }, [summaries, query, statusFilter, blockFilter]);

  const selected = filtered.find((row) => row.id === selectedId) ?? null;
  const pricedPlans = plans.filter((plan) => plan.basePriceCents !== null);
  const planByCode = useMemo(() => {
    const map = new Map(plans.map((plan) => [plan.code, plan]));
    return map;
  }, [plans]);

  if (accounts.length === 0) {
    return (
      <ControlEmptyState
        title="Nenhuma conta de cobrança"
        description="As organizações com conta de cobrança aparecerão aqui."
      />
    );
  }

  return (
    <View style={styles.sectionStack}>
      <ControlCard style={styles.toolbarCard}>
        <View style={styles.toolbar}>
          <Text style={styles.metaStrong}>
            {filtered.length.toLocaleString('pt-BR')} conta{filtered.length === 1 ? '' : 's'}
          </Text>
          <ControlField
            label="Buscar organização"
            value={query}
            onChangeText={setQuery}
            placeholder="Nome da organização"
            containerStyle={styles.searchField}
          />
          <View style={styles.chipRow}>
            {statusChoices.map((status) => (
              <Pressable
                key={status}
                onPress={() => setStatusFilter((current) => (current === status ? null : status))}
                style={[styles.filterChip, statusFilter === status && styles.filterChipOn]}
              >
                <Text style={styles.filterChipText}>{labelForSubscriptionStatus(status)}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setBlockFilter((current) => (current === 'yes' ? null : 'yes'))}
              style={[styles.filterChip, blockFilter === 'yes' && styles.filterChipOn]}
            >
              <Text style={styles.filterChipText}>Com bloqueio</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setQuery('');
                setStatusFilter(null);
                setBlockFilter(null);
              }}
            >
              <Text style={styles.textLink}>Limpar</Text>
            </Pressable>
          </View>
        </View>
      </ControlCard>

      {canManage && pricedPlans.length > 0 ? (
        <ControlCard>
          <Text style={styles.cardTitle}>Plano para novas ativações</Text>
          <View style={styles.chipRow}>
            {pricedPlans.map((plan) => (
              <Pressable
                key={plan.code}
                onPress={() => setActivationPlanCode(plan.code)}
                style={[
                  styles.filterChip,
                  activationPlanCode === plan.code && styles.filterChipOn,
                ]}
              >
                <Text style={styles.filterChipText}>
                  {labelForPlanCode(plan.code)} · {formatMoneyCents(plan.basePriceCents, plan.currency)}
                </Text>
              </Pressable>
            ))}
          </View>
        </ControlCard>
      ) : null}

      <View style={[styles.split, compact && styles.splitCompact]}>
        <View style={styles.tablePane}>
          {!compact ? (
            <View style={styles.table}>
              <View style={styles.tableHead}>
                <Text style={[styles.headCell, styles.colOrg]}>Organização</Text>
                <Text style={[styles.headCell, styles.colPlan]}>Plano</Text>
                <Text style={[styles.headCell, styles.colState]}>Estado</Text>
                <Text style={[styles.headCell, styles.colBlock]}>Bloqueio</Text>
                <Text style={[styles.headCell, styles.colUnits]}>Unidades</Text>
                <Text style={[styles.headCell, styles.colPeriod]}>Vigência</Text>
              </View>
              {filtered.map((row) => (
                <Pressable
                  key={row.id}
                  accessibilityRole="button"
                  onPress={() => setSelectedId(row.id)}
                  style={[styles.tableRow, selectedId === row.id && styles.tableRowSelected]}
                >
                  <View style={styles.colOrg}>
                    <Text style={styles.cellStrong}>{row.organizationName}</Text>
                    <Text style={styles.cellMono}>{row.organizationIdHint ?? '—'}</Text>
                  </View>
                  <Text style={[styles.cell, styles.colPlan]}>{row.planLabel}</Text>
                  <View style={styles.colState}>
                    <StatusBadge label={row.statusLabel} tone={row.statusTone} />
                  </View>
                  <Text style={[styles.cell, styles.colBlock]}>{row.blockLabel}</Text>
                  <Text style={[styles.cell, styles.colUnits]}>{row.unitsLabel}</Text>
                  <Text style={[styles.cell, styles.colPeriod]}>{row.periodLabel}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.sectionStack}>
              {filtered.map((row) => (
                <Pressable
                  key={row.id}
                  onPress={() => setSelectedId(row.id)}
                  style={[styles.mobileCard, selectedId === row.id && styles.tableRowSelected]}
                >
                  <Text style={styles.cellStrong}>{row.organizationName}</Text>
                  <Text style={styles.bodyText}>{row.planLabel}</Text>
                  <View style={styles.chipRow}>
                    <StatusBadge label={row.statusLabel} tone={row.statusTone} />
                    <StatusBadge label={`Bloqueio: ${row.blockLabel}`} tone="neutral" />
                  </View>
                  <Text style={styles.metaText}>{row.unitsLabel} · {row.periodLabel}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {filtered.length === 0 ? (
            <Text style={styles.bodyText}>Nenhuma conta corresponde aos filtros atuais.</Text>
          ) : null}
          <Text style={styles.metaText}>
            Exibindo {filtered.length} de {accounts.length} conta{accounts.length === 1 ? '' : 's'}
          </Text>
        </View>

        {selected ? (
          <AccountDrawer
            summary={selected}
            plan={selected.planCode ? planByCode.get(selected.planCode) ?? null : null}
            compact={compact}
            canManage={canManage}
            isOwner={isOwner}
            activationPlanCode={activationPlanCode}
            onClose={() => setSelectedId(null)}
            onChangeStatus={() => {
              setStatusPickerFor(selected.raw);
              setDraftStatus(selected.raw.subscriptionStatus ?? 'active');
            }}
            onIssueInvoice={() => onAction({ kind: 'issue_invoice', account: selected.raw })}
            onToggleBlock={() => onAction({
              kind: 'change_enforcement',
              account: selected.raw,
              enabled: !selected.raw.enforcementEnabled,
            })}
            onActivate={() => onAction({
              kind: 'activate_subscription',
              account: selected.raw,
              planCode: activationPlanCode,
            })}
          />
        ) : null}
      </View>

      <Modal
        visible={Boolean(statusPickerFor)}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusPickerFor(null)}
      >
        <View style={styles.modalBackdrop}>
          <ControlCard style={styles.modalCard}>
            <Text style={styles.cardTitle}>Alterar estado</Text>
            <Text style={styles.bodyText}>
              Estado atual:{' '}
              {labelForSubscriptionStatus(statusPickerFor?.subscriptionStatus)}
            </Text>
            <View style={styles.chipRow}>
              {statusChoices.map((status) => (
                <Pressable
                  key={status}
                  onPress={() => setDraftStatus(status)}
                  style={[styles.filterChip, draftStatus === status && styles.filterChipOn]}
                >
                  <Text style={styles.filterChipText}>{labelForSubscriptionStatus(status)}</Text>
                </Pressable>
              ))}
            </View>
            <ControlNotice
              tone={draftStatus === 'canceled' ? 'warning' : 'info'}
              message={
                draftStatus === 'canceled'
                  ? 'Cancelamento é uma ação destrutiva e exige justificativa na confirmação.'
                  : 'Suspensão e atraso são ações de atenção. A alteração será revisada antes de aplicar.'
              }
            />
            <View style={styles.actions}>
              <ControlButton
                label="Cancelar"
                variant="secondary"
                onPress={() => setStatusPickerFor(null)}
              />
              <ControlButton
                label="Revisar alteração"
                disabled={!statusPickerFor || statusPickerFor.subscriptionStatus === draftStatus}
                onPress={() => {
                  if (!statusPickerFor) return;
                  onAction({
                    kind: 'change_status',
                    account: statusPickerFor,
                    status: draftStatus,
                  });
                  setStatusPickerFor(null);
                }}
              />
            </View>
          </ControlCard>
        </View>
      </Modal>
    </View>
  );
}

function AccountDrawer({
  summary,
  plan,
  compact,
  canManage,
  isOwner,
  activationPlanCode,
  onClose,
  onChangeStatus,
  onIssueInvoice,
  onToggleBlock,
  onActivate,
}: {
  summary: BillingAccountSummary;
  plan: ControlBillingPlan | null;
  compact: boolean;
  canManage: boolean;
  isOwner: boolean;
  activationPlanCode: string;
  onClose: () => void;
  onChangeStatus: () => void;
  onIssueInvoice: () => void;
  onToggleBlock: () => void;
  onActivate: () => void;
}) {
  const account = summary.raw;
  return (
    <View style={[styles.drawer, compact && styles.drawerFull]} accessibilityViewIsModal>
      <View style={styles.drawerHead}>
        <Text style={styles.cardTitle}>Detalhes da conta</Text>
        <Pressable onPress={onClose}><Text style={styles.textLink}>Fechar</Text></Pressable>
      </View>
      <Text style={styles.drawerName}>{summary.organizationName}</Text>
      <Text style={styles.cellMono}>{summary.organizationIdHint ?? account.organizationId}</Text>
      <StatusBadge label={summary.statusLabel} tone={summary.statusTone} />

      <View style={styles.defList}>
        <DefRow
          label="Plano atual"
          value={
            plan
              ? `${labelForPlanCode(plan.code)} · ${formatMoneyCents(plan.basePriceCents, plan.currency)}`
              : summary.planLabel
          }
        />
        <DefRow label="Estado da cobrança" value={summary.statusLabel} />
        <DefRow
          label="Bloqueio operacional"
          value={account.enforcementEnabled ? 'Sim — enforcement ativo' : 'Não'}
        />
        <DefRow label="Unidades cobertas" value={formatUnitCount(account.activeCoverageUnits || account.configuredUnits)} />
        <DefRow label="Período atual" value={summary.periodLabel} />
        <DefRow
          label="Cobertura"
          value={`${account.activeCoverageUnits} ativa(s)${account.scheduledCoverageUnits > 0 ? ` · ${account.scheduledCoverageUnits} agendada(s)` : ''}`}
        />
      </View>

      {account.subscriptionId && account.activeCoverageUnits === 0 ? (
        <ControlNotice
          tone="warning"
          message="A assinatura está configurada, mas nenhuma cobertura ativa foi confirmada. A emissão manual fica bloqueada até a reconciliação."
        />
      ) : null}

      {canManage ? (
        account.subscriptionId ? (
          <View style={styles.actionList}>
            <ActionRow label="Alterar estado" detail="Ativar, atraso, suspender ou cancelar" onPress={onChangeStatus} />
            <ActionRow
              label={account.activeCoverageUnits > 0 ? 'Emitir fatura' : 'Fatura indisponível'}
              detail="Revisão com vencimento em sete dias"
              onPress={onIssueInvoice}
              disabled={account.activeCoverageUnits === 0}
            />
            {isOwner ? (
              <ActionRow
                label={account.enforcementEnabled ? 'Desativar bloqueio' : 'Configurar bloqueio'}
                detail="Bloqueio operacional é distinto do estado de cobrança"
                onPress={onToggleBlock}
              />
            ) : null}
            <ActionRow label="Ver histórico" detail="Histórico detalhado ainda sem fonte nesta sessão" disabled />
          </View>
        ) : (
          <ControlButton
            label="Revisar ativação"
            disabled={!activationPlanCode}
            onPress={onActivate}
          />
        )
      ) : (
        <ControlNotice
          tone="info"
          message="Seu papel permite consultar esta conta, mas não executar alterações."
        />
      )}
    </View>
  );
}

function ActionRow({
  label,
  detail,
  onPress,
  disabled,
}: {
  label: string;
  detail: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionRow, disabled && styles.disabled]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.opLabel}>{label}</Text>
        <Text style={styles.opDetail}>{detail}</Text>
      </View>
      <Text style={styles.opChevron}>›</Text>
    </Pressable>
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
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [selectedId, setSelectedId] = useState<string | null>(cutovers[0]?.cutoverRequestId ?? null);
  const rows = useMemo(() => cutovers.map((item) => toReconciliationSummary(item)), [cutovers]);
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  if (cutovers.length === 0) {
    return (
      <ControlEmptyState
        title="Nenhuma transição pendente"
        description="Cortes agendados ou em reconciliação aparecerão na fila."
      />
    );
  }

  return (
    <View style={[styles.split, compact && styles.splitCompact]}>
      <ControlCard style={styles.tablePane}>
        <Text style={styles.cardTitle}>Fila de conciliação</Text>
        <DataTable
          columns={[
            { key: 'org', header: 'Organização', render: (row) => row.organizationName },
            { key: 'units', header: 'Unidades', render: (row) => row.unitsLabel },
            { key: 'date', header: 'Data de corte', render: (row) => row.cutoverLabel },
            {
              key: 'state',
              header: 'Estado',
              render: (row) => <StatusBadge label={row.statusLabel} tone={row.statusTone} />,
            },
            { key: 'conflicts', header: 'Conflitos', render: (row) => row.conflictsLabel },
            {
              key: 'actions',
              header: 'Ações',
              render: (row) => (
                <ControlButton
                  label="Revisar"
                  variant="secondary"
                  onPress={() => setSelectedId(row.id)}
                />
              ),
            },
          ]}
          rows={rows}
          rowKey={(row) => row.id}
        />
      </ControlCard>

      {selected ? (
        <ControlCard style={[styles.drawer, compact && styles.drawerFull]}>
          <Text style={styles.cardTitle}>Revisão de conciliação</Text>
          <View style={styles.defList}>
            <DefRow label="Organização" value={selected.organizationName} />
            <DefRow label="Data de corte" value={selected.cutoverLabel} />
            <DefRow label="Unidades" value={selected.unitsLabel} />
            <DefRow label="Assinaturas individuais" value="Não disponível" />
            <DefRow label="Estado" value={selected.statusLabel} />
            <DefRow label="Plano atual" value="Não disponível" />
            <DefRow label="Plano resultante" value="Não disponível" />
            <DefRow label="Valor atual" value="Não disponível" />
            <DefRow label="Valor resultante" value="Não disponível" />
            <DefRow label="Conflitos" value={selected.conflictsLabel} />
          </View>
          <ControlNotice
            tone="info"
            message="Ao confirmar, os cortes de cobrança serão aplicados e a ação será registrada na auditoria do backend."
          />
          <View style={styles.actions}>
            <ControlButton
              label="Cancelar"
              variant="secondary"
              onPress={() => setSelectedId(null)}
            />
            <ControlButton
              label="Finalizar conciliação"
              disabled={!canManage}
              onPress={() => onAction({ kind: 'finalize_cutover', cutover: selected.raw })}
            />
          </View>
        </ControlCard>
      ) : null}
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
        title="Nenhum conflito de conciliação identificado"
        description="Novos conflitos cadastrais aparecerão aqui com dados mascarados."
      />
    );
  }

  return (
    <ControlCard style={styles.panel}>
      <Text style={styles.cardTitle}>Conflitos</Text>
      <DataTable
        columns={[
          {
            key: 'org',
            header: 'Documento',
            render: (row) => `${row.documentType ?? 'Documento'} · ${row.maskedDocument ?? 'mascarado'}`,
          },
          {
            key: 'type',
            header: 'Tipo',
            render: (row) => labelForConflictReason(row.reasonCode),
          },
          { key: 'origin', header: 'Origem', render: (row) => row.legacySource },
          { key: 'at', header: 'Detectado em', render: (row) => formatFinanceDate(row.createdAt) },
          {
            key: 'state',
            header: 'Estado',
            render: () => <StatusBadge label="Pendente" tone="warning" />,
          },
          {
            key: 'actions',
            header: 'Ação',
            render: (row) => (
              <View style={styles.chipRow}>
                <ControlButton
                  label="Vincular"
                  variant="secondary"
                  disabled={!canManage}
                  onPress={() => onAction({ kind: 'resolve_conflict', conflict: row, resolution: 'link' })}
                />
                <ControlButton
                  label="Evidência"
                  variant="secondary"
                  disabled={!canManage}
                  onPress={() => onAction({
                    kind: 'resolve_conflict',
                    conflict: row,
                    resolution: 'request_evidence',
                  })}
                />
                <ControlButton
                  label="Rejeitar"
                  variant="danger"
                  disabled={!canManage}
                  onPress={() => onAction({
                    kind: 'resolve_conflict',
                    conflict: row,
                    resolution: 'reject',
                  })}
                />
              </View>
            ),
          },
        ]}
        rows={pendingConflicts}
        rowKey={(row) => row.conflictId}
      />
    </ControlCard>
  );
}
