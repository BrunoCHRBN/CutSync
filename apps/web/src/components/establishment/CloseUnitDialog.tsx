import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, ShieldAlert } from 'lucide-react-native';
import {
  organizationService,
  EstablishmentClosurePreview,
  CloseEstablishmentUnitResult,
} from '../../services/organizations';
import { colors, glassSurface, radii, typography, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';

export interface CloseUnitDialogProps {
  visible: boolean;
  establishmentId: string | null;
  onClose: () => void;
  onSuccess: (result: CloseEstablishmentUnitResult) => void;
}

export const CloseUnitDialog: React.FC<CloseUnitDialogProps> = ({
  visible,
  establishmentId,
  onClose,
  onSuccess,
}) => {
  const [preview, setPreview] = useState<EstablishmentClosurePreview | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [confirmName, setConfirmName] = useState<string>('');

  useEffect(() => {
    if (!visible || !establishmentId) {
      setPreview(null);
      setError(null);
      setReason('');
      setConfirmName('');
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    organizationService
      .getEstablishmentClosurePreview(establishmentId)
      .then((data) => {
        if (active) {
          setPreview(data);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Não foi possível carregar a prévia do encerramento.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visible, establishmentId]);

  const handleCloseUnit = async () => {
    if (!preview || !establishmentId) return;

    if (reason.trim().length < 10 || reason.trim().length > 500) {
      setError('O motivo do encerramento deve conter entre 10 e 500 caracteres.');
      return;
    }

    if (confirmName.trim().toLowerCase() !== preview.name.trim().toLowerCase()) {
      setError(`Digite exatamente o nome da unidade ("${preview.name}") para confirmar.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const result = await organizationService.closeEstablishmentUnit(
        establishmentId,
        preview.lifecycleVersion,
        reason.trim(),
      );
      onSuccess(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar unidade.');
    } finally {
      setSubmitting(false);
    }
  };

  const blockerDescriptions: Record<string, string> = {
    unresolved_past_appointments: 'Existem agendamentos passados pendentes de conclusão ou cancelamento.',
    closure_financial_blockers: 'Existem comandas ou pagamentos em processamento que devem ser finalizados antes.',
    pending_billing_cutover: 'Existe uma solicitação de transição de faturamento pendente.',
    invalid_lifecycle_status_for_closure: 'A unidade não está em estado elegível para encerramento.',
  };

  const isConfirmed = preview && confirmName.trim().toLowerCase() === preview.name.trim().toLowerCase();
  const isReasonValid = reason.trim().length >= 10 && reason.trim().length <= 500;
  const canSubmit = preview?.canClose && isConfirmed && isReasonValid && !submitting;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable onPress={(event) => event.stopPropagation?.()} style={styles.cardPressable}>
          <AppCard style={styles.card} elevated>
            <View style={styles.headerRow}>
              <View style={styles.iconContainer}>
                <ShieldAlert size={24} color={colors.danger} />
              </View>
              <View style={styles.grow}>
                <Text style={styles.title}>Encerrar Unidade</Text>
                <Text style={styles.subtitle}>
                  {preview ? preview.name : 'Carregando detalhes...'}
                </Text>
              </View>
            </View>

            {error ? <InlineNotice tone="danger" message={error} /> : null}

            {loading ? (
              <Text style={styles.loadingText}>Calculando impactos estruturais da unidade...</Text>
            ) : preview ? (
              <View style={styles.body}>
                <Text style={styles.warningText}>
                  Esta ação é estrutural e definitiva. A unidade sairá da lista ativa do grupo, os agendamentos futuros
                  serão cancelados e os vínculos da equipe serão revogados.
                </Text>

                <View style={styles.metricsContainer}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Agendamentos futuros</Text>
                    <Text style={styles.metricValue}>
                      {preview.futureAppointments.total} a cancelar
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Membros da equipe</Text>
                    <Text style={styles.metricValue}>
                      {preview.activeMemberships} a revogar
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Convites pendentes</Text>
                    <Text style={styles.metricValue}>
                      {preview.pendingInvitations} a revogar
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricLabel}>Cobertura de faturamento</Text>
                    <Text style={styles.metricValue}>
                      {preview.billing.activeCoverage > 0 ? 'Será encerrada' : 'Sem cobrança ativa'}
                    </Text>
                  </View>
                </View>

                {preview.blockers.length > 0 ? (
                  <View style={styles.blockersContainer}>
                    <View style={styles.blockerTitleRow}>
                      <AlertTriangle size={18} color={colors.warning} />
                      <Text style={styles.blockerTitle}>Impedimentos para o encerramento:</Text>
                    </View>
                    {preview.blockers.map((b) => (
                      <Text key={b} style={styles.blockerItem}>
                        • {blockerDescriptions[b] || b}
                      </Text>
                    ))}
                  </View>
                ) : (
                  <>
                    <View style={styles.inputGroup}>
                      <AppInput
                        label="Motivo do encerramento (10 a 500 caracteres)"
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Informe a justificativa do encerramento..."
                        testID="closure-reason-input"
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      <AppInput
                        label={`Digite o nome da unidade ("${preview.name}") para confirmar`}
                        value={confirmName}
                        onChangeText={setConfirmName}
                        placeholder={preview.name}
                        testID="closure-confirm-name-input"
                      />
                    </View>
                  </>
                )}
              </View>
            ) : null}

            <View style={styles.actions}>
              <AppButton
                label="Cancelar"
                variant="secondary"
                onPress={onClose}
                disabled={submitting}
                testID="close-unit-cancel"
              />
              {preview?.canClose ? (
                <AppButton
                  label={submitting ? 'Encerrando...' : 'Encerrar Unidade'}
                  variant="secondary"
                  onPress={() => { void handleCloseUnit(); }}
                  disabled={!canSubmit}
                  loading={submitting}
                  testID="close-unit-submit"
                />
              ) : null}
            </View>
          </AppCard>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 18, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as object,
      default: {},
    }),
  },
  cardPressable: {
    width: '100%',
    maxWidth: 520,
  },
  card: {
    width: '100%',
    padding: 24,
    gap: 16,
    ...glassSurface,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grow: {
    flex: 1,
  },
  title: {
    fontFamily: typography.display,
    fontSize: 18,
    color: colors.text,
  },
  subtitle: {
    ...typeScale.small,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingText: {
    ...typeScale.body,
    color: colors.textMuted,
    paddingVertical: 16,
    textAlign: 'center',
  },
  body: {
    gap: 14,
  },
  warningText: {
    ...typeScale.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  metricsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: colors.canvasSoft,
    padding: 12,
    borderRadius: radii.md,
  },
  metricItem: {
    flex: 1,
    minWidth: 180,
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  metricValue: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  blockersContainer: {
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    gap: 6,
  },
  blockerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  blockerTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.warning,
  },
  blockerItem: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 16,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    ...typeScale.small,
    color: colors.textSecondary,
  },
  bold: {
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
});
