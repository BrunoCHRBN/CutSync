import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Building2, Clock3, Link2, MapPin, Phone, ShieldCheck } from 'lucide-react-native';
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
  const { profile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#F5A524');
  const [request, setRequest] = useState<ExistingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const cleanSlug = useMemo(() => slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, ''), [slug]);

  const loadRequest = async () => {
    setLoading(true);
    const { data } = await supabase.from('establishment_requests')
      .select('id,name,slug,status,rejection_reason,created_at')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setRequest(data as ExistingRequest | null);
    setLoading(false);
  };

  useEffect(() => { void loadRequest(); }, []);

  const submitRequest = async () => {
    setNotice(null);
    if (!name.trim() || cleanSlug.length < 3 || !/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
      setNotice({ tone: 'danger', message: 'Informe nome, endereço digital válido e uma cor hexadecimal.' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc('request_establishment', {
      requested_name: name.trim(), requested_slug: cleanSlug,
      requested_address: address.trim() || null, requested_phone: phone.trim() || null,
      requested_primary_color: primaryColor,
    });
    if (error) {
      const message = error.message.includes('pending_request_exists') ? 'Você já possui uma solicitação aguardando análise.'
        : error.message.includes('slug_unavailable') ? 'Este endereço digital já está em uso.'
        : 'Não foi possível enviar a solicitação.';
      setNotice({ tone: 'danger', message });
    } else {
      setNotice({ tone: 'success', message: 'Solicitação enviada para análise do CutSync.' });
      await loadRequest();
    }
    setSubmitting(false);
  };

  const statusLabel = request?.status === 'pending' ? 'Em análise' : request?.status === 'approved' ? 'Aprovada' : 'Rejeitada';

  return (
    <ClientShell testID="request-establishment-screen" activeRoute="request" userName={profile?.name} isSyncing={loading} syncError={null} onSync={loadRequest} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading testID="request-establishment-heading" eyebrow="Nova operação" title="Solicite seu estabelecimento" description="Sua conta continua como cliente até a análise. Se aprovada, você receberá um convite de administrador válido por 24 horas." />

        {!!notice && <InlineNotice testID="request-establishment-notice" tone={notice.tone} message={notice.message} />}

        {request?.status === 'pending' ? (
          <AppCard testID="request-establishment-pending-card" style={styles.statusCard} elevated>
            <View style={styles.statusIcon}><Clock3 color={colors.warning} size={24} /></View>
            <Text testID="request-establishment-status" style={styles.statusEyebrow}>{statusLabel}</Text>
            <Text testID="request-establishment-pending-name" style={styles.statusTitle}>{request.name}</Text>
            <Text style={styles.statusDescription}>A equipe CutSync está verificando os dados. Nenhum acesso administrativo foi liberado ainda.</Text>
            <View style={styles.securityRow}><ShieldCheck color={colors.success} size={16} /><Text style={styles.securityText}>Sua conta permanece protegida como cliente.</Text></View>
          </AppCard>
        ) : (
          <View style={styles.workspace}>
            <AppCard testID="request-establishment-form-card" style={styles.formCard} elevated>
              <Text style={styles.cardEyebrow}>DADOS DA OPERAÇÃO</Text>
              <Text style={styles.cardTitle}>Conte sobre o negócio</Text>
              <View style={styles.fields}>
                <AppInput label="Nome comercial" testID="request-establishment-name-input" icon={<Building2 color={colors.textMuted} size={17} />} value={name} onChangeText={setName} placeholder="Ex.: Navalha Studio" />
                <AppInput label="Endereço digital" testID="request-establishment-slug-input" icon={<Link2 color={colors.textMuted} size={17} />} value={slug} onChangeText={setSlug} autoCapitalize="none" placeholder="navalha-studio" hint={cleanSlug ? `cutsync.com/${cleanSlug}` : 'Use letras, números e hífens.'} />
                <AppInput label="Endereço" testID="request-establishment-address-input" icon={<MapPin color={colors.textMuted} size={17} />} value={address} onChangeText={setAddress} placeholder="Rua, número, bairro e cidade" />
                <AppInput label="Telefone" testID="request-establishment-phone-input" icon={<Phone color={colors.textMuted} size={17} />} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="(11) 99999-9999" />
                <AppInput label="Cor principal" testID="request-establishment-color-input" value={primaryColor} onChangeText={setPrimaryColor} autoCapitalize="characters" placeholder="#F5A524" />
              </View>
              {request?.status === 'rejected' && <InlineNotice testID="request-establishment-rejected-notice" tone="danger" title="Solicitação anterior rejeitada" message={request.rejection_reason || 'Revise os dados e envie novamente.'} />}
              <AppButton label="Enviar para análise" testID="request-establishment-submit-button" onPress={submitRequest} loading={submitting} fullWidth />
            </AppCard>

            <AppCard testID="request-establishment-security-card" style={styles.securityCard}>
              <ShieldCheck color={colors.success} size={24} />
              <Text style={styles.securityCardTitle}>Aprovação em duas etapas</Text>
              <Text style={styles.securityCardText}>O superadministrador valida a solicitação e gera um convite para o mesmo e-mail da sua conta. O link funciona uma única vez.</Text>
            </AppCard>
          </View>
        )}
      </ScrollView>
    </ClientShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingTop: 34, paddingBottom: 120, gap: 24 },
  workspace: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 20 },
  formCard: { flex: 1, minWidth: 300, maxWidth: 720, padding: 24 },
  securityCard: { width: '100%', maxWidth: 360, gap: 14, padding: 24 },
  cardEyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.8 },
  cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 24, marginTop: 8, marginBottom: 22 },
  fields: { gap: 16 },
  securityCardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20 },
  securityCardText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
  statusCard: { maxWidth: 620, padding: 30 },
  statusIcon: { width: 52, height: 52, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.warningSoft },
  statusEyebrow: { color: colors.warning, fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 24 },
  statusTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, marginTop: 8 },
  statusDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  securityRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  securityText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
});