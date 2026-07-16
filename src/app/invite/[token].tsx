import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Building2, Clock3, Mail, ShieldCheck, UserCheck } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { BrandMark } from '../../components/ui/BrandMark';
import { InlineNotice } from '../../components/ui/InlineNotice';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
import { colors, radii, typography } from '../../theme/tokens';

interface InviteDetails {
  establishment_name: string;
  invited_email: string;
  invited_role: 'admin' | 'professional';
  invitation_status: string;
  expiration: string;
}

export default function InviteAcceptancePage() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !token) { setLoading(false); return; }
    void (async () => {
      setLoading(true);
      const { data, error: inspectError } = await supabase.rpc('inspect_invitation', { invitation_token: token });
      if (inspectError || !data?.[0]) setError('Este convite não existe, não pertence ao seu e-mail ou já não está disponível.');
      else setDetails(data[0] as InviteDetails);
      setLoading(false);
    })();
  }, [user, token]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setError('');
    const { data, error: acceptError } = await supabase.rpc('accept_invitation', { invitation_token: token });
    if (acceptError || !data?.[0]) {
      const message = acceptError?.message.includes('expired') ? 'Este convite expirou. Solicite um novo link.'
        : acceptError?.message.includes('email_mismatch') ? 'Entre usando exatamente o e-mail que recebeu o convite.'
        : 'Não foi possível aceitar este convite.';
      setError(message);
      setAccepting(false);
      return;
    }
    await refreshProfile();
    router.replace(data[0].accepted_role === 'admin' ? '/(admin)' : '/(professional)');
  };

  const redirectPath = `/invite/${token}`;
  const roleLabel = details?.invited_role === 'admin' ? 'Administrador' : 'Profissional';

  return (
    <ScreenBackground testID="invite-acceptance-screen">
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.shell}>
          <BrandMark testID="invite-acceptance-brand" />
          <AppCard testID="invite-acceptance-card" style={styles.card} elevated>
            <View testID="invite-acceptance-security-mark" style={styles.securityMark}><ShieldCheck color={colors.success} size={22} /></View>
            <Text testID="invite-acceptance-eyebrow" style={styles.eyebrow}>CONVITE PROTEGIDO</Text>
            <Text testID="invite-acceptance-title" style={styles.title}>{user ? 'Confirme seu acesso.' : 'Entre para verificar.'}</Text>
            <Text testID="invite-acceptance-description" style={styles.description}>O link é pessoal, funciona uma única vez e expira 24 horas após a emissão.</Text>

            {loading ? <ActivityIndicator testID="invite-acceptance-loading" color={colors.brand} style={styles.loader} /> : !user ? (
              <View style={styles.actions}>
                <InlineNotice testID="invite-login-required-notice" tone="warning" message="Entre ou crie uma conta usando o mesmo e-mail que recebeu o convite." />
                <AppButton label="Entrar e continuar" testID="invite-login-button" onPress={() => router.push({ pathname: '/(auth)/login', params: { redirect: redirectPath } } as never)} fullWidth />
                <AppButton label="Criar conta cliente" testID="invite-register-button" onPress={() => router.push({ pathname: '/(auth)/register', params: { redirect: redirectPath } } as never)} variant="secondary" fullWidth />
              </View>
            ) : details ? (
              <View style={styles.details}>
                <Detail testID="invite-establishment-row" icon={<Building2 color={colors.textSecondary} size={17} />} label="Estabelecimento" value={details.establishment_name} />
                <Detail testID="invite-email-row" icon={<Mail color={colors.textSecondary} size={17} />} label="E-mail autorizado" value={details.invited_email} />
                <Detail testID="invite-role-row" icon={<UserCheck color={colors.textSecondary} size={17} />} label="Função" value={roleLabel} />
                <Detail testID="invite-expiration-row" icon={<Clock3 color={colors.textSecondary} size={17} />} label="Expira em" value={new Date(details.expiration).toLocaleString('pt-BR')} />
                {!!error && <InlineNotice testID="invite-acceptance-error" tone="danger" message={error} />}
                <AppButton label={`Aceitar como ${roleLabel}`} testID="accept-invite-button" onPress={accept} loading={accepting} disabled={details.invitation_status !== 'pending'} fullWidth />
                <Text testID="invite-current-user" style={styles.currentUser}>Conectado como {profile?.email || user.email}</Text>
              </View>
            ) : <InlineNotice testID="invite-invalid-notice" tone="danger" message={error || 'Convite inválido.'} />}
          </AppCard>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

const Detail = ({ testID, icon, label, value }: { testID: string; icon: React.ReactNode; label: string; value: string }) => (
  <View testID={testID} style={styles.detailRow}>{icon}<View><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>
);

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingVertical: 40 },
  shell: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 28 },
  card: { padding: 28 },
  securityMark: { width: 48, height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSoft, borderWidth: 1, borderColor: `${colors.success}33` },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 2, marginTop: 24 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 30, lineHeight: 36, marginTop: 8 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  loader: { marginVertical: 36 },
  details: { gap: 14, marginTop: 26 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: 14 },
  detailLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  detailValue: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14, marginTop: 2 },
  actions: { gap: 12, marginTop: 26 },
  currentUser: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, textAlign: 'center' },
});