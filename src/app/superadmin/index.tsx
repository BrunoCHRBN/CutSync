import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check, Clock3, Copy, LogOut, ShieldCheck, Store, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { AppInput } from '../../components/ui/AppInput';
import { BrandMark } from '../../components/ui/BrandMark';
import { InlineNotice } from '../../components/ui/InlineNotice';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

interface EstablishmentRequest {
  id: string; requester_name: string; requester_email: string; name: string; slug: string;
  address?: string | null; phone?: string | null; status: string; created_at: string;
}

export default function SuperadminDashboard() {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.mobileBreakpoint;
  const { profile, signOut } = useAuth();
  const [requests, setRequests] = useState<EstablishmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectionId, setRejectionId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('establishment_requests').select('*').eq('status', 'pending').order('created_at');
    setRequests((data || []) as EstablishmentRequest[]);
    if (error) setNotice({ tone: 'danger', message: 'Não foi possível carregar solicitações.' });
    setLoading(false);
  };

  useEffect(() => { void loadRequests(); }, []);

  const approve = async (requestId: string) => {
    setActionId(requestId); setNotice(null); setGeneratedLink('');
    const { data, error } = await supabase.rpc('approve_establishment_request', { target_request_id: requestId });
    if (error || !data?.[0]) setNotice({ tone: 'danger', message: 'Não foi possível aprovar esta solicitação.' });
    else {
      const link = typeof window !== 'undefined' ? `${window.location.origin}/invite/${data[0].raw_token}` : `cutsync://invite/${data[0].raw_token}`;
      setGeneratedLink(link);
      setNotice({ tone: 'success', message: `Aprovado. Envie o convite ao e-mail ${data[0].invited_email}.` });
      await loadRequests();
    }
    setActionId(null);
  };

  const reject = async (requestId: string) => {
    setActionId(requestId); setNotice(null);
    const { error } = await supabase.rpc('reject_establishment_request', { target_request_id: requestId, reason });
    if (error) setNotice({ tone: 'danger', message: 'Não foi possível rejeitar esta solicitação.' });
    else { setNotice({ tone: 'success', message: 'Solicitação rejeitada.' }); setRejectionId(null); setReason(''); await loadRequests(); }
    setActionId(null);
  };

  const copyLink = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(generatedLink);
    setNotice({ tone: 'success', message: 'Link de convite copiado.' });
  };

  return (
    <ScreenBackground testID="superadmin-dashboard-screen">
      <View testID="superadmin-header" style={styles.header}>
        <BrandMark compact testID="superadmin-brand" />
        <View style={styles.headerIdentity}><Text style={styles.headerLabel}>Superadmin</Text><Text testID="superadmin-user-name" style={styles.headerName}>{profile?.name}</Text></View>
        <Pressable testID="superadmin-sign-out-button" accessibilityRole="button" accessibilityLabel="Sair" onPress={signOut} style={styles.iconButton}><LogOut color={colors.danger} size={18} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View><Text style={styles.eyebrow}>CENTRAL DE CONFIANÇA</Text><Text testID="superadmin-title" style={styles.title}>Aprovações de estabelecimentos</Text><Text style={styles.description}>Revise a operação antes de gerar o primeiro convite administrativo.</Text></View>
          <AppCard testID="superadmin-pending-metric" style={styles.metric}><Clock3 color={colors.warning} size={18} /><Text style={styles.metricValue}>{requests.length}</Text><Text style={styles.metricLabel}>pendentes</Text></AppCard>
        </View>
        {!!notice && <InlineNotice testID="superadmin-notice" tone={notice.tone} message={notice.message} />}
        {!!generatedLink && <AppCard testID="superadmin-generated-invite" style={styles.inviteCard}><ShieldCheck color={colors.success} size={20} /><Text selectable style={styles.inviteLink}>{generatedLink}</Text><AppButton label="Copiar convite" testID="superadmin-copy-invite-button" onPress={copyLink} icon={<Copy color={colors.text} size={15} />} variant="secondary" /></AppCard>}
        {loading ? <ActivityIndicator testID="superadmin-requests-loading" color={colors.brand} style={styles.loader} /> : requests.length === 0 ? (
          <AppCard testID="superadmin-requests-empty" style={styles.empty}><ShieldCheck color={colors.success} size={24} /><Text style={styles.emptyTitle}>Fila em dia</Text><Text style={styles.emptyText}>Nenhuma solicitação aguarda análise.</Text></AppCard>
        ) : <View testID="superadmin-requests-list" style={styles.grid}>{requests.map((item) => (
          <AppCard key={item.id} testID={`superadmin-request-${item.id}`} style={styles.requestCard}>
            <View style={styles.requestTop}><View style={styles.storeIcon}><Store color={colors.textSecondary} size={19} /></View><Text style={styles.requestDate}>{new Date(item.created_at).toLocaleDateString('pt-BR')}</Text></View>
            <Text testID={`superadmin-request-${item.id}-name`} style={styles.requestName}>{item.name}</Text>
            <Text style={styles.requestSlug}>cutsync.com/{item.slug}</Text>
            <Text style={styles.requestMeta}>{item.requester_name} · {item.requester_email}</Text>
            {!!item.address && <Text style={styles.requestMeta}>{item.address}</Text>}
            {rejectionId === item.id ? <View style={styles.rejectForm}><AppInput label="Motivo da rejeição" testID={`superadmin-request-${item.id}-reason-input`} value={reason} onChangeText={setReason} placeholder="Informe o motivo" /><View style={styles.actions}><AppButton label="Confirmar rejeição" testID={`superadmin-request-${item.id}-reject-confirm-button`} onPress={() => reject(item.id)} loading={actionId === item.id} variant="danger" /><AppButton label="Voltar" testID={`superadmin-request-${item.id}-reject-cancel-button`} onPress={() => setRejectionId(null)} variant="secondary" /></View></View> : <View style={styles.actions}><AppButton label="Aprovar" testID={`superadmin-request-${item.id}-approve-button`} onPress={() => approve(item.id)} loading={actionId === item.id} icon={<Check color={colors.ink} size={15} />} /><AppButton label="Rejeitar" testID={`superadmin-request-${item.id}-reject-button`} onPress={() => setRejectionId(item.id)} variant="danger" icon={<X color={colors.danger} size={15} />} /></View>}
          </AppCard>
        ))}</View>}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerIdentity: { flex: 1, alignItems: 'flex-end' }, headerLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 }, headerName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  iconButton: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingBottom: 80, gap: 20 },
  hero: { gap: 22, marginBottom: 12 }, heroWide: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 2 }, title: { color: colors.text, fontFamily: typography.display, fontSize: 36, lineHeight: 42, marginTop: 10 }, description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 10 },
  metric: { minWidth: 180, flexDirection: 'row', alignItems: 'baseline', gap: 8, padding: 20 }, metricValue: { color: colors.text, fontFamily: typography.display, fontSize: 32 }, metricLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, requestCard: { width: '100%', maxWidth: 390, flexGrow: 1, padding: 20 },
  requestTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, storeIcon: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed }, requestDate: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  requestName: { color: colors.text, fontFamily: typography.display, fontSize: 21, marginTop: 18 }, requestSlug: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 5 }, requestMeta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 19, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 }, rejectForm: { marginTop: 20 }, loader: { margin: 60 }, empty: { maxWidth: 480, padding: 30 }, emptyTitle: { color: colors.text, fontFamily: typography.display, fontSize: 22, marginTop: 16 }, emptyText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, marginTop: 8 },
  inviteCard: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, inviteLink: { flex: 1, minWidth: 220, color: colors.text, fontFamily: typography.body, fontSize: 12 },
});