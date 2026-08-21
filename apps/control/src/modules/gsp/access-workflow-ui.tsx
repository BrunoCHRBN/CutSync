import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ControlCard, ControlStatusBadge, type ControlTone } from '@/components/control-ui';
import type { ControlAccessRequest, ControlAccessRequestStatus } from '@/services/control-access-workflow';
import { controlColors, controlSpacing, controlType } from '@/theme/tokens';

const statusPresentation: Record<ControlAccessRequestStatus, { label: string; tone: ControlTone }> = {
  awaiting_approval: { label: 'AGUARDANDO APROVAÇÃO', tone: 'warning' },
  approved: { label: 'APROVADO', tone: 'success' },
  rejected: { label: 'REJEITADO', tone: 'danger' },
  applied: { label: 'APLICADO', tone: 'success' },
  expired: { label: 'EXPIRADO', tone: 'warning' },
  cancelled: { label: 'CANCELADO', tone: 'neutral' },
  failed: { label: 'FALHOU', tone: 'danger' },
};

export function formatAccessWorkflowDate(value: string | null): string {
  if (!value) return 'Não informado';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export function AccessRequestCard({
  request,
  children,
}: {
  request: ControlAccessRequest;
  children?: React.ReactNode;
}) {
  const status = statusPresentation[request.status];
  const actionLabel = request.requestedAction === 'grant' ? 'Conceder' : 'Revogar';

  return (
    <ControlCard testID={`control-access-request-${request.requestNumber}`}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.number}>Solicitação #{request.requestNumber}</Text>
          <Text style={styles.title}>{actionLabel} {request.requestedProfileLabel}</Text>
        </View>
        <ControlStatusBadge label={status.label} tone={status.tone} />
      </View>

      <View style={styles.grid}>
        <View style={styles.detail}>
          <Text style={styles.label}>Pessoa</Text>
          <Text selectable style={styles.value}>{request.targetName}</Text>
          <Text selectable style={styles.muted}>{request.targetEmail}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.label}>Solicitante</Text>
          <Text selectable style={styles.value}>{request.requestedByName}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.label}>Aprovações</Text>
          <Text style={styles.value}>{request.approvalCount} de {request.requiredApprovals}</Text>
          <Text style={styles.muted}>
            {request.requiresOwnerApproval ? 'Exige aprovação de Owner' : 'Sem exigência de Owner'}
          </Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.label}>Chamado interno</Text>
          <Text selectable style={styles.value}>{request.ticketReference}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.label}>Criada em</Text>
          <Text style={styles.value}>{formatAccessWorkflowDate(request.createdAt)}</Text>
        </View>
        <View style={styles.detail}>
          <Text style={styles.label}>Validade do acesso</Text>
          <Text style={styles.value}>{formatAccessWorkflowDate(request.requestedValidUntil)}</Text>
        </View>
      </View>

      <View style={styles.justification}>
        <Text style={styles.label}>Justificativa</Text>
        <Text selectable style={styles.body}>{request.justification}</Text>
      </View>

      {children}
    </ControlCard>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: controlSpacing.md,
  },
  headingCopy: { flex: 1, minWidth: 220, gap: controlSpacing.xs },
  number: { ...controlType.smallStrong, color: controlColors.accent },
  title: { ...controlType.sectionTitle, color: controlColors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: controlSpacing.lg },
  detail: { minWidth: 180, flexGrow: 1, gap: 2 },
  label: { ...controlType.smallStrong, color: controlColors.textMuted },
  value: { ...controlType.bodyStrong, color: controlColors.text },
  muted: { ...controlType.small, color: controlColors.textSecondary },
  justification: {
    gap: controlSpacing.xs,
    paddingTop: controlSpacing.md,
    borderTopWidth: 1,
    borderTopColor: controlColors.border,
  },
  body: { ...controlType.body, color: controlColors.textSecondary },
});
