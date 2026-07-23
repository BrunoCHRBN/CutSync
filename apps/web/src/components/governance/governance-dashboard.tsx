import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Activity, AlertTriangle, ArrowRight, Clock3, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, radii, typography } from '../../theme/tokens';
import {
  changeGovernanceEstablishmentStatus,
  listGovernanceAuditEvents,
  listGovernanceEstablishments,
} from '../../services/governance-operations';
import type { GovernanceAccountStatus, GovernanceAuditEvent, GovernanceEstablishmentListItem } from '../../types/governance-knowledge';

const statusLabel: Record<GovernanceAccountStatus, string> = {
  active: 'Ativo',
  pending_verification: 'Pendente',
  delinquent: 'Inadimplente',
  blocked: 'Bloqueado',
};

const impactCopy: Record<Exclude<GovernanceAccountStatus, 'pending_verification'>, string> = {
  active: 'Novos agendamentos e operações da unidade ficam disponíveis novamente.',
  delinquent: 'Novos agendamentos e ações operacionais dependentes de conta ativa serão impedidos. Agendamentos existentes não serão cancelados.',
  blocked: 'A unidade ficará impedida de operar e receber novos agendamentos. Agendamentos existentes não serão cancelados.',
};

export function GovernanceDashboard() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [establishments, setEstablishments] = useState<GovernanceEstablishmentListItem[]>([]);
  const [logs, setLogs] = useState<GovernanceAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ item: GovernanceEstablishmentListItem; status: Exclude<GovernanceAccountStatus, 'pending_verification'> } | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [reasonError, setReasonError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    setNotice(null);
    try {
      const [establishmentData, auditData] = await Promise.all([
        listGovernanceEstablishments({ pageSize: 100 }),
        listGovernanceAuditEvents({ pageSize: 8 }),
      ]);
      setEstablishments(establishmentData);
      setLogs(auditData);
    } catch (error) {
      setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível carregar o painel de Governança.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    total: establishments.length,
    active: establishments.filter((item) => item.account_status === 'active').length,
    pending: establishments.filter((item) => item.account_status === 'pending_verification').length,
    restricted: establishments.filter((item) => ['blocked', 'delinquent'].includes(item.account_status)).length,
  }), [establishments]);

  const confirmStatusChange = async () => {
    if (!pendingAction) return;
    if (reason.trim().length < 10) { setReasonError('Explique o motivo com pelo menos 10 caracteres.'); return; }
    setSaving(true);
    setReasonError('');
    try {
      const result = await changeGovernanceEstablishmentStatus(pendingAction.item.id, pendingAction.status, reason);
      setPendingAction(null);
      setNotice({ tone: 'success', message: `${result.name}: status atualizado para ${statusLabel[result.new_status]} e registrado na auditoria.` });
      await load(true);
    } catch (error) {
      setReasonError(error instanceof Error ? error.message : 'Não foi possível atualizar o status.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView testID="governance-dashboard-screen" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeader}>
        <View style={styles.pageCopy}>
          <Text style={styles.eyebrow}>VISÃO DE TRABALHO</Text>
          <Text style={styles.title}>Central de Governança</Text>
          <Text style={styles.subtitle}>Priorize pendências, investigue mudanças e mantenha a operação do CutSync sob controle.</Text>
        </View>
        <AppButton testID="governance-refresh-button" label={refreshing ? 'Atualizando…' : 'Atualizar'} variant="secondary" icon={<RefreshCw size={16} color={colors.text} />} onPress={() => load(true)} disabled={refreshing} />
      </View>
      {!!notice && <InlineNotice testID="governance-dashboard-notice" tone={notice.tone} message={notice.message} />}

      <View style={styles.metrics}>
        <Metric testID="governance-pending-metric" icon={<Clock3 color={colors.warning} size={18} />} value={counts.pending} label="Aguardando verificação" onPress={() => router.push('/governance/establishments?status=pending_verification')} />
        <Metric testID="governance-restricted-metric" icon={<AlertTriangle color={colors.danger} size={18} />} value={counts.restricted} label="Com restrição" onPress={() => router.push('/governance/establishments?status=blocked')} />
        <Metric testID="governance-active-metric" icon={<ShieldCheck color={colors.success} size={18} />} value={counts.active} label="Ativos" onPress={() => router.push('/governance/establishments?status=active')} />
        <Metric testID="governance-establishments-metric" icon={<Activity color={colors.info} size={18} />} value={counts.total} label="Estabelecimentos" onPress={() => router.push('/governance/establishments')} />
      </View>

      <View style={[styles.columns, width >= layout.desktopBreakpoint && styles.columnsWide]}>
        <AppCard testID="governance-priority-card" style={styles.priorityCard}>
          <SectionHeader title="Fila prioritária" description="Unidades que merecem atenção operacional agora." />
          {loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : establishments.filter((item) => item.account_status !== 'active').slice(0, 6).map((item) => (
            <View key={item.id} style={styles.priorityRow}>
              <View style={styles.rowCopy}>
                <Text style={styles.itemTitle}>{item.name}</Text>
                <Text style={styles.meta}>{item.slug} · {statusLabel[item.account_status]}</Text>
              </View>
              <AppButton testID={`governance-open-${item.id}`} label="Investigar" size="sm" variant="secondary" trailingIcon={<ArrowRight size={14} color={colors.textSecondary} />} onPress={() => router.push(`/governance/establishments/${item.id}`)} />
            </View>
          ))}
          {!loading && establishments.every((item) => item.account_status === 'active') && <Text style={styles.empty}>Nenhuma pendência crítica encontrada.</Text>}
          <AppButton testID="governance-open-establishments-button" label="Ver todos os estabelecimentos" variant="ghost" onPress={() => router.push('/governance/establishments')} />
        </AppCard>

        <AppCard testID="governance-audit-card" style={styles.auditCard}>
          <SectionHeader title="Atividade recente" description="Eventos recentes da trilha imutável." action={<AppButton testID="governance-open-audit-button" label="Abrir auditoria" size="sm" variant="ghost" onPress={() => router.push('/governance/audit')} />} />
          {loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : logs.map((log) => <AuditRow key={log.id} log={log} />)}
          {!loading && !logs.length && <Text style={styles.empty}>Nenhum evento registrado.</Text>}
        </AppCard>
      </View>

      <Modal visible={!!pendingAction} transparent animationType="fade" onRequestClose={() => !saving && setPendingAction(null)}>
        <View style={styles.overlay}>
          <AppCard testID="governance-status-confirmation" style={styles.modalCard} elevated>
            <Text style={styles.modalTitle}>Confirmar alteração de status</Text>
            <Text style={styles.modalLead}>{pendingAction?.item.name} · {statusLabel[pendingAction?.item.account_status || 'active']} → {statusLabel[pendingAction?.status || 'active']}</Text>
            <InlineNotice tone={pendingAction?.status === 'active' ? 'success' : 'warning'} title="Impacto da decisão" message={pendingAction ? impactCopy[pendingAction.status] : ''} />
            <AppInput testID="governance-status-reason-input" label="Justificativa obrigatória" value={reason} onChangeText={setReason} placeholder="Descreva a evidência ou motivo operacional" multiline numberOfLines={4} textAlignVertical="top" error={reasonError || undefined} />
            <View style={styles.modalActions}>
              <AppButton testID="governance-status-cancel-button" label="Cancelar" variant="ghost" onPress={() => setPendingAction(null)} disabled={saving} />
              <AppButton testID="governance-status-confirm-button" label={saving ? 'Registrando…' : 'Confirmar alteração'} variant={pendingAction?.status === 'active' ? 'success' : 'danger'} onPress={confirmStatusChange} loading={saving} />
            </View>
          </AppCard>
        </View>
      </Modal>
    </ScrollView>
  );
}

function SectionHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <View style={styles.sectionHeader}><View style={styles.rowCopy}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDescription}>{description}</Text></View>{action}</View>;
}

function Metric({ testID, icon, value, label, onPress }: { testID: string; icon: React.ReactNode; value: number; label: string; onPress: () => void }) {
  return <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.metric, pressed && styles.pressed]}><AppCard style={styles.metricCard}>{icon}<Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text><ArrowRight size={14} color={colors.textMuted} /></AppCard></Pressable>;
}

function AuditRow({ log }: { log: GovernanceAuditEvent }) {
  const changes = log.changes || {};
  const oldStatus = typeof changes.old_status === 'string' ? changes.old_status : null;
  const newStatus = typeof changes.new_status === 'string' ? changes.new_status : null;
  const detail = oldStatus && newStatus ? `${statusLabel[oldStatus as GovernanceAccountStatus]} → ${statusLabel[newStatus as GovernanceAccountStatus]}` : log.action;
  return <View style={styles.auditRow}><View style={styles.rowCopy}><Text style={styles.itemTitle}>{log.target_name}</Text><Text style={styles.meta}>{detail} · por {log.actor_name}</Text></View><Text style={styles.date}>{new Date(log.created_at).toLocaleDateString('pt-BR')}</Text></View>;
}

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 20 },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 },
  pageCopy: { flex: 1, minWidth: 280, gap: 7 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 30, letterSpacing: -1 },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metric: { flex: 1, minWidth: 190, borderRadius: radii.lg },
  metricCard: { gap: 7, minHeight: 140 },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 28, fontVariant: ['tabular-nums'] },
  metricLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, flex: 1 },
  columns: { gap: 20 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  priorityCard: { flex: 1.35, gap: 14 },
  auditCard: { flex: 1, gap: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  sectionDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13 },
  auditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  rowCopy: { flex: 1, gap: 4 },
  itemTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  meta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  date: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  loader: { marginVertical: 30 },
  empty: { color: colors.textMuted, fontFamily: typography.body, textAlign: 'center', paddingVertical: 24 },
  pressed: { opacity: 0.78 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, padding: 24, gap: 16 },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20 },
  modalLead: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 },
});
