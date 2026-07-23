import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { ClipboardList, Search } from 'lucide-react-native';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, typography } from '../../theme/tokens';
import { listGovernanceAuditEvents } from '../../services/governance-operations';
import type { GovernanceAccountStatus, GovernanceAuditEvent } from '../../types/governance-knowledge';

function describeEvent(event: GovernanceAuditEvent) {
  const changes = event.changes || {};
  if (event.action === 'establishment.status_changed' && typeof changes.old_status === 'string' && typeof changes.new_status === 'string') {
    const label = (value: string) => ({ active: 'Ativo', delinquent: 'Inadimplente', blocked: 'Bloqueado', pending_verification: 'Pendente' } as Record<GovernanceAccountStatus, string>)[value as GovernanceAccountStatus] || value;
    return `${label(changes.old_status)} → ${label(changes.new_status)}`;
  }
  return event.action.replaceAll('.', ' · ');
}

export function GovernanceAuditList() {
  const [items, setItems] = useState<GovernanceAuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setNotice('');
    try { setItems(await listGovernanceAuditEvents({ searchTerm: query, action, pageSize: 100 })); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível carregar a auditoria.'); }
    finally { setLoading(false); }
  }, [query, action]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  return <FlatList testID="governance-audit-list" data={items} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} ListHeaderComponent={<View style={styles.headerContent}><View style={styles.pageHeader}><View style={styles.pageCopy}><Text style={styles.eyebrow}>CONTROLE E PRESTAÇÃO DE CONTAS</Text><Text style={styles.title}>Auditoria</Text><Text style={styles.subtitle}>Investigue quem fez cada alteração, em qual unidade e com qual justificativa.</Text></View><AppButton testID="governance-audit-refresh" label="Atualizar" variant="secondary" onPress={load} /></View><AppCard style={styles.filters}><AppInput testID="governance-audit-search" label="Buscar eventos" value={query} onChangeText={setQuery} placeholder="Ação, estabelecimento ou responsável" icon={<Search size={16} color={colors.textMuted} />} /><View style={styles.chips}><Filter label="Todos" selected={!action} onPress={() => setAction(null)} /><Filter label="Mudanças de status" selected={action === 'establishment.status_changed'} onPress={() => setAction('establishment.status_changed')} /><Filter label="Governança" selected={action === 'governance.user_role_changed'} onPress={() => setAction('governance.user_role_changed')} /></View></AppCard>{!!notice && <InlineNotice testID="governance-audit-notice" tone="danger" title="Auditoria indisponível" message={notice} />}<Text style={styles.result}>{loading ? 'Carregando…' : `${items.length} evento${items.length === 1 ? '' : 's'}`}</Text></View>} ListEmptyComponent={loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : <AppCard style={styles.empty}><ClipboardList size={28} color={colors.textMuted} /><Text style={styles.emptyTitle}>Nenhum evento encontrado</Text><Text style={styles.emptyText}>Ajuste sua busca ou o tipo de evento.</Text></AppCard>} renderItem={({ item }) => <AuditCard event={item} />} />;
}

function AuditCard({ event }: { event: GovernanceAuditEvent }) { const reason = typeof event.changes?.reason === 'string' ? event.changes.reason : ''; return <AppCard testID={`governance-audit-event-${event.id}`} style={styles.event}><View style={styles.eventHeader}><View style={styles.rowCopy}><Text style={styles.eventTitle}>{event.target_name}</Text><Text style={styles.eventAction}>{describeEvent(event)}</Text></View><Text style={styles.date}>{new Date(event.created_at).toLocaleString('pt-BR')}</Text></View><Text style={styles.meta}>Por {event.actor_name} · {event.target_type}</Text>{!!reason && <Text style={styles.reason}>Motivo: {reason}</Text>}<Text style={styles.technical}>Evento #{event.id} · alvo {event.target_id.slice(0, 8)} · IP disponível no detalhe técnico</Text></AppCard>; }
function Filter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <AppButton label={label} size="sm" variant={selected ? 'primary' : 'secondary'} onPress={onPress} />; }

const styles = StyleSheet.create({ list: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 14 }, headerContent: { gap: 18, paddingBottom: 4 }, pageHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 }, pageCopy: { flex: 1, minWidth: 280, gap: 7 }, eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 }, title: { color: colors.text, fontFamily: typography.display, fontSize: 30, letterSpacing: -1 }, subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 }, filters: { gap: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, result: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 }, event: { gap: 8 }, eventHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, rowCopy: { flex: 1, gap: 4 }, eventTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17 }, eventAction: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12 }, meta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 }, reason: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 17 }, technical: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10 }, date: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }, loader: { paddingVertical: 50 }, empty: { alignItems: 'center', gap: 8, paddingVertical: 42 }, emptyTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17 }, emptyText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13 } });
