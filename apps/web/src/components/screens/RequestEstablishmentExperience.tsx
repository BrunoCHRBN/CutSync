import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isValidCnpj, isValidCpf } from '@cutsync/validation';
import { Building2, Clock3, Link2, MapPin, Phone, ShieldCheck, CheckSquare, Square, Scissors } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { TotpSecuritySetup } from '../security/TotpSecuritySetup';
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
  
  // Wizard Steps: 1 = Identificação, 2 = Localização, 3 = Primeiro Serviço, 4 = Escala Comercial
  const [wizardStep, setWizardStep] = useState(1);
  const [createdEstablishmentId, setCreatedEstablishmentId] = useState<string | null>(null);

  // Onboarding Type State
  const [onboardingType, setOnboardingType] = useState<'CNPJ' | 'CPF'>('CNPJ');
  
  // Step 1: Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cpf, setCpf] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  
  // LGPD Consents
  const [lgpdTermsAccepted, setLgpdTermsAccepted] = useState(false);
  const [lgpdMarketingAccepted, setLgpdMarketingAccepted] = useState(false);
  
  const [hasAal2, setHasAal2] = useState(false);

  // Step 2: Location
  const [address, setAddress] = useState('');

  // Step 3: First Service
  const [serviceName, setServiceName] = useState('Corte de Cabelo Masculino');
  const [servicePrice, setServicePrice] = useState('50,00');
  const [serviceDuration, setServiceDuration] = useState('30');
  const [serviceLoading, setServiceLoading] = useState(false);

  // Step 4: Schedule
  const [openingHour, setOpeningHour] = useState('09:00');
  const [closingHour, setClosingHour] = useState('20:00');
  const [openDays, setOpenDays] = useState<boolean[]>([true, true, true, true, true, true, false]); // Mon to Sun
  const [scheduleLoading, setScheduleLoading] = useState(false);
  
  // App States
  const [request, setRequest] = useState<ExistingRequest | null>(null);
  const [, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  
  const cleanSlug = useMemo(() => slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, ''), [slug]);

  const formatCpf = (val: string) => {
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Rejects HTML/XML tags and non-digits
    if (clean.length <= 3) return clean;
    if (clean.length <= 6) return `${clean.slice(0, 3)}.${clean.slice(3)}`;
    if (clean.length <= 9) return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6)}`;
    return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9, 11)}`;
  };

  const formatCnpj = (val: string) => {
    const clean = val.replace(/<[^>]*>/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
    if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
    return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
  };

  const formatPhoneWithDdi = (val: string) => {
    if (val.length < 3) return '';
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Rejects HTML/XML tags and non-digits
    if (clean.length === 0) return '';
    
    let digits = clean;
    if (clean.length > 0 && !clean.startsWith('55')) {
      if (clean === '5') {
        digits = '55';
      } else {
        digits = '55' + clean;
      }
    }
    
    if (digits.length <= 2) return '+55';
    if (digits.length <= 4) return `+55 (${digits.slice(2)}`;
    if (digits.length <= 8) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4)}`;
    if (digits.length <= 12) return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9, 13)}`;
  };

  const loadRequest = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('establishment_requests')
      .select('id,name,slug,status,rejection_reason,created_at')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setRequest(data as ExistingRequest | null);
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setHasAal2(assurance.data?.currentLevel === 'aal2');
    setLoading(false);
  }, []);

  useEffect(() => { void loadRequest(); }, [loadRequest]);

  // Step 1 Submit: Create Establishment & Promo Owner
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
    if (!hasAal2) {
      setNotice({ tone: 'danger', message: 'Confirme o autenticador TOTP antes de cadastrar ou adicionar uma unidade.' });
      return;
    }

    setSubmitting(true);
    const document = onboardingType === 'CPF' ? cpf : cnpj;
    if (onboardingType === 'CPF' ? !isValidCpf(document) : !isValidCnpj(document)) {
      setNotice({ tone: 'danger', message: `${onboardingType} inválido.` });
      setSubmitting(false);
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('submit-business-registration', {
        body: {
          documentType: onboardingType,
          document,
          name: name.trim(),
          slug: cleanSlug,
          address: '',
          phone,
          primaryColor,
        },
      });
      if (error || data?.error) {
        const code = data?.error ?? error?.message;
        const message = code?.includes('slug_unavailable')
          ? 'O endereço digital solicitado já está em uso.'
          : code?.includes('aal2_required')
          ? 'Confirme novamente o autenticador TOTP.'
          : code?.includes('invalid_phone')
          ? 'Informe um telefone brasileiro válido com DDD ou deixe o campo vazio.'
          : 'Não foi possível validar esses dados. O cadastro poderá exigir análise.';
        throw new Error(message);
      }
      if (data?.status === 'under_review') {
        setNotice({ tone: 'success', message: 'Recebemos o cadastro e ele seguirá para análise, sem expor dados de terceiros.' });
        await loadRequest();
        return;
      }
      const { error: consentError } = await supabase.rpc('accept_my_lgpd_terms', {
        target_marketing_accepted: lgpdMarketingAccepted,
      });
      if (consentError) throw consentError;
      setCreatedEstablishmentId(data?.establishmentId ?? null);
      setWizardStep(2);
      setNotice({
        tone: 'success',
        message: data?.status === 'unit_added'
          ? 'Nova unidade vinculada ao seu grupo. Agora complete a localização.'
          : 'Cadastro inicial concluído. Agora complete a localização.',
      });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao processar o cadastro.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2 Submit: Save Physical Address
  const submitLocation = async () => {
    if (!address.trim()) {
      setNotice({ tone: 'danger', message: 'Informe o endereço físico completo para continuar.' });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('establishments')
        .update({ address: address.trim() })
        .eq('id', createdEstablishmentId || '');
      if (error) throw error;
      setWizardStep(3);
      setNotice({ tone: 'success', message: 'Endereço salvo com sucesso! Cadastre seu primeiro serviço.' });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar endereço físico.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3 Submit: Save First Service
  const submitService = async () => {
    if (!serviceName.trim() || !servicePrice.trim() || !serviceDuration.trim()) {
      setNotice({ tone: 'danger', message: 'Preencha todos os campos do serviço.' });
      return;
    }
    const cleanPrice = parseFloat(servicePrice.replace(',', '.').replace(/[^\d.]/g, ''));
    const cleanDuration = parseInt(serviceDuration.replace(/\D/g, ''), 10);
    if (isNaN(cleanPrice) || cleanPrice <= 0) {
      setNotice({ tone: 'danger', message: 'Preço inválido.' });
      return;
    }
    if (isNaN(cleanDuration) || cleanDuration <= 0) {
      setNotice({ tone: 'danger', message: 'Duração inválida.' });
      return;
    }

    setServiceLoading(true);
    try {
      if (!createdEstablishmentId) throw new Error('Estabelecimento ainda não foi criado.');
      const { error } = await supabase.from('services').insert({
        establishment_id: createdEstablishmentId,
        name: serviceName.trim(),
        price: cleanPrice,
        duration_minutes: cleanDuration,
        is_active: true,
      });
      if (error) throw error;
      setWizardStep(4);
      setNotice({ tone: 'success', message: 'Serviço adicionado! Por fim, defina seu horário de atendimento.' });
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar serviço.' });
    } finally {
      setServiceLoading(false);
    }
  };

  // Step 4 Submit: Save Operating Hours and Work shifts
  const submitSchedule = async () => {
    setScheduleLoading(true);
    if (!createdEstablishmentId || !profile?.id) {
      setScheduleLoading(false);
      setNotice({ tone: 'danger', message: 'Não foi possível identificar o estabelecimento ou o perfil.' });
      return;
    }
    const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const scheduleArray = dayNames.map((dayName, index) => {
      const isOpen = index === 0 ? openDays[6] : openDays[index - 1];
      return {
        day: index,
        name: dayName,
        isOpen,
        open: openingHour,
        close: closingHour
      };
    });

    try {
      const { error: estError } = await supabase.rpc('finalize_establishment_onboarding' as never, {
        target_establishment_id: createdEstablishmentId,
        opening_hours: JSON.stringify(scheduleArray),
      } as never);

      if (estError) throw estError;

      const shiftsToInsert = scheduleArray
        .filter(day => day.isOpen)
        .map(day => ({
          profile_id: profile.id,
          day_of_week: day.day,
          start_time: `${openingHour}:00`,
          end_time: `${closingHour}:00`,
          is_active: true
        }));

      if (shiftsToInsert.length > 0) {
        const { error: shiftError } = await supabase.from('work_shifts')
          .insert(shiftsToInsert);
        if (shiftError) console.warn('Erro ao inserir turnos de trabalho:', shiftError);
      }

      setNotice({ tone: 'success', message: 'Cadastro finalizado com sucesso! Bem-vindo ao CutSync.' });
      await refreshProfile();
      await loadRequest();
    } catch (err: any) {
      setNotice({ tone: 'danger', message: err.message || 'Falha ao salvar escala do estabelecimento.' });
    } finally {
      setScheduleLoading(false);
    }
  };

  const toggleOpenDay = (idx: number) => {
    const updated = [...openDays];
    updated[idx] = !updated[idx];
    setOpenDays(updated);
  };

  const statusLabel = request?.status === 'pending' ? 'Em análise' : request?.status === 'approved' ? 'Aprovada' : 'Rejeitada';

  const renderStepIndicator = () => (
    <View style={styles.indicatorContainer}>
      {[1, 2, 3, 4].map((s) => (
        <View key={s} style={styles.indicatorWrapper}>
          <View style={[styles.indicatorCircle, wizardStep >= s && styles.indicatorCircleActive]}>
            <Text style={[styles.indicatorNumber, wizardStep >= s && styles.indicatorNumberActive]}>{s}</Text>
          </View>
          <Text style={[styles.indicatorLabel, wizardStep === s && styles.indicatorLabelActive]}>
            {s === 1 ? 'Identificação' : s === 2 ? 'Localização' : s === 3 ? 'Serviço' : 'Escala'}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <ClientShell testID="request-establishment-screen" activeRoute="settings" userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading 
          testID="request-establishment-heading" 
          eyebrow="Onboarding Remodelado" 
          title="Ative seu negócio no CutSync" 
          description="Siga os 4 passos rápidos para configurar e abrir sua barbearia para agendamentos online." 
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
              
              {renderStepIndicator()}

              {wizardStep === 1 && (
                <View style={styles.fields}>
                  <Text style={styles.cardTitle}>Passo 1: Identificação Comercial</Text>
                  
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

                  {onboardingType === 'CNPJ' ? (
                    <AppInput 
                      label="CNPJ do Estabelecimento" 
                      testID="request-establishment-cnpj-input" 
                      value={cnpj} 
                      onChangeText={(val) => setCnpj(formatCnpj(val))} 
                      placeholder="00.000.000/0000-00" 
                      hint="Rejeita emojis/letras. Aprovado de forma atômica se ativo." 
                    />
                  ) : (
                    <AppInput 
                      label="CPF do Profissional" 
                      testID="request-establishment-cpf-input" 
                      value={cpf} 
                      onChangeText={(val) => setCpf(formatCpf(val))} 
                      placeholder="000.000.000-00" 
                      hint="Documento privado do titular; não será exibido publicamente."
                    />
                  )}

                  <AppInput label="Nome comercial" testID="request-establishment-name-input" icon={<Building2 color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Ex.: Navalha Studio" />
                  <AppInput label="Endereço digital" testID="request-establishment-slug-input" icon={<Link2 color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="navalha-studio" hint={cleanSlug ? `cutsync.com/${cleanSlug}` : 'Use letras, números e hífens.'} />
                  <AppInput label="Telefone comercial" testID="request-establishment-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={(val) => setPhone(formatPhoneWithDdi(val))} keyboardType="phone-pad" placeholder="+55 (11) 99999-9999" />
                  
                  <Text style={styles.securityText}>Telefone é somente contato comercial, pode ser compartilhado e não funciona como login.</Text>
                  {!hasAal2 && <TotpSecuritySetup onVerified={() => setHasAal2(true)} />}

                  <AppInput label="Cor principal" testID="request-establishment-color-input" value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" placeholder="#F5A524" />

                  <View style={styles.lgpdSection}>
                    <Pressable onPress={() => setLgpdTermsAccepted(!lgpdTermsAccepted)} style={styles.checkboxRow}>
                      {lgpdTermsAccepted ? <CheckSquare size={18} color={colors.success} /> : <Square size={18} color={colors.textMuted} />}
                      <Text style={styles.lgpdText}>Aceito os Termos de Uso e Política de Privacidade do CutSync (Obrigatório)</Text>
                    </Pressable>
                    <Pressable onPress={() => setLgpdMarketingAccepted(!lgpdMarketingAccepted)} style={styles.checkboxRow}>
                      {lgpdMarketingAccepted ? <CheckSquare size={18} color={colors.success} /> : <Square size={18} color={colors.textMuted} />}
                      <Text style={styles.lgpdText}>Aceito receber novidades promocionais (Opcional)</Text>
                    </Pressable>
                  </View>

                  <AppButton label="Salvar e Continuar" testID="request-establishment-submit-button" onPress={submitRequest} loading={submitting} fullWidth />
                </View>
              )}

              {wizardStep === 2 && (
                <View style={styles.fields}>
                  <Text style={styles.cardTitle}>Passo 2: Localização Física</Text>
                  <AppInput label="Endereço físico completo" testID="request-establishment-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro, cidade e CEP" hint="Essencial para clientes te encontrarem no marketplace." />
                  <AppButton label="Salvar e Ir para Serviços" testID="request-establishment-location-button" onPress={submitLocation} loading={submitting} fullWidth />
                </View>
              )}

              {wizardStep === 3 && (
                <View style={styles.fields}>
                  <Text style={styles.cardTitle}>Passo 3: Adicionar Primeiro Serviço</Text>
                  <AppInput label="Nome do serviço" testID="request-establishment-service-name" icon={<Scissors color={colors.textMuted} size={17} />} value={serviceName} onChangeText={setServiceName} placeholder="Ex: Corte de Cabelo Simples" />
                  <AppInput label="Preço (R$)" testID="request-establishment-service-price" value={servicePrice} onChangeText={(val) => setServicePrice(val.replace(/[^\d,]/g, ''))} placeholder="50,00" keyboardType="numeric" hint="Somente números e vírgula." />
                  <AppInput label="Duração (minutos)" testID="request-establishment-service-duration" icon={<Clock3 color={colors.textMuted} size={17} />} value={serviceDuration} onChangeText={(val) => setServiceDuration(val.replace(/\D/g, ''))} placeholder="30" keyboardType="numeric" hint="Tempo estimado do atendimento." />
                  <AppButton label="Salvar e Ir para Agenda" testID="request-establishment-service-button" onPress={submitService} loading={serviceLoading} fullWidth />
                </View>
              )}

              {wizardStep === 4 && (
                <View style={styles.fields}>
                  <Text style={styles.cardTitle}>Passo 4: Horário Geral de Expediente</Text>
                  
                  <View style={styles.timeInputsRow}>
                    <AppInput containerStyle={{ flex: 1 }} label="Abertura" testID="request-establishment-opening-time" icon={<Clock3 color={colors.textMuted} size={17} />} value={openingHour} onChangeText={setOpeningHour} placeholder="09:00" />
                    <AppInput containerStyle={{ flex: 1 }} label="Fechamento" testID="request-establishment-closing-time" icon={<Clock3 color={colors.textMuted} size={17} />} value={closingHour} onChangeText={setClosingHour} placeholder="20:00" />
                  </View>

                  <Text style={styles.daysHeading}>Dias de funcionamento:</Text>
                  <View style={styles.daysContainer}>
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day, idx) => (
                      <Pressable key={day} onPress={() => toggleOpenDay(idx)} style={[styles.dayChip, openDays[idx] && styles.dayChipActive]}>
                        <Text style={[styles.dayChipText, openDays[idx] && styles.dayChipTextActive]}>{day}</Text>
                      </Pressable>
                    ))}
                  </View>

                  <AppButton label="Ativar Barbearia e Concluir" testID="request-establishment-schedule-button" onPress={submitSchedule} loading={scheduleLoading} fullWidth />
                </View>
              )}

            </AppCard>

            <AppCard testID="request-establishment-security-card" style={styles.securityCard}>
              <ShieldCheck color={colors.success} size={24} />
              <Text style={styles.securityCardTitle}>Identidade protegida</Text>
              <Text style={styles.securityCardText}>
                CPF e CNPJ são cifrados no servidor e exibidos somente de forma mascarada.
                O autenticador TOTP protege o cadastro, novas unidades e demais ações críticas.
              </Text>
            </AppCard>
          </View>
        )}
      </ScrollView>

    </ClientShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 34, paddingBottom: 120, gap: 24 },
  workspace: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20, width: '100%' },
  formCard: { flex: 1, minWidth: 300, maxWidth: 720, padding: 24, gap: 20 },
  securityCard: { width: '100%', maxWidth: 360, gap: 14, padding: 24 },
  cardEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.8 },
  cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20, marginTop: 4, marginBottom: 12 },
  tabSelector: { flexDirection: 'row', backgroundColor: colors.canvas, borderRadius: radii.md, padding: 4, marginBottom: 8 },
  tabButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radii.sm },
  tabButtonActive: { backgroundColor: colors.surface },
  tabLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  tabLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  fields: { gap: 16 },
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
  // Wizard Indicators
  indicatorContainer: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 16, marginBottom: 12 },
  indicatorWrapper: { alignItems: 'center', flex: 1 },
  indicatorCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  indicatorCircleActive: { backgroundColor: colors.brand },
  indicatorNumber: { fontSize: 12, color: colors.textSecondary, fontFamily: typography.bodyStrong },
  indicatorNumberActive: { color: colors.surface },
  indicatorLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: typography.body },
  indicatorLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  // Step elements
  timeInputsRow: { flexDirection: 'row', gap: 16 },
  daysHeading: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: 8 },
  daysContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  dayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipText: { fontSize: 12, color: colors.textSecondary, fontFamily: typography.body },
  dayChipTextActive: { color: colors.surface, fontFamily: typography.bodyStrong },
});
