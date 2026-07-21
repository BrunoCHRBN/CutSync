import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, ChevronRight, KeyRound, LogOut, Mail, Phone, ShieldCheck, UserRound, CheckSquare, Square } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { initialsOf } from '../../theme/color';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { isValidClientName, isValidClientPhone, normalizeClientName, normalizeClientPhone } from '../../utils/client-profile';
import { tapLight, tapSuccess } from '../../utils/haptics';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';

interface SettingsLinkProps {
  title: string;
  description: string;
  testID: string;
  icon: ReactNode;
  onPress: () => void;
  tone?: 'default' | 'danger';
}

const SettingsLink = ({ title, description, testID, icon, onPress, tone = 'default' }: SettingsLinkProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={title}
    testID={testID}
    onPress={() => {
      tapLight();
      onPress();
    }}
    style={({ pressed }) => [styles.settingsLink, pressed && styles.pressed]}
  >
    <View style={[styles.linkIcon, tone === 'danger' && styles.linkIconDanger]}>{icon}</View>
    <View style={styles.linkCopy}>
      <Text style={[styles.linkTitle, tone === 'danger' && styles.linkTitleDanger]}>{title}</Text>
      <Text style={styles.linkDescription}>{description}</Text>
    </View>
    <ChevronRight color={tone === 'danger' ? colors.danger : colors.textMuted} size={18} strokeWidth={1.8} />
  </Pressable>
);

export const ClientSettingsExperience = () => {
  const router = useRouter();
  const { profile, refreshProfile, signOut } = useAuth();
  
  // Profile Fields
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  // Notification Preference Fields
  const [notificationChannels, setNotificationChannels] = useState<string[]>(profile?.notification_channels ?? ['push', 'whatsapp']);
  const [savingNotifications, setSavingNotifications] = useState(false);

  useEffect(() => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
    if (profile?.notification_channels) {
      setNotificationChannels(profile.notification_channels);
    }
  }, [profile?.name, profile?.phone, profile?.notification_channels]);

  const formatPhoneWithDdi = (val: string) => {
    if (val.length < 3) return '';
    const clean = val.replace(/<[^>]*>/g, '').replace(/\D/g, ''); // Strips XML/HTML tags and non-digits
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

  const normalizedName = normalizeClientName(name);
  const normalizedPhone = normalizeClientPhone(phone);
  const invalidName = normalizedName.length > 0 && !isValidClientName(normalizedName);
  const invalidPhone = !isValidClientPhone(normalizedPhone);
  const changed = normalizedName !== (profile?.name ?? '').trim() || normalizedPhone !== (profile?.phone ?? '').trim();
  const initials = useMemo(() => initialsOf(normalizedName || profile?.email || 'Cliente'), [normalizedName, profile?.email]);

  const saveProfile = async () => {
    setNotice(null);
    if (!profile?.id) {
      setNotice({ tone: 'danger', message: 'Não foi possível identificar sua conta. Entre novamente.' });
      return;
    }
    if (!isValidClientName(normalizedName)) {
      setNotice({ tone: 'danger', message: 'Informe um nome com pelo menos 2 caracteres.' });
      return;
    }
    if (invalidPhone) {
      setNotice({ tone: 'danger', message: 'Informe um telefone válido com DDD.' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: normalizedName, phone: normalizedPhone || null })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      tapSuccess();
      setNotice({ tone: 'success', message: 'Seus dados foram atualizados.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar seus dados agora. Tente novamente.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleNotificationChannel = (channel: string) => {
    if (notificationChannels.includes(channel)) {
      setNotificationChannels(notificationChannels.filter(c => c !== channel));
    } else {
      setNotificationChannels([...notificationChannels, channel]);
    }
  };

  const saveNotifications = async () => {
    if (!profile?.id) return;
    setSavingNotifications(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('profiles')
        .update({ notification_channels: notificationChannels })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      tapSuccess();
      setNotice({ tone: 'success', message: 'Preferências de notificações salvas com sucesso!' });
    } catch {
      setNotice({ tone: 'danger', message: 'Falha ao salvar preferências de notificações.' });
    } finally {
      setSavingNotifications(false);
    }
  };

  return (
    <ClientShell
      testID="client-settings-screen"
      activeRoute="settings"
      userName={profile?.name}
      onSignOut={signOut}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <SectionHeading
          testID="client-settings-heading"
          eyebrow="Sua conta"
          title="Configurações"
          description="Atualize seus dados pessoais, canais de lembrete e preferências em um só lugar."
        />

        <AppCard testID="client-settings-profile-summary" style={styles.profileSummary}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.profileCopy}>
            <Text testID="client-settings-profile-name" selectable style={styles.profileName}>{profile?.name || 'Cliente'}</Text>
            <Text testID="client-settings-profile-email" selectable style={styles.profileEmail}>{profile?.email || 'E-mail não disponível'}</Text>
          </View>
          <View style={styles.protectedBadge}><ShieldCheck color={colors.success} size={14} /><Text style={styles.protectedText}>Conta protegida</Text></View>
        </AppCard>

        {!!notice && <InlineNotice testID="client-settings-notice" tone={notice.tone} message={notice.message} />}

        <View style={styles.columns}>
          <View style={styles.formCardColumn}>
            <AppCard testID="client-settings-personal-data" style={styles.formCard}>
              <View>
                <Text style={styles.cardTitle}>Seus dados</Text>
                <Text style={styles.cardDescription}>Essas informações identificam você nos seus agendamentos.</Text>
              </View>
              <AppInput
                label="Nome"
                testID="client-settings-name-input"
                icon={<UserRound color={colors.textMuted} size={17} strokeWidth={1.8} />}
                value={name}
                onChangeText={setName}
                placeholder="Como devemos chamar você?"
                autoComplete="name"
                error={invalidName ? 'Use pelo menos 2 caracteres.' : undefined}
              />
              <AppInput
                label="Telefone"
                testID="client-settings-phone-input"
                icon={<Phone color={colors.textMuted} size={17} strokeWidth={1.8} />}
                value={phone}
                onChangeText={(val) => setPhone(formatPhoneWithDdi(val))}
                placeholder="+55 (11) 99999-9999"
                autoComplete="tel"
                keyboardType="phone-pad"
                error={invalidPhone ? 'Informe um telefone válido com DDD.' : undefined}
                hint="Restringe letras/emojis. Usado para comunicações de agendamento."
              />
              <View style={styles.readonlyField}>
                <Mail color={colors.textMuted} size={17} strokeWidth={1.8} />
                <View style={styles.readonlyCopy}>
                  <Text style={styles.readonlyLabel}>E-mail de acesso</Text>
                  <Text testID="client-settings-email-value" selectable numberOfLines={1} style={styles.readonlyValue}>{profile?.email || 'Não disponível'}</Text>
                </View>
                <Text style={styles.readonlyBadge}>Somente leitura</Text>
              </View>
              <AppButton
                label="Salvar alterações"
                testID="client-settings-save-button"
                onPress={() => { void saveProfile(); }}
                loading={saving}
                disabled={!changed || invalidName || invalidPhone || normalizedName.length < 2}
                fullWidth
              />
            </AppCard>

            <AppCard testID="client-settings-notification-channels" style={[styles.formCard, { marginTop: 18 }]}>
              <View>
                <Text style={styles.cardTitle}>Canais de Notificação</Text>
                <Text style={styles.cardDescription}>Escolha como deseja ser lembrado dos seus horários agendados.</Text>
              </View>
              
              <View style={styles.checkboxList}>
                <Pressable onPress={() => toggleNotificationChannel('push')} style={styles.checkboxRow}>
                  {notificationChannels.includes('push') ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>Notificações no App (Push)</Text>
                </Pressable>

                <Pressable onPress={() => toggleNotificationChannel('whatsapp')} style={styles.checkboxRow}>
                  {notificationChannels.includes('whatsapp') ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>WhatsApp (Lembretes automáticos)</Text>
                </Pressable>

                <Pressable onPress={() => toggleNotificationChannel('email')} style={styles.checkboxRow}>
                  {notificationChannels.includes('email') ? <CheckSquare size={18} color={colors.brand} /> : <Square size={18} color={colors.textMuted} />}
                  <Text style={styles.checkboxLabel}>E-mail (Lembretes e novidades)</Text>
                </Pressable>
              </View>

              <AppButton
                label="Salvar canais de notificação"
                onPress={saveNotifications}
                loading={savingNotifications}
                fullWidth
              />
            </AppCard>
          </View>

          <View style={styles.actionsColumn}>
            <AppCard testID="client-settings-account-card" style={styles.linksCard}>
              <View>
                <Text style={styles.cardTitle}>Conta e acesso</Text>
                <Text style={styles.cardDescription}>Segurança e preferências vinculadas ao seu login.</Text>
              </View>
              <View style={styles.linksList}>
                <SettingsLink
                  testID="client-settings-security-link"
                  title="Alterar senha"
                  description="Confirme sua identidade e defina uma nova senha."
                  icon={<KeyRound color={colors.info} size={19} strokeWidth={1.8} />}
                  onPress={() => router.push('/security' as never)}
                />
                <SettingsLink
                  testID="client-settings-business-link"
                  title="Quero usar o CutSync no meu negócio"
                  description="Solicite o cadastro do seu estabelecimento."
                  icon={<Building2 color={colors.brand} size={19} strokeWidth={1.8} />}
                  onPress={() => router.push('/(client)/request-establishment' as never)}
                />
              </View>
            </AppCard>

            <AppCard testID="client-settings-session-card" style={styles.linksCard}>
              <Text style={styles.cardTitle}>Sessão</Text>
              <SettingsLink
                testID="client-settings-sign-out-link"
                title="Sair da conta"
                description="Encerra com segurança a sessão neste dispositivo."
                icon={<LogOut color={colors.danger} size={19} strokeWidth={1.8} />}
                onPress={() => { void signOut(); }}
                tone="danger"
              />
            </AppCard>
          </View>
        </View>
      </ScrollView>
    </ClientShell>
  );
};

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', gap: 18, padding: 20, paddingTop: 34, paddingBottom: 120 },
  profileSummary: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 },
  avatar: { width: 54, height: 54, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSecondarySoft, borderWidth: hairlineW, borderColor: colors.brandSecondary },
  avatarText: { color: colors.brandPrimary, fontFamily: typography.display, fontSize: 18 },
  profileCopy: { flex: 1, minWidth: 180 },
  profileName: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.4 },
  profileEmail: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 4 },
  protectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, backgroundColor: colors.successSoft, paddingHorizontal: 11, paddingVertical: 7 },
  protectedText: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 11 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 18, width: '100%' },
  formCardColumn: { flex: 1.15, minWidth: 300 },
  formCard: { gap: 18, padding: 24 },
  actionsColumn: { flex: 0.85, minWidth: 300, gap: 18 },
  linksCard: { gap: 16 },
  cardTitle: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  cardDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 5 },
  readonlyField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, paddingHorizontal: 14, backgroundColor: colors.canvasSoft },
  readonlyCopy: { flex: 1, minWidth: 0 },
  readonlyLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  readonlyValue: { color: colors.text, fontFamily: typography.body, fontSize: 13, marginTop: 3 },
  readonlyBadge: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11 },
  linksList: { borderTopWidth: hairlineW, borderTopColor: colors.hairline },
  settingsLink: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: hairlineW, borderBottomColor: colors.hairline, paddingVertical: 12 },
  linkIcon: { width: 42, height: 42, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvasSoft },
  linkIconDanger: { backgroundColor: colors.dangerSoft },
  linkCopy: { flex: 1 },
  linkTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  linkTitleDanger: { color: colors.danger },
  linkDescription: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.68, transform: [{ scale: 0.99 }] },
  // Checkbox Layout
  checkboxList: { gap: 14, marginVertical: 8 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  checkboxLabel: { color: colors.text, fontFamily: typography.body, fontSize: 13 },
});
