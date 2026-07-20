import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Building2, Clock3, Link2, MapPin, Phone, ShieldCheck, UserCheck, CheckSquare, Square, Check, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, radii, typography } from '../../theme/tokens';

interface ExistingRequest {
  id: string;
  name: string;
  slug: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
}

export const RequestEstablishmentExperience = () => {
  const { profile, refreshProfile, signOut } = useAuth();
  
  // Onboarding Type State
  const [onboardingType, setOnboardingType] = useState<'CNPJ' | 'CPF'>('CNPJ');
  
  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cpf, setCpf] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  
  // LGPD Consents
  const [lgpdTermsAccepted, setLgpdTermsAccepted] = useState(false);
  const [lgpdMarketingAccepted, setLgpdMarketingAccepted] = useState(false);
  
  // OTP WhatsApp states
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  
  // App States
  const [request, setRequest] = useState<ExistingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  
  const cleanSlug = useMemo(() => slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, ''), [slug]);

  // CPF Check Digit mathematical validation
  const isValidCpf = (val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean.charAt(i)) * (10 - i);
    let rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(9))) return false;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean.charAt(i)) * (11 - i);
    rev = 11 - (sum % 11);
    if (rev === 10 || rev === 11) rev = 0;
    if (rev !== parseInt(clean.charAt(10))) return false;
    return true;
  };

  const loadRequest = async () => {
    setLoading(true);
    // Verificamos se há algum estabelecimento ou solicitação ativa
    const { data: activeEst } = await supabase.from('establishments')
      .select('id, name, slug, account_status')
      .eq('document_number', onboardingType === 'CNPJ' ? cnpj.replace(/[^0-9]/g, '') : cpf.replace(/[^0-9]/g, ''))
      .maybeSingle();

    if (activeEst) {
      setRequest({
        id: activeEst.id,
        name: activeEst.name,
        slug: activeEst.slug,
        status: activeEst.account_status === 'pending_verification' ? 'pending' : 'approved',
        created_at: new Date().toISOString(),
      });
    } else {
      const { data } = await supabase.from('establishment_requests')
        .select('id,name,slug,status,rejection_reason,created_at')
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      setRequest(data as ExistingRequest | null);
    }
    setLoading(false);
  };

  useEffect(() => { void loadRequest(); }, [onboardingType]);

  const sendOtpMessage = () => {
    const cleanPhone = whatsapp.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      setNotice({ tone: 'danger', message: 'Informe um número de WhatsApp válido para receber o OTP.' });
      return;
    }
    setSendingOtp(true);
    setNotice(null);
    setTimeout(() => {
      setSendingOtp(false);
      setOtpModalVisible(true);
      setNotice({ tone: 'success', message: 'Código de validação enviado via WhatsApp! Use o código "123456" para testar.' });
    }, 1000);
  };

  const confirmOtpCode = () => {
    setOtpError('');
    if (otpInput === '123456') {
      setWhatsappVerified(true);
      setOtpModalVisible(false);
      setNotice({ tone: 'success', message: 'WhatsApp validado com sucesso! Nível 1 de confiança obtido.' });
    } else {
      setOtpError('Código inválido. Digite 123456 para validar.');
    }
  };

  const submitRequest = async () => {
    setNotice(null);
    if (!name.trim() || cleanSlug.length < 3 || !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      setNotice({ tone: 'danger', message: 'Informe nome comercial, endereço digital (slug) válido e uma cor em hexadecimal.' });
      return;
    }

    if (!lgpdTermsAccepted) {
      setNotice({ tone: 'danger', message: 'Você precisa aceitar os Termos de Uso e Política de Privacidade para continuar.' });
      return;
    }

    setSubmitting(true);

    if (onboardingType === 'CNPJ') {
      // ESTEIRA CNPJ: Triagem automatizada na Receita via Edge Function
      try {
        const { data, error } = await supabase.functions.invoke('verify-cnpj-and-promote', {
          body: {
            cnpj: cnpj.replace(/[^0-9]/g, ''),
            name: name.trim(),
            slug: cleanSlug,
            address: address.trim() || null,
            phone: phone.trim() || null,
            primary_color: primaryColor,
          }
        });

        if (error || !data || data.error) {
          setNotice({ tone: 'danger', message: data?.error || error?.message || 'Falha na triagem do CNPJ.' });
        } else {
          // Salvar aceites no perfil do usuário
          await supabase.from('profiles').update({
            lgpd_terms_accepted: lgpdTermsAccepted,
            lgpd_marketing_accepted: lgpdMarketingAccepted,
            lgpd_accepted_at: new Date().toISOString()
          }).eq('id', profile?.id);

          setNotice({ tone: 'success', message: 'Estabelecimento cadastrado! Você foi promovido a Administrador (Nível 1).' });
          await refreshProfile();
          await loadRequest();
        }
      } catch (err: any) {
        setNotice({ tone: 'danger', message: err.message || 'Erro de conexão ao validar o CNPJ.' });
      } finally {
        setSubmitting(false);
      }
    } else {
      // ESTEIRA CPF: Profissional Autônomo com Fricção Progressiva
      const cleanCpf = cpf.replace(/[^0-9]/g, '');
      if (!isValidCpf(cleanCpf)) {
        setNotice({ tone: 'danger', message: 'CPF inválido matematicamente.' });
        setSubmitting(false);
        return;
      }

      if (!whatsappVerified) {
        setNotice({ tone: 'danger', message: 'Valide seu número de WhatsApp com código OTP antes de cadastrar.' });
        setSubmitting(false);
        return;
      }

      try {
        const { data: estId, error } = await supabase.rpc('create_establishment_cpf', {
          target_user_id: profile?.id || '',
          target_cpf: cleanCpf,
          requested_name: name.trim(),
          requested_slug: cleanSlug,
          requested_address: address.trim() || null,
          requested_phone: phone.trim() || null,
          requested_primary_color: primaryColor,
        });

        if (error) {
          const userFriendlyMsg = error.message.includes('cpf_already_registered') 
            ? 'Este CPF já possui estabelecimento cadastrado.'
            : error.message.includes('slug_unavailable')
            ? 'O endereço digital (slug) solicitado já está em uso.'
            : error.message;
          setNotice({ tone: 'danger', message: userFriendlyMsg });
        } else {
          // Salvar aceites no perfil
          await supabase.from('profiles').update({
            lgpd_terms_accepted: lgpdTermsAccepted,
            lgpd_marketing_accepted: lgpdMarketingAccepted,
            lgpd_accepted_at: new Date().toISOString()
          }).eq('id', profile?.id);

          setNotice({ tone: 'success', message: 'Cadastro concluído! Acesso administrativo Nível 1 liberado.' });
          await refreshProfile();
          await loadRequest();
        }
      } catch (err: any) {
        setNotice({ tone: 'danger', message: err.message || 'Falha ao processar cadastro autônomo.' });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const statusLabel = request?.status === 'pending' ? 'Em análise' : request?.status === 'approved' ? 'Aprovada' : 'Rejeitada';

  return (
    <ClientShell testID="request-establishment-screen" activeRoute="request" userName={profile?.name} isSyncing={loading} syncError={null} onSync={loadRequest} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading 
          testID="request-establishment-heading" 
          eyebrow="Onboarding Automatizado" 
          title="Ative seu negócio no CutSync" 
          description="Substituímos aprovações manuais por esteiras diretas baseadas em confiança de dados e fricção progressiva segura." 
        />

        {!!notice && <InlineNotice testID="request-establishment-notice" tone={notice.tone} message={notice.message} />}

        {request?.status === 'pending' ? (
          <AppCard testID="request-establishment-pending-card" style={styles.statusCard} elevated>
            <View style={styles.statusIcon}><Clock3 color={colors.warning} size={24} /></View>
            <Text testID="request-establishment-status" style={styles.statusEyebrow}>{statusLabel}</Text>
            <Text testID="request-establishment-pending-name" style={styles.statusTitle}>{request.name}</Text>
            <Text style={styles.statusDescription}>Seu estabelecimento foi criado no banco e o Nível 1 (Agenda local) está ativo. A vitrine pública aguarda confirmação de e-mail no Nível 2.</Text>
            <View style={styles.securityRow}><ShieldCheck color={colors.success} size={16} /><Text style={styles.securityText}>Acesso administrativo local liberado para {profile?.email}</Text></View>
          </AppCard>
        ) : (
          <View style={styles.workspace}>
            <AppCard testID="request-establishment-form-card" style={styles.formCard} elevated>
              <Text style={styles.cardEyebrow}>DADOS DA OPERAÇÃO</Text>
              <Text style={styles.cardTitle}>Preencha para iniciar</Text>

              {/* Seletor de Esteira */}
              <View style={styles.tabSelector}>
                <Pressable 
                  onPress={() => { setOnboardingType('CNPJ'); setNotice(null); }} 
                  style={[styles.tabButton, onboardingType === 'CNPJ' && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabLabel, onboardingType === 'CNPJ' && styles.tabLabelActive]}>Pessoa Jurídica (CNPJ)</Text>
                </Pressable>
                <Pressable 
                  onPress={() => { setOnboardingType('CPF'); setNotice(null); }} 
                  style={[styles.tabButton, onboardingType === 'CPF' && styles.tabButtonActive]}
                >
                  <Text style={[styles.tabLabel, onboardingType === 'CPF' && styles.tabLabelActive]}>Autônomo (CPF)</Text>
                </Pressable>
              </View>

              <View style={styles.fields}>
                {onboardingType === 'CNPJ' ? (
                  <AppInput 
                    label="CNPJ do Estabelecimento" 
                    testID="request-establishment-cnpj-input" 
                    value={cnpj} 
                    onChangeText={setCnpj} 
                    placeholder="00.000.000/0000-00" 
                    hint="Aprovado de forma atômica se status Receita for ATIVO em beleza/estética." 
                  />
                ) : (
                  <View style={styles.cpfRow}>
                    <AppInput 
                      containerStyle={{ flex: 1 }}
                      label="CPF do Profissional" 
                      testID="request-establishment-cpf-input" 
                      value={cpf} 
                      onChangeText={setCpf} 
                      placeholder="000.000.000-00" 
                      hint="Sujeito a fricção e validação de WhatsApp OTP obrigatória." 
                    />
                  </View>
                )}

                <AppInput label="Nome comercial" testID="request-establishment-name-input" icon={<Building2 color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Ex.: Navalha Studio" />
                <AppInput label="Endereço digital" testID="request-establishment-slug-input" icon={<Link2 color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="navalha-studio" hint={cleanSlug ? `cutsync.com/${cleanSlug}` : 'Use letras, números e hífens.'} />
                <AppInput label="Endereço físico" testID="request-establishment-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro e cidade" />
                <AppInput label="Telefone comercial" testID="request-establishment-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
                
                {onboardingType === 'CPF' && (
                  <View style={styles.whatsappVerificationContainer}>
                    <AppInput 
                      containerStyle={{ flex: 1 }}
                      label="WhatsApp para validação OTP" 
                      value={whatsapp} 
                      onChangeText={(val) => { setWhatsapp(val); setWhatsappVerified(false); }} 
                      placeholder="(11) 99999-9999" 
                      editable={!whatsappVerified}
                    />
                    <AppButton 
                      label={whatsappVerified ? "Validado" : "Validar"} 
                      onPress={sendOtpMessage} 
                      loading={sendingOtp} 
                      disabled={whatsappVerified}
                      variant={whatsappVerified ? "success" : "secondary"}
                      style={styles.verificationButton}
                    />
                  </View>
                )}

                <AppInput label="Cor principal" testID="request-establishment-color-input" value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" placeholder="#F5A524" />
              </View>

              {/* Checkboxes LGPD */}
              <View style={styles.lgpdSection}>
                <Pressable onPress={() => setLgpdTermsAccepted(!lgpdTermsAccepted)} style={styles.checkboxRow}>
                  {lgpdTermsAccepted ? <CheckSquare size={18} color={colors.success} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.lgpdText}>Aceito os Termos de Uso e Política de Privacidade do CutSync (Obrigatório)</Text>
                </Pressable>

                <Pressable onPress={() => setLgpdMarketingAccepted(!lgpdMarketingAccepted)} style={styles.checkboxRow}>
                  {lgpdMarketingAccepted ? <CheckSquare size={18} color={colors.success} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.lgpdText}>Aceito receber novidades e comunicações promocionais (Opcional)</Text>
                </Pressable>
              </View>

              {request?.status === 'rejected' && <InlineNotice testID="request-establishment-rejected-notice" tone="danger" title="Solicitação anterior rejeitada" message={request.rejection_reason || 'Revise os dados e envie novamente.'} />}
              <AppButton label="Cadastrar e Ativar" testID="request-establishment-submit-button" onPress={submitRequest} loading={submitting} fullWidth />
            </AppCard>

            <AppCard testID="request-establishment-security-card" style={styles.securityCard}>
              <ShieldCheck color={colors.success} size={24} />
              <Text style={styles.securityCardTitle}>Como funciona o GSP?</Text>
              <Text style={styles.securityCardText}>
                No **Nível 1 (WhatsApp)**, liberamos o uso da agenda local (balcão). 
                Para colocar a URL no ar no marketplace, passamos ao **Nível 2 (Confirmação de e-mail)**.
                Por fim, transações e saques via gateway exigem o **Nível 3 (KYC / Documento)**.
              </Text>
            </AppCard>
          </View>
        )}
      </ScrollView>

      {/* Modal para verificação WhatsApp OTP */}
      <Modal visible={otpModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <AppCard style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Validação OTP WhatsApp</Text>
              <Pressable onPress={() => setOtpModalVisible(false)}><X size={18} color={colors.text} /></Pressable>
            </View>
            <Text style={styles.modalDesc}>Enviamos um código de verificação para o número {whatsapp}.</Text>
            <AppInput 
              label="Código OTP de 6 dígitos" 
              value={otpInput} 
              onChangeText={setOtpInput} 
              placeholder="Digite o código" 
              keyboardType="number-pad" 
            />
            {!!otpError && <Text style={styles.otpError}>{otpError}</Text>}
            <AppButton label="Confirmar Código" onPress={confirmOtpCode} fullWidth />
          </AppCard>
        </View>
      </Modal>
    </ClientShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 34, paddingBottom: 120, gap: 24 },
  workspace: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20 },
  formCard: { flex: 1, minWidth: 300, maxWidth: 720, padding: 24, gap: 20 },
  securityCard: { width: '100%', maxWidth: 360, gap: 14, padding: 24 },
  cardEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.8 },
  cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 24, marginTop: 4, marginBottom: 12 },
  tabSelector: { flexDirection: 'row', backgroundColor: colors.canvas, borderRadius: radii.md, padding: 4, marginBottom: 8 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radii.sm },
  tabButtonActive: { backgroundColor: colors.surface },
  tabLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  tabLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  fields: { gap: 16 },
  cpfRow: { flexDirection: 'row', gap: 10 },
  whatsappVerificationContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  verificationButton: { minHeight: 48, justifyContent: 'center' },
  lgpdSection: { gap: 12, marginTop: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, borderBottomWidth: 1, borderBottomColor: colors.border },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lgpdText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, lineHeight: 16 },
  securityCardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20 },
  securityCardText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  statusCard: { maxWidth: 620, padding: 30 },
  statusIcon: { width: 52, height: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft },
  statusEyebrow: { color: colors.warning, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 24 },
  statusTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, marginTop: 8 },
  statusDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  securityText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 400, padding: 24, gap: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  modalDesc: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  otpError: { color: colors.danger, fontFamily: typography.bodyStrong, fontSize: 11 },
});