import React from 'react';

import type { PendingBillingAction } from '@/components/billing/billing-types';
import { subscriptionStatusLabels } from '@/components/billing/billing-types';
import { ControlConfirmPanel, ControlField } from '@/components/control-ui';

export interface BillingConfirmationCopy {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'default' | 'danger';
  requiresReason: boolean;
}

export function getBillingConfirmationCopy(
  action: PendingBillingAction,
): BillingConfirmationCopy {
  switch (action.kind) {
    case 'configure_plan':
      return {
        title: 'Confirmar preço-base',
        description:
          `O plano ${action.planCode} passará a usar R$ ${(action.basePriceCents / 100).toFixed(2).replace('.', ',')} em operações futuras.`,
        confirmLabel: 'Salvar preço-base',
        tone: 'default',
        requiresReason: false,
      };
    case 'activate_subscription':
      return {
        title: 'Confirmar ativação',
        description:
          `${action.account.organizationName} será ativada no plano ${action.planCode}.`,
        confirmLabel: 'Ativar assinatura',
        tone: 'default',
        requiresReason: false,
      };
    case 'change_status':
      return {
        title: 'Confirmar mudança de status',
        description:
          `${action.account.organizationName} passará para ${subscriptionStatusLabels[action.status].toLocaleLowerCase('pt-BR')}.`,
        confirmLabel: 'Alterar status',
        tone: action.status === 'suspended' || action.status === 'canceled' ? 'danger' : 'default',
        requiresReason: true,
      };
    case 'issue_invoice':
      return {
        title: 'Confirmar emissão',
        description:
          `Será emitida uma fatura para ${action.account.organizationName}, com vencimento em sete dias e valores congelados.`,
        confirmLabel: 'Emitir fatura',
        tone: 'default',
        requiresReason: false,
      };
    case 'change_enforcement':
      return {
        title: action.enabled ? 'Ativar bloqueio operacional' : 'Desativar bloqueio operacional',
        description: action.enabled
          ? `A assinatura de ${action.account.organizationName} passará a aplicar as regras de bloqueio do servidor.`
          : `A assinatura de ${action.account.organizationName} deixará de aplicar as regras de bloqueio.`,
        confirmLabel: action.enabled ? 'Ativar bloqueio' : 'Desativar bloqueio',
        tone: action.enabled ? 'danger' : 'default',
        requiresReason: true,
      };
    case 'finalize_cutover':
      return {
        title: 'Finalizar transição de cobrança',
        description:
          `Confirme que as assinaturas individuais de ${action.cutover.organizationName} já foram reconciliadas no provedor.`,
        confirmLabel: 'Reconciliar e aplicar',
        tone: 'default',
        requiresReason: false,
      };
    case 'resolve_conflict':
      return {
        title: action.resolution === 'link'
          ? 'Vincular identidade'
          : action.resolution === 'reject'
            ? 'Rejeitar vínculo'
            : 'Solicitar evidência',
        description:
          `A decisão será registrada para ${action.conflict.documentType ?? 'o documento'} ${action.conflict.maskedDocument ?? 'mascarado'}.`,
        confirmLabel: 'Registrar decisão',
        tone: action.resolution === 'reject' ? 'danger' : 'default',
        requiresReason: true,
      };
  }
}

export function BillingConfirmation({
  copy,
  reason,
  busy,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  copy: BillingConfirmationCopy;
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ControlConfirmPanel
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      onConfirm={onConfirm}
      onCancel={onCancel}
      busy={busy}
      tone={copy.tone}
    >
      {copy.requiresReason ? (
        <ControlField
          label="Justificativa"
          value={reason}
          onChangeText={onReasonChange}
          placeholder="Descreva o motivo da alteração"
          multiline
          maxLength={500}
          helper={`${reason.trim().length}/500 caracteres · mínimo 10`}
        />
      ) : null}
    </ControlConfirmPanel>
  );
}
