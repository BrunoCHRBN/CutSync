import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Activity, AlertTriangle, Globe, MapPin, RefreshCw, Search, ShieldCheck } from 'lucide-react-native';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import { supabaseGovernance } from '../../services/supabaseGovernance';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { colors, layout, radii, typography } from '../../theme/tokens';

interface Establishment {
  id: string;
  name: string;
  slug: string;
  document_number: string | null;
  document_type: 'CPF' | 'CNPJ' | null;
  verification_level: number;
  account_status: 'pending_verification' | 'active' | 'delinquent' | 'blocked';
  address: string | null;
}

interface AuditLog {
  id: number;
  action: string;
  target_id: string;
  target_type: string;
  changes: Record<string, unknown>;
  client_ip: string;
  created_at: string;
}

const statusLabel: Record<Establishment['account_status'], string> = {
  active: 'Ativo',
  pending_verification: 'Pendente',
  delinquent: 'Inadimplente',
  blocked: 'Bloqueado',
};

export function GovernanceDashboard() {
  const { width } = useWindowDimensions();
  const { profile } = useGovernanceAuth();
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const load = useCallback(async (preserveNotice = false) => {
    setLoading(true);
    if (!preserveNotice) setNotice(null);
    const [establishmentResult, logResult] = await Promise.all([
      supabaseGovernance
        .from('establishments')
        .select('id, name, slug, document_number, document_type, verification_level, account_status, address')
        .order('created_at', { ascending: false }),
      supabaseGovernance
        .from('security_audit_logs')
        .select('id, action, target_id, target_type, changes, client_ip, created_at')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);
    if (establishmentResult.error || logResult.error) {
      setNotice({ tone: 'danger', message: 'Não foi possível carregar o painel de Governança.' });
    } else {
      setEstablishments((establishmentResult.data ?? []) as Establishment[]);
      setLogs((logResult.data ?? []) as unknown as AuditLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return establishments;
    return establishments.filter((item) =>
      item.name.toLowerCase().includes(query)
      || item.slug.toLowerCase().includes(query)
      || item.document_number?.includes(query),
    );
  }, [establishments, search]);

  const updateStatus = async (id: string, accountStatus: Establishment['account_status']) => {
    if (profile?.role === 'SaaS_Viewer') {
      setNotice({ tone: 'danger', message: 'Seu perfil possui permissão somente de leitura.' });
      return;
    }
    setUpdatingId(id);
    const { data, error } = await supabaseGovernance
      .from('establishments')
      .update({ account_status: accountStatus })
      .eq('id', id)
      .select('id');
    if (error || !data?.length) {
      setNotice({ tone: 'danger', message: 'A alteração foi recusada ou o estabelecimento não existe.' });
    } else {
      setNotice({ tone: 'success', message: 'Status atualizado e registrado na auditoria.' });
      await load(true);
    }
    setUpdatingId(null);
  };

  return (
    <ScrollView
      testID="governance-dashboard-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {!!notice && <InlineNotice testID="governance-dashboard-notice" tone={notice.tone} message={notice.message} />}
      <View style={styles.metrics}>
        <Metric testID="governance-establishments-metric" icon={<Activity color={colors.info} size={18} />} value={establishments.length} label="Estabelecimentos" />
        <Metric testID="governance-active-metric" icon={<ShieldCheck color={colors.success} size={18} />} value={establishments.filter((item) => item.account_status === 'active').length} label="Ativos / verificados" />
        <Metric testID="governance-blocked-metric" icon={<AlertTriangle color={colors.danger} size={18} />} value={establishments.filter((item) => ['blocked', 'delinquent'].includes(item.account_status)).length} label="Com restrição" />
      </View>

      <View style={[styles.columns, width >= layout.desktopBreakpoint && styles.columnsWide]}>
        <AppCard testID="governance-establishments-card" style={styles.establishmentsCard}>
          <View style={styles.sectionHeader}>
            <View style={{ gap: 4 }}>
              <Text style={styles.sectionTitle}>Estabelecimentos e acesso</Text>
              <Text style={styles.sectionDescription}>Controle operacional protegido por políticas do banco.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Atualizar painel" onPress={() => load(true)} style={styles.iconButton}>
              <RefreshCw size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
          <AppInput
            testID="governance-search-input"
            label="Buscar estabelecimentos"
            value={search}
            onChangeText={setSearch}
            placeholder="Nome, slug ou documento"
            icon={<Search size={16} color={colors.textMuted} />}
          />
          {loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : filtered.map((item) => (
            <View key={item.id} style={styles.establishment}>
              <View style={styles.establishmentInfo}>
                <View style={styles.titleRow}>
                  <Text selectable style={styles.establishmentName}>{item.name}</Text>
                  <View style={[styles.badge, item.account_status === 'active' ? styles.badgeSuccess : item.account_status === 'pending_verification' ? styles.badgeWarning : styles.badgeDanger]}>
                    <Text style={styles.badgeText}>{statusLabel[item.account_status]}</Text>
                  </View>
                </View>
                <Text selectable style={styles.slug}>cutsync.com/{item.slug}</Text>
                <Text selectable style={styles.meta}>{item.document_type || 'Documento'}: {item.document_number || 'não informado'} · nível {item.verification_level}</Text>
                {!!item.address && <View style={styles.address}><MapPin size={12} color={colors.textMuted} /><Text style={styles.meta}>{item.address}</Text></View>}
              </View>
              <View style={styles.statusActions}>
                {(['active', 'delinquent', 'blocked'] as const).map((status) => (
                  <Pressable
                    key={status}
                    accessibilityRole="button"
                    disabled={updatingId === item.id || profile?.role === 'SaaS_Viewer'}
                    onPress={() => updateStatus(item.id, status)}
                    style={[styles.statusButton, item.account_status === status && styles.statusButtonActive]}
                  >
                    <Text style={styles.statusButtonText}>{statusLabel[status]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </AppCard>

        <AppCard testID="governance-audit-card" style={styles.auditCard}>
          <View style={styles.sectionHeader}>
            <View style={{ gap: 4 }}>
              <Text style={styles.sectionTitle}>Trilha imutável</Text>
              <Text style={styles.sectionDescription}>Eventos recentes, sem conteúdo sensível.</Text>
            </View>
            <Globe size={18} color={colors.info} />
          </View>
          {loading ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : logs.length === 0 ? (
            <Text style={styles.empty}>Nenhum evento registrado.</Text>
          ) : logs.map((log) => (
            <View key={log.id} style={styles.log}>
              <View style={styles.logHeader}>
                <Text selectable style={styles.logAction}>{log.action}</Text>
                <Text style={styles.logDate}>{new Date(log.created_at).toLocaleDateString('pt-BR')}</Text>
              </View>
              <Text selectable style={styles.meta}>Alvo: {log.target_type} · {log.target_id.slice(0, 8)}</Text>
              <Text selectable style={styles.meta}>IP: {log.client_ip}</Text>
            </View>
          ))}
        </AppCard>
      </View>
    </ScrollView>
  );
}

function Metric({ testID, icon, value, label }: { testID: string; icon: React.ReactNode; value: number; label: string }) {
  return (
    <AppCard testID={testID} style={styles.metric}>
      {icon}
      <Text selectable style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 20 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  metric: { flex: 1, minWidth: 190, gap: 7 },
  metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 28, fontVariant: ['tabular-nums'] },
  metricLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  columns: { gap: 20 },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  establishmentsCard: { flex: 2, gap: 16 },
  auditCard: { flex: 1.1, gap: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  sectionDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.canvas },
  loader: { marginVertical: 40 },
  establishment: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, gap: 14 },
  establishmentInfo: { gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  establishmentName: { color: colors.text, fontFamily: typography.display, fontSize: 16 },
  badge: { borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeSuccess: { backgroundColor: colors.successSoft },
  badgeWarning: { backgroundColor: colors.warningSoft },
  badgeDanger: { backgroundColor: colors.dangerSoft },
  badgeText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  slug: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11 },
  meta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusButton: { minHeight: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 12 },
  statusButtonActive: { backgroundColor: colors.brandSoft, borderColor: colors.brandBorder },
  statusButtonText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  empty: { color: colors.textMuted, fontFamily: typography.body, textAlign: 'center', paddingVertical: 32 },
  log: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 5 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  logAction: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, flex: 1 },
  logDate: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
});
