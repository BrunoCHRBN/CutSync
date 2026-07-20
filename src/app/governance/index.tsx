import React, { useEffect, useState, useMemo } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ShieldCheck, LogOut, Search, ShieldAlert, Activity, RefreshCw, Globe, MapPin, AlertTriangle } from 'lucide-react-native';
import { supabaseGovernance } from '../../services/supabaseGovernance';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { AppInput } from '../../components/ui/AppInput';
import { InlineNotice } from '../../components/ui/InlineNotice';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
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
  phone: string | null;
}

interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  target_id: string;
  target_type: string;
  changes: any;
  client_ip: string;
  created_at: string;
}

export default function GovernanceDashboard() {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.mobileBreakpoint;

  // Volatile Auth State
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaModalVisible, setMfaModalVisible] = useState(false);
  const [mfaInput, setMfaInput] = useState('');
  const [mfaError, setMfaError] = useState('');
  
  // Data States
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Check initial volatile session
  useEffect(() => {
    supabaseGovernance.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadGovernanceProfile(session.user.id);
      } else {
        setAuthLoading(false);
      }
    });
  }, []);

  async function loadGovernanceProfile(uid: string) {
    try {
      // Validamos se o usuário possui cargo de governança
      const { data: govUser, error: govError } = await supabaseGovernance
        .from('governance_users')
        .select('role')
        .eq('profile_id', uid)
        .maybeSingle();

      if (govError || !govUser) {
        setNotice({ tone: 'danger', message: 'Acesso restrito. Sua conta não possui permissões na Central.' });
        await supabaseGovernance.auth.signOut();
        setUser(null);
        setProfile(null);
      } else {
        const sessionRes = await supabaseGovernance.auth.getSession();
        const emailVal = sessionRes.data.session?.user?.email || '';

        setProfile({
          id: uid,
          name: 'Membro da Governança',
          email: emailVal,
          role: govUser.role,
        });
        // Carrega dados após autenticação e validação
        loadDashboardData();
      }
    } catch {
      setNotice({ tone: 'danger', message: 'Erro ao carregar permissões da Central.' });
    } finally {
      setAuthLoading(false);
    }
  }

  const handleVolatileLogin = async () => {
    setNotice(null);
    if (!email.trim() || !password) {
      setNotice({ tone: 'danger', message: 'Informe e-mail e senha.' });
      return;
    }
    setAuthLoading(true);
    try {
      const { data, error } = await supabaseGovernance.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error || !data.user) {
        setNotice({ tone: 'danger', message: error?.message || 'Falha na autenticação.' });
        setAuthLoading(false);
      } else {
        // Exige WhatsApp OTP (MFA Mock) para sessões da Central
        setMfaModalVisible(true);
      }
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Erro ao conectar ao servidor.' });
      setAuthLoading(false);
    }
  };

  const confirmMfa = async () => {
    setMfaError('');
    if (mfaInput === '123456') {
      setMfaModalVisible(false);
      const session = await supabaseGovernance.auth.getSession();
      const uid = session.data.session?.user?.id;
      if (uid) {
        setUser(session.data.session.user);
        await loadGovernanceProfile(uid);
      }
    } else {
      setMfaError('Código MFA inválido. Use "123456" para testar.');
    }
  };

  const handleVolatileSignOut = async () => {
    setAuthLoading(true);
    await supabaseGovernance.auth.signOut();
    setUser(null);
    setProfile(null);
    setEstablishments([]);
    setAuditLogs([]);
    setAuthLoading(false);
  };

  async function loadDashboardData(preserveNotice = false) {
    setLoadingData(true);
    if (!preserveNotice) {
      setNotice(null);
    }
    try {
      // 1. Carregar estabelecimentos
      const { data: ests, error: estError } = await supabaseGovernance
        .from('establishments')
        .select('id, name, slug, document_number, document_type, verification_level, account_status, address, phone')
        .order('created_at', { ascending: false });

      if (estError) throw estError;
      setEstablishments((ests || []) as Establishment[]);

      // 2. Carregar logs de auditoria imutáveis
      const { data: logs, error: logError } = await supabaseGovernance
        .from('security_audit_logs')
        .select('id, actor_id, action, target_id, target_type, changes, client_ip, created_at')
        .order('created_at', { ascending: false })
        .limit(40);

      if (logError) throw logError;
      setAuditLogs((logs || []) as AuditLog[]);

    } catch {
      setNotice({ tone: 'danger', message: 'Erro ao carregar dados do dashboard.' });
    } finally {
      setLoadingData(false);
    }
  }

  const updateAccountStatus = async (estId: string, newStatus: any) => {
    if (profile?.role === 'SaaS_Viewer') {
      setNotice({ tone: 'danger', message: 'Apenas SaaS_Editor e SaaS_Owner podem realizar edições.' });
      return;
    }

    setUpdatingId(estId);
    setNotice(null);

    try {
      const { data, error } = await supabaseGovernance
        .from('establishments')
        .update({ account_status: newStatus })
        .eq('id', estId)
        .select('id');

      if (error) {
        setNotice({ tone: 'danger', message: 'Não foi possível atualizar o status do estabelecimento.' });
      } else if (!data || data.length === 0) {
        setNotice({ tone: 'danger', message: 'Permissão negada ou estabelecimento não encontrado.' });
      } else {
        setNotice({ tone: 'success', message: 'Status atualizado com sucesso!' });
        await loadDashboardData(true);
      }
    } catch {
      setNotice({ tone: 'danger', message: 'Erro ao salvar alterações.' });
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredEstablishments = useMemo(() => {
    if (!searchQuery.trim()) return establishments;
    const query = searchQuery.toLowerCase();
    return establishments.filter(e => 
      e.name.toLowerCase().includes(query) || 
      e.slug.toLowerCase().includes(query) || 
      (e.document_number && e.document_number.includes(query))
    );
  }, [establishments, searchQuery]);

  const translateStatus = (status: string) => {
    switch (status) {
      case 'active': return 'Ativo';
      case 'pending_verification': return 'Pendente';
      case 'delinquent': return 'Inadimplente';
      case 'blocked': return 'Bloqueado';
      default: return status || 'Desconhecido';
    }
  };

  const translateAction = (action: string) => {
    switch (action) {
      case 'establishment.status_changed': return 'Alteração de Status';
      case 'governance.user_created': return 'Usuário Criado';
      case 'governance.user_role_changed': return 'Cargo Alterado';
      case 'governance.user_removed': return 'Usuário Removido';
      default: return action;
    }
  };

  const renderLogDescription = (log: AuditLog) => {
    if (log.action === 'establishment.status_changed') {
      const oldVal = translateStatus(log.changes?.old_status);
      const newVal = translateStatus(log.changes?.new_status);
      return `Alterou "${log.changes?.name || 'estabelecimento'}" de ${oldVal} para ${newVal}`;
    }
    if (log.action === 'governance.user_created') {
      return `Criou usuário com cargo ${log.changes?.role || 'N/A'}`;
    }
    if (log.action === 'governance.user_role_changed') {
      return `Alterou cargo de ${log.changes?.old_role || 'N/A'} para ${log.changes?.new_role || 'N/A'}`;
    }
    if (log.action === 'governance.user_removed') {
      return `Removeu usuário (cargo: ${log.changes?.role || 'N/A'})`;
    }
    return JSON.stringify(log.changes);
  };

  // LOGIN SCREEN (Volatile Auth Form)
  if (!user || !profile) {
    return (
      <ScreenBackground testID="governance-login-screen">
        <View style={styles.loginContainer}>
          <AppCard testID="governance-login-card" style={styles.loginCard} elevated>
            <View style={styles.brandContainer}>
              <ShieldAlert color={colors.danger} size={32} />
              <Text style={styles.brandText}>Central de Governança</Text>
            </View>
            <Text style={styles.loginDesc}>Sessão de RAM volátil (Zero Persistência). Ao atualizar a página (F5), você será deslogado.</Text>
            
            {!!notice && <InlineNotice testID="governance-login-notice" tone={notice.tone} message={notice.message} />}

            <View style={styles.fields}>
              <AppInput 
                testID="governance-email-input"
                label="E-mail Administrativo" 
                value={email} 
                onChangeText={setEmail} 
                placeholder="nome@cutsync.com.br" 
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <AppInput 
                testID="governance-password-input"
                label="Senha de Acesso" 
                value={password} 
                onChangeText={setPassword} 
                placeholder="******" 
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {authLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: 12 }} />
            ) : (
              <AppButton testID="governance-login-button" label="Entrar na Central" onPress={handleVolatileLogin} fullWidth />
            )}
          </AppCard>
        </View>

        {/* Modal WhatsApp MFA Mock */}
        <Modal visible={mfaModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <AppCard testID="governance-mfa-card" style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Verificação de Duas Etapas (MFA)</Text>
              </View>
              <Text style={styles.modalDesc}>Enviamos um código OTP via WhatsApp para o telefone cadastrado do administrador.</Text>
              <AppInput 
                testID="governance-mfa-input"
                label="Código de 6 dígitos" 
                value={mfaInput} 
                onChangeText={setMfaInput} 
                placeholder="Digite o código" 
                keyboardType="number-pad" 
              />
              {!!mfaError && <Text style={styles.otpError}>{mfaError}</Text>}
              <AppButton testID="governance-mfa-button" label="Verificar Acesso" onPress={confirmMfa} fullWidth />
            </AppCard>
          </View>
        </Modal>
      </ScreenBackground>
    );
  }

  // DASHBOARD CONTENT
  return (
    <ScreenBackground testID="governance-dashboard-screen">
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <ShieldAlert color={colors.brand} size={22} />
          <Text style={styles.headerTitle}>Central de Governança</Text>
          <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{profile.role}</Text></View>
        </View>
        
        <View style={styles.headerIdentity}>
          <Text style={styles.headerName}>{profile.name}</Text>
          <Text style={styles.headerEmail}>{profile.email}</Text>
        </View>

        <Pressable onPress={handleVolatileSignOut} style={styles.logoutButton}>
          <LogOut color={colors.danger} size={18} />
          <Text style={styles.logoutText}>Sair</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!!notice && <InlineNotice testID="governance-dashboard-notice" tone={notice.tone} message={notice.message} />}

        {/* Estatísticas Rápidas */}
        <View style={styles.statsRow}>
          <AppCard testID="governance-establishments-metric" style={styles.statCard}>
            <Activity color={colors.info} size={18} />
            <Text style={styles.statValue}>{establishments.length}</Text>
            <Text style={styles.statLabel}>Estabelecimentos</Text>
          </AppCard>

          <AppCard testID="governance-active-metric" style={styles.statCard}>
            <ShieldCheck color={colors.success} size={18} />
            <Text style={styles.statValue}>
              {establishments.filter(e => e.account_status === 'active').length}
            </Text>
            <Text style={styles.statLabel}>Ativos / Verificados</Text>
          </AppCard>

          <AppCard testID="governance-blocked-metric" style={styles.statCard}>
            <AlertTriangle color={colors.danger} size={18} />
            <Text style={styles.statValue}>
              {establishments.filter(e => e.account_status === 'delinquent' || e.account_status === 'blocked').length}
            </Text>
            <Text style={styles.statLabel}>Bloqueados / Inadimplentes</Text>
          </AppCard>
        </View>

        <View style={[styles.mainLayout, isWide && styles.mainLayoutWide]}>
          
          {/* Seção 1: Estabelecimentos e Circuit Breaker */}
          <AppCard testID="governance-establishments-card" style={styles.listSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Estabelecimentos e Controle de Acesso</Text>
              <Pressable onPress={loadDashboardData} disabled={loadingData} style={styles.refreshButton}>
                <RefreshCw size={14} color={colors.textSecondary} />
              </Pressable>
            </View>

            <AppInput 
              testID="governance-search-input"
              label="Buscar estabelecimentos"
              placeholder="Buscar por Nome, Slug ou Documento..." 
              value={searchQuery}
              onChangeText={setSearchQuery}
              icon={<Search size={16} color={colors.textMuted} />}
            />

            {loadingData ? (
              <ActivityIndicator color={colors.brand} style={{ margin: 40 }} />
            ) : filteredEstablishments.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum estabelecimento encontrado.</Text>
            ) : (
              <FlatList 
                data={filteredEstablishments}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={[
                    styles.establishmentItem,
                    item.account_status === 'blocked' && styles.establishmentItemBlocked,
                    item.account_status === 'delinquent' && styles.establishmentItemDelinquent,
                  ]}>
                    <View style={styles.estMeta}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.estName}>{item.name}</Text>
                        <View style={[
                          styles.statusBadge,
                          item.account_status === 'active' && styles.badgeSuccess,
                          item.account_status === 'pending_verification' && styles.badgeWarning,
                          item.account_status === 'delinquent' && styles.badgeDanger,
                          item.account_status === 'blocked' && styles.badgeDanger,
                        ]}>
                          <Text style={[
                            styles.statusBadgeText,
                            item.account_status === 'active' && styles.badgeTextSuccess,
                            item.account_status === 'pending_verification' && styles.badgeTextWarning,
                            item.account_status === 'delinquent' && styles.badgeTextDanger,
                            item.account_status === 'blocked' && styles.badgeTextDanger,
                          ]}>
                            {translateStatus(item.account_status)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.estSlug}>cutsync.com/{item.slug}</Text>
                      <View style={styles.docRow}>
                        <Text style={styles.docText}>{item.document_type}: {item.document_number || 'Não informado'}</Text>
                        <Text style={styles.levelText}>Nível: {item.verification_level}</Text>
                      </View>
                      {!!item.address && (
                        <View style={styles.addressRow}>
                          <MapPin size={10} color={colors.textMuted} />
                          <Text style={styles.addressText}>{item.address}</Text>
                        </View>
                      )}
                    </View>

                    {/* Circuit Breaker Controls */}
                    <View style={styles.statusControls}>
                      <Text style={styles.controlLabel}>Alterar Status da Conta:</Text>
                      <View style={styles.statusButtons}>
                        <Pressable 
                          onPress={() => updateAccountStatus(item.id, 'active')}
                          disabled={updatingId === item.id}
                          style={[styles.statusOption, item.account_status === 'active' && styles.statusOptionActiveSuccess]}
                        >
                          <Text style={[styles.statusOptionLabel, item.account_status === 'active' && styles.statusOptionLabelActive]}>Ativo</Text>
                        </Pressable>

                        <Pressable 
                          onPress={() => updateAccountStatus(item.id, 'delinquent')}
                          disabled={updatingId === item.id}
                          style={[styles.statusOption, item.account_status === 'delinquent' && styles.statusOptionActiveWarning]}
                        >
                          <Text style={[styles.statusOptionLabel, item.account_status === 'delinquent' && styles.statusOptionLabelActive]}>Inadimplente</Text>
                        </Pressable>

                        <Pressable 
                          onPress={() => updateAccountStatus(item.id, 'blocked')}
                          disabled={updatingId === item.id}
                          style={[styles.statusOption, item.account_status === 'blocked' && styles.statusOptionActiveDanger]}
                        >
                          <Text style={[styles.statusOptionLabel, item.account_status === 'blocked' && styles.statusOptionLabelActive]}>Bloqueado</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              />
            )}
          </AppCard>

          {/* Seção 2: Logs de Auditoria de Segurança Imutáveis */}
          <AppCard testID="governance-audit-card" style={styles.logsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trilha de Auditoria Imutável</Text>
              <Globe size={18} color={colors.info} />
            </View>

            {loadingData ? (
              <ActivityIndicator color={colors.brand} style={{ margin: 40 }} />
            ) : auditLogs.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum log de segurança registrado.</Text>
            ) : (
              <FlatList 
                data={auditLogs}
                keyExtractor={(item) => String(item.id)}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.logItem}>
                    <View style={styles.logTop}>
                      <Text style={styles.logAction}>{translateAction(item.action)}</Text>
                      <Text style={styles.logDate}>{new Date(item.created_at).toLocaleTimeString('pt-BR')} - {new Date(item.created_at).toLocaleDateString('pt-BR')}</Text>
                    </View>
                    <View style={styles.logMeta}>
                      <Text style={styles.logMetaText}>IP: {item.client_ip}</Text>
                      <Text style={styles.logMetaText}>Alvo: {item.target_type} ({item.target_id.slice(0, 8)})</Text>
                    </View>
                    <Text style={styles.logChanges}>{renderLogDescription(item)}</Text>
                  </View>
                )}
              />
            )}
          </AppCard>

        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  loginContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loginCard: { width: '100%', maxWidth: 440, padding: 28, gap: 20 },
  brandContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandText: { color: colors.text, fontFamily: typography.display, fontSize: 22 },
  loginDesc: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  fields: { gap: 16 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, flexWrap: 'wrap', gap: 12 },
  headerTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  roleBadge: { backgroundColor: colors.accent, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeText: { color: colors.ink, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase' },
  headerIdentity: { alignItems: 'flex-end' },
  headerName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  headerEmail: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.dangerSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
  logoutText: { color: colors.danger, fontFamily: typography.bodyStrong, fontSize: 12 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 80, gap: 20 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  statCard: { flex: 1, minWidth: 200, padding: 20, gap: 8 },
  statValue: { color: colors.text, fontFamily: typography.display, fontSize: 28 },
  statLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  mainLayout: { gap: 20 },
  mainLayoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  listSection: { flex: 2, padding: 20, gap: 16 },
  logsSection: { flex: 1.2, padding: 20, gap: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  refreshButton: { padding: 8, borderRadius: radii.pill, backgroundColor: colors.canvas },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, paddingHorizontal: 12, backgroundColor: colors.canvas },
  emptyText: { textAlign: 'center', color: colors.textMuted, marginVertical: 32, fontSize: 13 },
  establishmentItem: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 16, gap: 14 },
  estMeta: { gap: 4 },
  estName: { color: colors.text, fontFamily: typography.display, fontSize: 16 },
  estSlug: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11 },
  docRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  docText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  levelText: { color: colors.info, fontFamily: typography.bodyStrong, fontSize: 11 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  addressText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, flex: 1 },
  statusControls: { gap: 8 },
  controlLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  statusButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  statusOption: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radii.sm, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  statusOptionActiveSuccess: { backgroundColor: colors.successSoft, borderColor: colors.success },
  statusOptionActiveWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  statusOptionActiveDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  statusOptionLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  statusOptionLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  logItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 6 },
  logTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logAction: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  logDate: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  logMeta: { flexDirection: 'row', gap: 12 },
  logMetaText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  logChanges: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, backgroundColor: colors.canvasSoft, padding: 6, borderRadius: radii.sm, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, padding: 24, gap: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  modalDesc: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  otpError: { color: colors.danger, fontFamily: typography.bodyStrong, fontSize: 11 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, borderWidth: 1, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 10, fontFamily: typography.bodyStrong, textTransform: 'uppercase' },
  badgeSuccess: { backgroundColor: colors.successSoft, borderColor: colors.success },
  badgeTextSuccess: { color: colors.success },
  badgeWarning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  badgeTextWarning: { color: colors.warning },
  badgeDanger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  badgeTextDanger: { color: colors.danger },
  establishmentItemBlocked: { borderLeftWidth: 4, borderLeftColor: colors.danger, paddingLeft: 12, opacity: 0.8 },
  establishmentItemDelinquent: { borderLeftWidth: 4, borderLeftColor: colors.warning, paddingLeft: 12, opacity: 0.9 },
});
