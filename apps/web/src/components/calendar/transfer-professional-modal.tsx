import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { WebReassignmentPreparation } from '../../features/appointments/use-appointment-actions';
import { colors, elevations, radii, spacing, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import type { CalendarAppointment } from './operational-calendar';

interface TransferProfessionalModalProps {
  visible: boolean;
  appointment: CalendarAppointment | null;
  preparation: WebReassignmentPreparation | null;
  loading?: boolean;
  onClose: () => void;
  onPrepare: () => void;
  onPropose: (professionalId: string) => void;
}

const statusLabel: Record<WebReassignmentPreparation['status'], string> = {
  requested: 'Solicitação criada',
  validating: 'Validando',
  awaiting_manager: 'Aguardando proposta',
  awaiting_customer: 'Aguardando cliente',
  ready_to_apply: 'Pronta para aplicação',
  applied: 'Aplicada',
  declined: 'Recusada',
  withdrawn: 'Retirada',
  expired: 'Expirada',
  failed: 'Falhou',
  manual_review: 'Revisão manual',
};

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const TransferProfessionalModal = ({
  visible,
  appointment,
  preparation,
  loading = false,
  onClose,
  onPrepare,
  onPropose,
}: TransferProfessionalModalProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const candidates = useMemo(() => preparation?.candidates ?? [], [preparation?.candidates]);
  const selected = useMemo(
    () => candidates.find((candidate) => candidate.profileId === selectedId) ?? null,
    [candidates, selectedId],
  );

  useEffect(() => {
    if (!visible) {
      setSelectedId(null);
      return;
    }
    if (candidates.length > 0 && !candidates.some((item) => item.profileId === selectedId)) {
      setSelectedId(candidates[0]?.profileId ?? null);
    }
  }, [candidates, selectedId, visible]);

  const workflowAlreadyAdvanced = Boolean(
    preparation && preparation.status !== 'awaiting_manager',
  );

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Fechar proposta" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.sheet}
          testID="transfer-professional-modal"
        >
          <Text style={styles.eyebrow}>PROPOSTA DE REATRIBUIÇÃO</Text>
          <Text style={styles.title}>{appointment?.clientName || 'Atendimento'}</Text>
          <Text style={styles.description}>
            A criação da proposta não troca o profissional. O backend validará o atendimento e registrará a decisão necessária do cliente.
          </Text>

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Condição atual</Text>
            <Text style={styles.description}>
              {appointment?.serviceName} · {appointment?.startsAt.toLocaleString('pt-BR', {
                dateStyle: 'short', timeStyle: 'short',
              })}
            </Text>
            <Text style={styles.description}>
              Preço: {typeof appointment?.price === 'number'
                ? money(Math.round(appointment.price * 100)) : 'não informado'}
            </Text>
            <Text style={styles.description}>Sinal: nenhuma movimentação será realizada por esta proposta.</Text>
          </View>

          {preparation ? (
            <Text style={styles.workflowStatus} testID="reassignment-workflow-status">
              {statusLabel[preparation.status]} · versão {preparation.version}
            </Text>
          ) : null}

          {preparation?.status === 'awaiting_manager' && preparation.proposalAllowed ? (
            <ScrollView style={styles.list}>
              {candidates.length === 0 ? (
                <Text style={styles.description}>Nenhum profissional qualificado está disponível no mesmo horário.</Text>
              ) : candidates.map((candidate) => {
                const active = selectedId === candidate.profileId;
                return (
                  <Pressable
                    key={candidate.profileId}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedId(candidate.profileId)}
                    style={[styles.row, active && styles.rowSelected]}
                    testID={`transfer-candidate-${candidate.profileId}`}
                  >
                    <Text style={styles.rowTitle}>{candidate.name}</Text>
                    <Text style={styles.rowStatus}>
                      {money(candidate.priceCents)}
                      {candidate.monetaryImpact ? ' · preço diferente, exige decisão' : ' · mesmo preço'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {preparation?.status === 'awaiting_manager' && !preparation.proposalAllowed ? (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Enviado para a gestão</Text>
              <Text style={styles.description}>
                A solicitação foi validada. Um gestor autorizado poderá escolher o substituto; o atendimento permanece com o profissional atual.
              </Text>
            </View>
          ) : null}

          {workflowAlreadyAdvanced ? (
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>Solicitação em andamento</Text>
              <Text style={styles.description}>
                Acompanhe a Central de Decisões. Nenhuma alteração será exibida como concluída antes da aplicação server-side.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <AppButton disabled={loading} label="Voltar" onPress={onClose} testID="transfer-professional-close" variant="secondary" />
            {!preparation ? (
              <AppButton
                label="Criar solicitação e validar"
                loading={loading}
                onPress={onPrepare}
                testID="reassignment-prepare"
              />
            ) : preparation.status === 'awaiting_manager' && preparation.proposalAllowed && selected ? (
              <AppButton
                label="Enviar proposta ao cliente"
                loading={loading}
                onPress={() => onPropose(selected.profileId)}
                testID="transfer-professional-confirm"
              />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24,32,27,0.34)', flex: 1, justifyContent: 'center', padding: spacing.md },
  sheet: { alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, gap: spacing.sm, maxHeight: '88%', maxWidth: 560, padding: spacing.xl, width: '100%', ...elevations.overlay },
  eyebrow: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1.2 },
  title: { ...typeScale.cardTitle, color: colors.textPrimary },
  description: { ...typeScale.small, color: colors.textSecondary },
  summary: { backgroundColor: colors.surfaceMuted, borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, padding: spacing.md },
  summaryTitle: { ...typeScale.bodyStrong, color: colors.textPrimary },
  workflowStatus: { ...typeScale.bodyStrong, color: colors.brandPrimary },
  list: { maxHeight: 300 },
  row: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm, padding: spacing.md },
  rowSelected: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandPrimary },
  rowTitle: { ...typeScale.bodyStrong, color: colors.textPrimary },
  rowStatus: { ...typeScale.small, color: colors.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
});
