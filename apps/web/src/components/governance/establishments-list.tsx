import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Building2, Search } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { listGovernanceEstablishments } from '../../services/governance-operations';
import type { GovernanceAccountStatus, GovernanceEstablishmentListItem } from '../../types/governance-knowledge';

const labels: Record<GovernanceAccountStatus, string> = { active: 'Ativos', pending_verification: 'Pendentes', delinquent: 'Inadimplentes', blocked: 'Bloqueados' };

export function GovernanceEstablishmentsList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();
  const initialStatus = ['active', 'pending_verification', 'delinquent', 'blocked'].includes(params.status || '') ? params.status as GovernanceAccountStatus : null;
  const [items, setItems] = useState<GovernanceEstablishmentListItem[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<GovernanceAccountStatus | null>(initialStatus);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setNotice('');
    try {
      setItems(await listGovernanceEstablishments({ searchTerm: query, status, pageSize: 100 }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível carregar os estabelecimentos.');
    } finally { setLoading(false); }
  }, [query, status]);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  return (
    <FlatList
      testID="governance-establishments-list"
      data={items}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<View style={styles.headerContent}>
        <View style={styles.pageHeader}><View style={styles.pageCopy}><Text style={styles.eyebrow}>OPERAÇÃO</Text><Text style={styles.title}>Estabelecimentos</Text><Text style={styles.subtitle}>Pesquise uma unidade, confira o risco operacional e abra seu histórico.</Text></View><AppButton testID="governance-establishments-refresh" label="Atualizar" variant="secondary" onPress={load} /></View>
        <AppCard testID="governance-establishments-filters" style={styles.filters}>
          <AppInput testID="governance-establishments-search" label="Buscar estabelecimentos" value={query} onChangeText={setQuery} placeholder="Nome, slug ou documento" icon={<Search size={16} color={colors.textMuted} />} />
          <View style={styles.chips}><FilterChip label="Todos" selected={!status} onPress={() => setStatus(null)} />{(Object.keys(labels) as GovernanceAccountStatus[]).map((item) => <FilterChip key={item} label={labels[item]} selected={status === item} onPress={() => setStatus(item)} />)}</View>
        </AppCard>
        {!!notice && <InlineNotice testID="governance-establishments-notice" tone="danger" title="Lista indisponível" message={notice} />}
        <Text style={styles.result}>{loading ? 'Carregando…' : `${items.length} estabelecimento${items.length === 1 ? '' : 's'}`}</Text>
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : <AppCard style={styles.empty}><Building2 size={28} color={colors.textMuted} /><Text style={styles.emptyTitle}>Nenhuma unidade encontrada</Text><Text style={styles.emptyText}>Ajuste a busca ou o filtro de status.</Text></AppCard>}
      renderItem={({ item }) => <EstablishmentRow item={item} onPress={() => router.push(`/governance/establishments/${item.id}`)} />}
    />
  );
}

function EstablishmentRow({ item, onPress }: { item: GovernanceEstablishmentListItem; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${item.name}`} onPress={onPress} style={({ pressed }) => [styles.rowPressable, pressed && styles.pressed]}><AppCard style={styles.row}><View style={styles.rowCopy}><View style={styles.titleRow}><Text style={styles.itemTitle}>{item.name}</Text><StatusBadge status={item.account_status} /></View><Text style={styles.slug}>cutsync.com/{item.slug}</Text><Text style={styles.meta}>{item.document_type || 'Documento'}: {item.document_number || 'não informado'} · verificação nível {item.verification_level || 1}</Text>{!!item.address && <Text numberOfLines={1} style={styles.meta}>{item.address}</Text>}</View><ArrowRight color={colors.textMuted} size={18} /></AppCard></Pressable>;
}

export function StatusBadge({ status }: { status: GovernanceAccountStatus }) {
  const tone = status === 'active' ? styles.success : status === 'pending_verification' ? styles.warning : styles.danger;
  return <View style={[styles.badge, tone]}><Text style={styles.badgeText}>{status === 'pending_verification' ? 'Pendente' : labels[status].replace(/s$/, '')}</Text></View>;
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 14 },
  headerContent: { gap: 18, paddingBottom: 4 },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 18 },
  pageCopy: { flex: 1, minWidth: 280, gap: 7 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 30, letterSpacing: -1 },
  subtitle: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  filters: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 13 },
  chipSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  chipTextSelected: { color: colors.brand },
  result: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  rowPressable: { borderRadius: radii.lg },
  pressed: { opacity: 0.78 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17 },
  rowCopy: { flex: 1, gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  itemTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17 },
  slug: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11 },
  meta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  badge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4 },
  success: { backgroundColor: colors.successSoft },
  warning: { backgroundColor: colors.warningSoft },
  danger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'uppercase' },
  loader: { paddingVertical: 50 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 42 },
  emptyTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17 },
  emptyText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13 },
});
