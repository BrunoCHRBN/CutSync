import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

import {
  BillingConfirmation,
  getBillingConfirmationCopy,
} from '@/components/billing/billing-confirmation';
import {
  BillingNavigation,
  billingSectionMetadata,
} from '@/components/billing/billing-navigation';
import {
  AccountsSection,
  ConflictsSection,
  CutoversSection,
  OverviewSection,
  PlansSection,
} from '@/components/billing/billing-sections';
import { billingStyles as styles } from '@/components/billing/billing-styles';
import type {
  BillingSection,
  NoticeState,
  PendingBillingAction,
} from '@/components/billing/billing-types';
import { ControlNotice } from '@/components/control-ui';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { resolveCloudActionAvailability } from '@/features/cloud/cloud-action-availability';
import {
  activateControlSubscription,
  configureControlPlan,
  finalizeControlBillingCutover,
  getControlBillingSnapshot,
  issueControlInvoice,
  resolveControlIdentityConflict,
  setControlSubscriptionEnforcement,
  setControlSubscriptionStatus,
  type ControlBillingSnapshot,
} from '@/services/control-billing';
import { colors } from '@/theme/tokens';

export type { BillingSection } from '@/components/billing/billing-types';

function formatCurrencyInput(value: string): number | null {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (!normalized) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function BillingOperations({
  section,
  hideChrome = false,
}: {
  section: BillingSection;
  hideChrome?: boolean;
}) {
  const { can, context } = useControlAuth();
  const financeWrite = resolveCloudActionAvailability({
    action: 'finance_write',
    can,
  });
  const canManage = financeWrite.enabled;
  const isOwner = context?.role === 'SaaS_Owner' && financeWrite.enabled;
  const [snapshot, setSnapshot] = useState<ControlBillingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [planCode, setPlanCode] = useState('network');
  const [activationPlanCode, setActivationPlanCode] = useState('multi_unit_standard');
  const [basePrice, setBasePrice] = useState('');
  const [reason, setReason] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingBillingAction | null>(null);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const nextSnapshot = await getControlBillingSnapshot();
      setSnapshot(nextSnapshot);
      setPlanCode((current) => (
        nextSnapshot.plans.some((plan) => plan.code === current)
          ? current
          : nextSnapshot.plans[0]?.code ?? ''
      ));
      setActivationPlanCode((current) => (
        nextSnapshot.plans.some((plan) => (
          plan.code === current && plan.basePriceCents !== null
        ))
          ? current
          : nextSnapshot.plans.find((plan) => plan.basePriceCents !== null)?.code ?? ''
      ));
      setNotice(null);
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Dados indisponíveis',
        message: error instanceof Error
          ? error.message
          : 'Não foi possível carregar a área de cobrança.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const confirmationCopy = useMemo(
    () => pendingAction ? getBillingConfirmationCopy(pendingAction) : null,
    [pendingAction],
  );

  const openPlanConfirmation = () => {
    const cents = formatCurrencyInput(basePrice);
    if (cents === null) {
      setNotice({
        tone: 'warning',
        title: 'Preço inválido',
        message: 'Informe um preço-base válido antes de revisar a alteração.',
      });
      return;
    }
    setNotice(null);
    setPendingAction({ kind: 'configure_plan', planCode, basePriceCents: cents });
  };

  const executePendingAction = async () => {
    if (!pendingAction || !confirmationCopy) return;
    const normalizedReason = reason.trim();
    if (
      confirmationCopy.requiresReason
      && (normalizedReason.length < 10 || normalizedReason.length > 500)
    ) {
      setNotice({
        tone: 'warning',
        title: 'Justificativa necessária',
        message: 'Informe uma justificativa entre 10 e 500 caracteres.',
      });
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      switch (pendingAction.kind) {
        case 'configure_plan':
          await configureControlPlan(pendingAction.planCode, pendingAction.basePriceCents);
          break;
        case 'activate_subscription':
          await activateControlSubscription(
            pendingAction.account.organizationId,
            pendingAction.planCode,
          );
          break;
        case 'change_status':
          if (!pendingAction.account.subscriptionId) throw new Error('Assinatura não localizada.');
          await setControlSubscriptionStatus(
            pendingAction.account.subscriptionId,
            pendingAction.status,
            normalizedReason,
          );
          break;
        case 'issue_invoice':
          if (!pendingAction.account.subscriptionId) throw new Error('Assinatura não localizada.');
          await issueControlInvoice(pendingAction.account.subscriptionId);
          break;
        case 'change_enforcement':
          if (!pendingAction.account.subscriptionId) throw new Error('Assinatura não localizada.');
          await setControlSubscriptionEnforcement(
            pendingAction.account.subscriptionId,
            pendingAction.enabled,
            normalizedReason,
          );
          break;
        case 'finalize_cutover':
          await finalizeControlBillingCutover(pendingAction.cutover.cutoverRequestId);
          break;
        case 'resolve_conflict':
          await resolveControlIdentityConflict(
            pendingAction.conflict.conflictId,
            pendingAction.resolution,
            normalizedReason,
          );
          break;
      }
      setPendingAction(null);
      setReason('');
      setNotice({
        tone: 'success',
        title: 'Operação concluída',
        message: 'A alteração foi registrada e os dados foram atualizados.',
      });
      await load(false);
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Operação não concluída',
        message: error instanceof Error
          ? error.message
          : 'Não foi possível concluir a operação.',
      });
    } finally {
      setBusy(false);
    }
  };

  const meta = billingSectionMetadata[section];

  const body = (
    <>
      {!hideChrome ? <BillingNavigation /> : null}

      {notice ? (
        <ControlNotice
          title={notice.title}
          message={notice.message}
          tone={notice.tone}
          action={notice.title === 'Dados indisponíveis'
            ? { label: 'Tentar novamente', onPress: () => { void load(); } }
            : undefined}
        />
      ) : null}

      {loading && !snapshot ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={styles.bodyText}>Atualizando dados de cobrança...</Text>
        </View>
      ) : null}

      {pendingAction && confirmationCopy ? (
        <BillingConfirmation
          copy={confirmationCopy}
          reason={reason}
          busy={busy}
          onReasonChange={setReason}
          onConfirm={() => { void executePendingAction(); }}
          onCancel={() => {
            setPendingAction(null);
            setReason('');
          }}
        />
      ) : null}

      {snapshot && section === 'overview' ? <OverviewSection snapshot={snapshot} /> : null}
      {snapshot && section === 'plans' ? (
        <PlansSection
          isOwner={isOwner}
          planCode={planCode}
          setPlanCode={setPlanCode}
          basePrice={basePrice}
          setBasePrice={setBasePrice}
          plans={snapshot.plans}
          onConfigure={openPlanConfirmation}
        />
      ) : null}
      {snapshot && section === 'accounts' ? (
        <AccountsSection
          accounts={snapshot.accounts}
          canManage={canManage}
          isOwner={isOwner}
          activationPlanCode={activationPlanCode}
          setActivationPlanCode={setActivationPlanCode}
          plans={snapshot.plans}
          onAction={setPendingAction}
        />
      ) : null}
      {snapshot && section === 'cutovers' ? (
        <CutoversSection
          cutovers={snapshot.cutovers}
          canManage={canManage}
          onAction={setPendingAction}
        />
      ) : null}
      {snapshot && section === 'conflicts' ? (
        <ConflictsSection
          conflicts={snapshot.conflicts}
          canManage={canManage}
          onAction={setPendingAction}
        />
      ) : null}
    </>
  );

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <SectionPage
        eyebrow={meta.eyebrow}
        title={meta.title}
        description={meta.description}
      >
        {body}
      </SectionPage>
    </ScrollView>
  );
}
