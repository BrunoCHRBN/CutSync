import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, CalendarDays, Clock3, ShieldAlert } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, typography } from '../../theme/tokens';
import { changeGovernanceEstablishmentStatus, getGovernanceEstablishmentDetail } from '../../services/governance-operations';
import type { GovernanceAccountStatus, GovernanceEstablishmentDetail } from '../../types/governance-knowledge';
import { StatusBadge } from './establishments-list';

const labels: Record<GovernanceAccountStatus, string> = { active: 'Ativo', pending_verification: 'Pendente', delinquent: 'Inadimplente', blocked: 'Bloqueado' };
const impact: Record<Exclude<GovernanceAccountStatus, 'pending_verification'>, string> = {
  active: 'Novos agendamentos e operações da unidade ficam disponíveis novamente.',
  delinquent: 'Novos agendamentos e ações operacionais dependentes de conta ativa serão impedidos. Agendamentos existentes não serão cancelados.',
  blocked: 'A unidade ficará impedida de operar e receber novos agendamentos. Agendamentos existentes não serão cancelados.',
};

export function GovernanceEstablishmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useGovernanceAuth();
  const [detail, setDetail] = useState<GovernanceEstablishmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [nextStatus, setNextStatus] = useState<Exclude<GovernanceAccountStatus, 'pending_verification'> | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { setDetail(await getGovernanceEstablishmentDetail(id)); }
    catch (error) { setNotice({ tone: 'danger', message: error instanceof Error ? error.message : 'Não foi possível carregar o estabelecimento.' }); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const establishment = detail?.establishment;
  const currentStatus = establishment?.account_status as GovernanceAccountStatus | undefined;
  const confirm = async () => {
    if (!establishment || !nextStatus) return;
    if (reason.trim().length < 10) { setReasonError('Explique o motivo com pelo menos 10 caracteres.'); return; }
    setSaving(true);
    try {
      const result = await changeGovernanceEstablishmentStatus(establishment.id, nextStatus, reason);
      setNextStatus(null);
      setNotice({ tone: 'success', message: `Status atualizado para ${labels[result.new_status]} e registrado na auditoria.` });
      await load();
    } catch (error) { setReasonError(error instanceof Error ? error.message : 'Não foi possível atualizar o status.'); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.brand} /></View>;
  if (!establishment) return <ScrollView contentContainerStyle={styles.scroll}><InlineNotice tone="danger" message={notice?.message || 'Estabelecimento não encontrado.'} /><AppButton label="Voltar" variant="secondary" onPress={() => router.back()} /></ScrollView>;

  return <ScrollView testID="governance-establishment-detail" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
    <View style={styles.backRow}><AppButton testID="governance-establishment-back" label="Voltar para estabelecimentos" variant="ghost" leadingIcon={<ArrowLeft size={16} color={colors.textSecondary} />} onPress={() => router.back()} /></View>
    {!!notice && <InlineNotice testID="governance-establishment-notice" tone={notice.tone} message={notice.message} />}
    <View style={styles.header}><View style={styles.pageCopy}><Text style={styles.eyebrow}>DOSSIÊ OPERACIONAL</Text><Text style={styles.title}>{establishment.name}</Text><Text style={styles.subtitle}>cutsync.com/{establishment.slug} · {establishment.address || 'Endereço não informado'}</Text></View><StatusBadge status={currentStatus || 'pending_verification'} /></View>
    <AppCard testID="governance-establishment-summary" style={styles.summary}><View style={styles.summaryGrid}><Detail label="Documento" value={`${establishment.document_type || 'Não informado'} · ${establishment.masked_document || 'não informado'}`} /><Detail label="Verificação" value={`Nível ${establishment.verification_level || 1}`} /><Detail label="KYC" value={String(establishment.kyc_status || 'Não enviado')} /><Detail label="Canais verificados" value={establishment.email_verified ? 'E-mail' : 'Nenhum'} /></View><AppButton label="Abrir revisão KYC" variant="secondary" onPress={() => router.push('/governance/verification')} /></AppCard>
    <AppCard testID="governance-establishment-actions" style={styles.section}><View style={styles.sectionHeader}><View style={styles.rowCopy}><Text style={styles.sectionTitle}>Decisão de acesso</Text><Text style={styles.sectionDescription}>Toda alteração exige justificativa e fica registrada na trilha imutável.</Text></View><ShieldAlert size={19} color={colors.info} /></View>{profile?.role === 'SaaS_Viewer' && <InlineNotice tone="info" message="Seu perfil possui acesso somente de leitura." />}{profile?.role !== 'SaaS_Viewer' && <View style={styles.actions}>{(['active', 'delinquent', 'blocked'] as const).map((status) => <AppButton key={status} testID={`governance-detail-status-${status}`} label={labels[status]} size="sm" variant={status === 'active' ? 'success' : 'danger'} disabled={currentStatus === status} onPress={() => { setNextStatus(status); setReason(''); setReasonError(''); }} />)}</View>}</AppCard>
    <View style={styles.columns}><AppCard testID="governance-establishment-history" style={styles.section}><Text style={styles.sectionTitle}>Histórico de status</Text>{detail.status_history.length ? detail.status_history.map((event) => <EventRow key={event.id} event={event} />) : <Text style={styles.empty}>Nenhuma mudança de status registrada.</Text>}</AppCard><AppCard testID="governance-establishment-appointments" style={styles.section}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Próximos agendamentos</Text><CalendarDays size={18} color={colors.info} /></View>{detail.upcoming_appointments.length ? detail.upcoming_appointments.map((appointment) => <View key={appointment.id} style={styles.appointment}><Clock3 size={14} color={colors.textMuted} /><View style={styles.rowCopy}><Text style={styles.itemTitle}>{new Date(appointment.date_time).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Text><Text style={styles.meta}>{appointment.client_name || 'Cliente não identificado'} · {appointment.status}</Text></View></View>) : <Text style={styles.empty}>Nenhum agendamento futuro encontrado.</Text>}</AppCard></View>
    <AppCard testID="governance-establishment-events" style={styles.section}><Text style={styles.sectionTitle}>Eventos recentes</Text>{detail.recent_events.length ? detail.recent_events.map((event) => <EventRow key={event.id} event={event} />) : <Text style={styles.empty}>Nenhum evento recente.</Text>}</AppCard>
    <Modal visible={!!nextStatus} transparent animationType="fade" onRequestClose={() => !saving && setNextStatus(null)}><View style={styles.overlay}><AppCard testID="governance-detail-status-confirmation" style={styles.modalCard} elevated><Text style={styles.modalTitle}>Confirmar alteração de status</Text><Text style={styles.modalLead}>{establishment.name} · {labels[currentStatus || 'active']} → {labels[nextStatus || 'active']}</Text><InlineNotice tone={nextStatus === 'active' ? 'success' : 'warning'} title="Impacto da decisão" message={nextStatus ? impact[nextStatus] : ''} /><AppInput testID="governance-detail-reason" label="Justificativa obrigatória" value={reason} onChangeText={setReason} placeholder="Descreva a evidência ou motivo operacional" multiline numberOfLines={4} textAlignVertical="top" error={reasonError || undefined} /><View style={styles.modalActions}><AppButton label="Cancelar" variant="ghost" onPress={() => setNextStatus(null)} disabled={saving} /><AppButton testID="governance-detail-confirm" label="Confirmar alteração" variant={nextStatus === 'active' ? 'success' : 'danger'} onPress={confirm} loading={saving} /></View></AppCard></View></Modal>
  </ScrollView>;
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
function EventRow({ event }: { event: { id: number; action: string; changes: Record<string, unknown>; created_at: string; actor_name: string } }) { const reason = typeof event.changes.reason === 'string' ? event.changes.reason : ''; return <View style={styles.event}><View style={styles.rowCopy}><Text style={styles.itemTitle}>{event.action === 'establishment.status_changed' ? 'Status alterado' : event.action}</Text><Text style={styles.meta}>Por {event.actor_name} · {new Date(event.created_at).toLocaleString('pt-BR')}</Text>{!!reason && <Text style={styles.meta}>Motivo: {reason}</Text>}</View></View>; }

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 18 },
  loading: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center' },
  backRow: { alignItems: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 },
  pageCopy: { flex: 1, minWidth: 280, gap: 7 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 30, letterSpacing: -1 },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13 },
  summary: { padding: 18 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  detail: { flex: 1, minWidth: 170, gap: 5 },
  detailLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  detailValue: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  section: { flex: 1, gap: 14 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  sectionDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  rowCopy: { flex: 1, gap: 4 },
  itemTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  meta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  event: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  appointment: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, flexDirection: 'row', gap: 9 },
  empty: { color: colors.textMuted, fontFamily: typography.body, textAlign: 'center', paddingVertical: 22 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 520, padding: 24, gap: 16 },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20 },
  modalLead: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 13 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 },
});
