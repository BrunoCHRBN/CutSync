import {
  ManualPosApiError,
  createManualPosApi,
  type EstablishmentPaymentMethod,
  type EstablishmentPaymentMethodType,
} from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';

import { useFinancialOps } from '../../contexts/financial-ops-context';
import { useOperationalContext } from '../../contexts/operational-context';
import { supabase } from '../../services/supabase';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { FormSection } from '../ui/FormSection';
import { InlineNotice } from '../ui/InlineNotice';

interface PaymentMethodDraft {
  methodType: EstablishmentPaymentMethodType;
  displayName: string;
  active: boolean;
  requiresReference: boolean;
  version: number | null;
}

const METHOD_DEFAULTS: PaymentMethodDraft[] = [
  {
    methodType: 'cash',
    displayName: 'Dinheiro',
    active: false,
    requiresReference: false,
    version: null,
  },
  {
    methodType: 'external_pix',
    displayName: 'PIX externo',
    active: false,
    requiresReference: true,
    version: null,
  },
  {
    methodType: 'external_card',
    displayName: 'Maquininha externa',
    active: false,
    requiresReference: true,
    version: null,
  },
];

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

export function PaymentMethodsSettings() {
  const { activeEstablishmentId } = useOperationalContext();
  const financialOps = useFinancialOps();
  const api = useMemo(() => createManualPosApi(supabase), []);
  const [drafts, setDrafts] = useState<PaymentMethodDraft[]>(METHOD_DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [savingType, setSavingType] = useState<EstablishmentPaymentMethodType | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'warning'; message: string } | null>(null);
  const requestIds = useRef(new Map<EstablishmentPaymentMethodType, {
    fingerprint: string;
    requestId: string;
  }>());

  const canView = financialOps.hasCapability('view_payments');
  const canConfigure = financialOps.hasCapability('manage_operational_settings')
    && financialOps.accessMode === 'full';

  const load = useCallback(async () => {
    if (!activeEstablishmentId || !financialOps.financialOpsEnabled || !canView) {
      setDrafts(METHOD_DEFAULTS);
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const model = await api.listPaymentMethods(activeEstablishmentId);
      setDrafts(METHOD_DEFAULTS.map((base) => toDraft(
        base,
        model.methods.find((method) => method.methodType === base.methodType),
      )));
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof ManualPosApiError
          ? 'Não foi possível carregar os meios de pagamento desta unidade.'
          : 'Falha inesperada ao carregar os meios de pagamento.',
      });
    } finally {
      setLoading(false);
    }
  }, [activeEstablishmentId, api, canView, financialOps.financialOpsEnabled]);

  useEffect(() => { void load(); }, [load]);

  const updateDraft = (
    methodType: EstablishmentPaymentMethodType,
    patch: Partial<PaymentMethodDraft>,
  ) => {
    requestIds.current.delete(methodType);
    setDrafts((current) => current.map((draft) => (
      draft.methodType === methodType ? { ...draft, ...patch } : draft
    )));
  };

  const save = async (draft: PaymentMethodDraft) => {
    if (!activeEstablishmentId || !canConfigure || !draft.displayName.trim()) return;
    const fingerprint = JSON.stringify({
      establishmentId: activeEstablishmentId,
      ...draft,
    });
    let command = requestIds.current.get(draft.methodType);
    if (!command || command.fingerprint !== fingerprint) {
      command = { fingerprint, requestId: createMobileRequestId() };
      requestIds.current.set(draft.methodType, command);
    }
    setSavingType(draft.methodType);
    setNotice(null);
    try {
      await api.configurePaymentMethod({
        establishmentId: activeEstablishmentId,
        methodType: draft.methodType,
        displayName: draft.displayName,
        active: draft.active,
        requiresReference: draft.requiresReference,
        expectedVersion: draft.version,
        requestId: command.requestId,
      });
      requestIds.current.delete(draft.methodType);
      await load();
      setNotice({ tone: 'success', message: 'Meio de pagamento confirmado pelo servidor.' });
    } catch (error) {
      if (error instanceof ManualPosApiError && error.code === 'network_error') {
        setNotice({
          tone: 'warning',
          message: 'Sem confirmação do servidor. Tente novamente para reenviar o mesmo protocolo.',
        });
      } else {
        requestIds.current.delete(draft.methodType);
        const message = error instanceof ManualPosApiError
          && error.code === 'payment_method_version_conflict'
          ? 'A configuração mudou em outro dispositivo. Os dados foram atualizados.'
          : 'Não foi possível salvar este meio de pagamento.';
        await load();
        setNotice({
          tone: 'danger',
          message,
        });
      }
    } finally {
      setSavingType(null);
    }
  };

  if (financialOps.loading || loading) {
    return (
      <FormSection
        testID="settings-payment-methods-section"
        title="Meios de pagamento do atendimento"
        description="Operações declaradas do POS manual, separadas da assinatura CutSync."
      >
        <ActivityIndicator color={colors.brandPrimary} />
      </FormSection>
    );
  }

  return (
    <FormSection
      testID="settings-payment-methods-section"
      title="Meios de pagamento do atendimento"
      description="Configure dinheiro, PIX externo e maquininha. Estes meios registram recebimentos declarados e não usam billing_* nem Stripe."
    >
      {!financialOps.financialOpsEnabled ? (
        <InlineNotice
          testID="settings-payment-methods-disabled"
          tone="warning"
          title="POS manual ainda desativado"
          message="A flag financeira desta unidade permanece desligada. Nenhum app exibirá cobrança enquanto ela não for liberada pelo Control."
        />
      ) : !canView ? (
        <InlineNotice
          tone="danger"
          title="Acesso não autorizado"
          message="Seu contexto não possui permissão para consultar pagamentos desta unidade."
        />
      ) : (
        <>
          {notice ? <InlineNotice tone={notice.tone} message={notice.message} /> : null}
          {!canConfigure ? (
            <InlineNotice
              tone="info"
              message="Consulta liberada. Alterações exigem manage_operational_settings em contexto completo."
            />
          ) : null}
          {drafts.map((draft) => (
            <View
              key={draft.methodType}
              testID={`settings-payment-method-${draft.methodType}`}
              style={styles.methodCard}
            >
              <View style={styles.methodHeader}>
                <View style={styles.methodCopy}>
                  <Text style={styles.methodType}>{draft.methodType.replace('_', ' ')}</Text>
                  <Text style={styles.methodStatus}>{draft.active ? 'Ativo' : 'Inativo'}</Text>
                </View>
                <Switch
                  testID={`settings-payment-method-${draft.methodType}-active`}
                  value={draft.active}
                  disabled={!canConfigure || savingType !== null}
                  onValueChange={(active) => updateDraft(draft.methodType, { active })}
                  trackColor={{ false: colors.borderStrong, true: colors.success }}
                  thumbColor={colors.white}
                />
              </View>
              <AppInput
                testID={`settings-payment-method-${draft.methodType}-name`}
                label="Nome exibido na operação"
                value={draft.displayName}
                editable={canConfigure && savingType === null}
                maxLength={80}
                onChangeText={(displayName) => updateDraft(draft.methodType, { displayName })}
              />
              {draft.methodType !== 'cash' ? (
                <View style={styles.referenceRow}>
                  <View style={styles.methodCopy}>
                    <Text style={styles.referenceTitle}>Exigir referência do operador</Text>
                    <Text style={styles.referenceDescription}>
                      Impede confirmação sem um identificador informado pela unidade.
                    </Text>
                  </View>
                  <Switch
                    testID={`settings-payment-method-${draft.methodType}-reference`}
                    value={draft.requiresReference}
                    disabled={!canConfigure || savingType !== null}
                    onValueChange={(requiresReference) => updateDraft(
                      draft.methodType,
                      { requiresReference },
                    )}
                    trackColor={{ false: colors.borderStrong, true: colors.brandSecondary }}
                    thumbColor={colors.white}
                  />
                </View>
              ) : null}
              {canConfigure ? (
                <AppButton
                  testID={`settings-payment-method-${draft.methodType}-save`}
                  label={draft.version === null ? 'Criar meio' : 'Salvar meio'}
                  variant="admin"
                  loading={savingType === draft.methodType}
                  disabled={savingType !== null || !draft.displayName.trim()}
                  onPress={() => void save(draft)}
                />
              ) : null}
            </View>
          ))}
        </>
      )}
    </FormSection>
  );
}

const styles = StyleSheet.create({
  methodCard: {
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.canvasSoft,
  },
  methodHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  methodCopy: { flex: 1, gap: 3 },
  methodType: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 13,
    textTransform: 'uppercase',
  },
  methodStatus: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  referenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  referenceTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  referenceDescription: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 16,
  },
});
