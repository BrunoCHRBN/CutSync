import type {
  EstablishmentPaymentMethod,
  EstablishmentPaymentMethodType,
} from '@cutsync/database';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import {
  createBusinessQueryKey,
  shouldRetryBusinessQuery,
} from '@/features/connectivity/business-query';
import { createMobileRequestId } from '@/lib/mobile-request-id';
import { businessApi, BusinessApiError } from '@/services/business-api';
import { businessTheme } from '@/theme/business-theme';

interface PaymentMethodDraft {
  methodType: EstablishmentPaymentMethodType;
  displayName: string;
  active: boolean;
  requiresReference: boolean;
  version: number | null;
}

const METHOD_DEFAULTS: PaymentMethodDraft[] = [
  { methodType: 'cash', displayName: 'Dinheiro', active: false, requiresReference: false, version: null },
  { methodType: 'external_pix', displayName: 'PIX externo', active: false, requiresReference: true, version: null },
  { methodType: 'external_card', displayName: 'Maquininha externa', active: false, requiresReference: true, version: null },
];

const METHOD_LABELS: Record<EstablishmentPaymentMethodType, string> = {
  cash: 'Dinheiro',
  external_pix: 'PIX externo',
  external_card: 'Maquininha externa',
};

const toDraft = (
  base: PaymentMethodDraft,
  method: EstablishmentPaymentMethod | undefined,
): PaymentMethodDraft => method ? {
  methodType: method.methodType,
  displayName: method.displayName,
  active: method.active,
  requiresReference: method.requiresReference,
  version: method.version,
} : { ...base };

export function BusinessPaymentMethodsScreen() {
  const router = useRouter();
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const [drafts, setDrafts] = useState<PaymentMethodDraft[]>(METHOD_DEFAULTS);
  const [savingType, setSavingType] = useState<EstablishmentPaymentMethodType | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'danger'; message: string } | null>(null);
  const requestIds = useRef(new Map<EstablishmentPaymentMethodType, { fingerprint: string; requestId: string }>());
  const canView = hasCapability('view_payments');
  const canConfigure = hasCapability('manage_operational_settings')
    && activeContext?.accessMode === 'full';
  const financialOpsEnabled = Boolean(activeContext?.financialOpsEnabled);

  const methodsQuery = useQuery({
    queryKey: user && activeContext
      ? createBusinessQueryKey(user.id, activeContext.establishmentId, 'payment-methods')
      : ['business', 'anonymous', 'none', 'payment-methods'],
    queryFn: () => businessApi.listPaymentMethods(activeContext!.establishmentId),
    enabled: Boolean(activeContext && financialOpsEnabled && canView),
    retry: shouldRetryBusinessQuery,
  });

  useEffect(() => {
    if (!methodsQuery.data) return;
    setDrafts(METHOD_DEFAULTS.map((base) => toDraft(
      base,
      methodsQuery.data.methods.find((method) => method.methodType === base.methodType),
    )));
  }, [methodsQuery.data]);

  const updateDraft = (
    methodType: EstablishmentPaymentMethodType,
    patch: Partial<PaymentMethodDraft>,
  ) => {
    requestIds.current.delete(methodType);
    setNotice(null);
    setDrafts((current) => current.map((draft) => (
      draft.methodType === methodType ? { ...draft, ...patch } : draft
    )));
  };

  const save = async (draft: PaymentMethodDraft) => {
    if (!activeContext || !canConfigure || !draft.displayName.trim()) return;
    const fingerprint = JSON.stringify({ establishmentId: activeContext.establishmentId, ...draft });
    let command = requestIds.current.get(draft.methodType);
    if (!command || command.fingerprint !== fingerprint) {
      command = { fingerprint, requestId: createMobileRequestId() };
      requestIds.current.set(draft.methodType, command);
    }

    setSavingType(draft.methodType);
    setNotice(null);
    try {
      await businessApi.configurePaymentMethod({
        establishmentId: activeContext.establishmentId,
        methodType: draft.methodType,
        displayName: draft.displayName,
        active: draft.active,
        requiresReference: draft.requiresReference,
        expectedVersion: draft.version,
        requestId: command.requestId,
      });
      requestIds.current.delete(draft.methodType);
      await methodsQuery.refetch();
      setNotice({ tone: 'success', message: `${METHOD_LABELS[draft.methodType]} confirmado pelo servidor.` });
    } catch (error) {
      if (error instanceof BusinessApiError && error.code === 'network_error') {
        setNotice({
          tone: 'warning',
          message: 'Sem confirmação do servidor. Tente novamente para reenviar o mesmo protocolo.',
        });
      } else {
        requestIds.current.delete(draft.methodType);
        if (error instanceof BusinessApiError && error.code === 'payment_method_version_conflict') {
          await methodsQuery.refetch();
        }
        setNotice({
          tone: 'danger',
          message: error instanceof BusinessApiError
            ? error.message
            : 'Não foi possível salvar este meio de pagamento.',
        });
      }
    } finally {
      setSavingType(null);
    }
  };

  return (
    <BusinessPage testID="business-payment-methods-screen">
      <BusinessHeader
        eyebrow="PAGAMENTOS"
        title="Meios de pagamento"
        description="Configure as formas declaradas usadas no POS manual desta unidade."
        trailing={<BusinessPill label={canConfigure ? 'GESTÃO' : 'LEITURA'} tone={canConfigure ? 'success' : 'warning'} />}
      />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />

      {!financialOpsEnabled ? (
        <BusinessNotice tone="warning" message="O POS manual ainda não foi habilitado nesta unidade." />
      ) : !canView ? (
        <BusinessNotice tone="danger" message="Seu contexto não possui permissão para consultar pagamentos." />
      ) : methodsQuery.isLoading ? (
        <BusinessNotice message="Carregando meios confirmados pelo servidor…" />
      ) : methodsQuery.error ? (
        <>
          <BusinessNotice tone="danger" message="Não foi possível carregar os meios de pagamento." />
          <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void methodsQuery.refetch()} />
        </>
      ) : (
        <View style={styles.list}>
          <BusinessNotice
            message="Dinheiro, PIX e maquininha são recebimentos declarados. Não movimentam Stripe nem a assinatura CutSync."
          />
          {notice ? <BusinessNotice tone={notice.tone} message={notice.message} /> : null}
          {!canConfigure ? (
            <BusinessNotice message="Consulta liberada. Alterações exigem a permissão de configurações operacionais." />
          ) : null}
          {drafts.map((draft) => (
            <BusinessCard key={draft.methodType} testID={`business-payment-method-${draft.methodType}`}>
              <View style={styles.row}>
                <View style={styles.copy}>
                  <BusinessSectionTitle>{METHOD_LABELS[draft.methodType]}</BusinessSectionTitle>
                  <Text selectable style={styles.status}>{draft.active ? 'ATIVO' : 'INATIVO'}</Text>
                </View>
                <Switch
                  testID={`business-payment-method-${draft.methodType}-active`}
                  accessibilityLabel={`Ativar ${METHOD_LABELS[draft.methodType]}`}
                  value={draft.active}
                  disabled={!canConfigure || savingType !== null}
                  onValueChange={(active) => updateDraft(draft.methodType, { active })}
                  trackColor={{ false: businessTheme.colors.borderStrong, true: businessTheme.colors.success }}
                  thumbColor={businessTheme.colors.white}
                />
              </View>
              <Text style={styles.label}>Nome exibido no atendimento</Text>
              <TextInput
                testID={`business-payment-method-${draft.methodType}-name`}
                accessibilityLabel={`Nome de ${METHOD_LABELS[draft.methodType]}`}
                value={draft.displayName}
                editable={canConfigure && savingType === null}
                maxLength={80}
                onChangeText={(displayName) => updateDraft(draft.methodType, { displayName })}
                placeholderTextColor={businessTheme.colors.textMuted}
                style={styles.input}
              />
              {draft.methodType !== 'cash' ? (
                <View style={styles.row}>
                  <View style={styles.copy}>
                    <Text selectable style={styles.label}>Exigir referência</Text>
                    <Text selectable style={styles.hint}>Solicita comprovante, NSU ou código externo.</Text>
                  </View>
                  <Switch
                    accessibilityLabel={`Exigir referência em ${METHOD_LABELS[draft.methodType]}`}
                    value={draft.requiresReference}
                    disabled={!canConfigure || savingType !== null}
                    onValueChange={(requiresReference) => updateDraft(draft.methodType, { requiresReference })}
                  />
                </View>
              ) : null}
              <BusinessButton
                testID={`business-payment-method-${draft.methodType}-save`}
                label={requestIds.current.has(draft.methodType) ? 'Tentar novamente' : 'Salvar configuração'}
                loading={savingType === draft.methodType}
                disabled={!canConfigure || savingType !== null || !draft.displayName.trim()}
                onPress={() => void save(draft)}
              />
            </BusinessCard>
          ))}
        </View>
      )}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  list: { gap: businessTheme.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: businessTheme.spacing.md },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  status: { ...businessTheme.typography.eyebrow, color: businessTheme.colors.textMuted },
  label: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  hint: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  input: {
    minHeight: businessTheme.sizing.control,
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: businessTheme.radii.md,
    borderCurve: 'continuous',
    paddingHorizontal: businessTheme.spacing.md,
    color: businessTheme.colors.text,
    backgroundColor: businessTheme.colors.surfaceRaised,
  },
});
