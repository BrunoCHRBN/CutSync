import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Building2, Camera, ChevronRight, KeyRound, LogOut, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { initialsOf } from '../../theme/color';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { clientTheme } from '../../theme/client-tokens';
import { isValidClientName, isValidClientPhone, normalizeClientName, normalizeClientPhone } from '@cutsync/validation';
import { tapLight, tapSuccess } from '../../utils/haptics';
import { ClientShell } from '../layout/ClientShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { ClientSwitch } from '../ui/ClientSwitch';

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
  const [notificationChannels, setNotificationChannels] = useState<string[]>((profile as any)?.notification_channels ?? ['push', 'whatsapp']);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const profileNotificationChannels = (profile as any)?.notification_channels as string[] | undefined;

  useEffect(() => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
    if (profileNotificationChannels) {
      setNotificationChannels(profileNotificationChannels);
    }
  }, [profile, profileNotificationChannels]);

  const formatPhoneWithDdi = (val: string) => {
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

  const saveNotifications = async (nextChannels: string[]) => {
    if (!profile?.id) return;
    setNotificationChannels(nextChannels);
    setSavingNotifications(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('profiles')
        .update({ notification_channels: nextChannels })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      tapSuccess();
      setNotice({ tone: 'success', message: 'Preferência salva.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Falha ao salvar preferências de notificações.' });
    } finally {
      setSavingNotifications(false);
    }
  };

  const toggleNotificationChannel = (channel: string, enabled: boolean) => {
    const next = enabled
      ? Array.from(new Set([...notificationChannels, channel]))
      : notificationChannels.filter((item) => item !== channel);
    void saveNotifications(next);
  };

  const discardProfileChanges = () => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
    setNotice(null);
  };

  const pickAvatar = () => {
    if (typeof document === 'undefined' || !profile?.id) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async (event: any) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setNotice({ tone: 'danger', message: 'Escolha uma imagem de até 5 MB.' });
        return;
      }
      setUploadingAvatar(true);
      setNotice(null);
      try {
        const extension = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `clients/${profile.id}/avatar.${extension}`;
        const { error: uploadError } = await supabase.storage.from('client-avatars').upload(path, file, { upsert: true, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('client-avatars').getPublicUrl(path);
        const { error: updateError } = await supabase.rpc('update_my_client_avatar', { target_avatar_url: data.publicUrl });
        if (updateError) throw updateError;
        await refreshProfile();
        setNotice({ tone: 'success', message: 'Foto do perfil atualizada.' });
      } catch {
        setNotice({ tone: 'danger', message: 'Não foi possível atualizar sua foto.' });
      } finally {
        setUploadingAvatar(false);
      }
    };
    input.click();
  };

  const removeAvatar = async () => {
    if (!profile?.id || !profile.avatar_url) return;
    setUploadingAvatar(true);
    setNotice(null);
    try {
      const { error } = await supabase.rpc('update_my_client_avatar', { target_avatar_url: '' });
      if (error) throw error;
      await refreshProfile();
      setNotice({ tone: 'success', message: 'Foto do perfil removida.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível remover sua foto.' });
    } finally {
      setUploadingAvatar(false);
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
          <Pressable testID="client-settings-avatar-button" accessibilityRole="button" accessibilityLabel="Alterar foto do perfil" disabled={uploadingAvatar} onPress={pickAvatar} style={styles.avatar}>
            {profile?.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials}</Text>}
            <View style={styles.avatarAction}><Camera color={colors.white} size={12} /></View>
          </Pressable>
          <View style={styles.profileCopy}>
            <Text testID="client-settings-profile-name" selectable style={styles.profileName}>{profile?.name || 'Cliente'}</Text>
            <Text testID="client-settings-profile-email" selectable style={styles.profileEmail}>{profile?.email || 'E-mail não disponível'}</Text>
          </View>
          {profile?.avatar_url ? <AppButton testID="client-settings-avatar-remove" label="Remover foto" variant="ghost" size="sm" disabled={uploadingAvatar} onPress={() => { void removeAvatar(); }} /> : null}
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
              <View style={styles.profileActions}>
                <AppButton label="Descartar" testID="client-settings-discard-button" onPress={discardProfileChanges} disabled={!changed || saving} variant="ghost" />
                <AppButton label="Salvar alterações" testID="client-settings-save-button" onPress={() => { void saveProfile(); }} loading={saving} disabled={!changed || invalidName || invalidPhone || normalizedName.length < 2} />
              </View>
            </AppCard>

            <AppCard testID="client-settings-notification-channels" style={[styles.formCard, { marginTop: 18 }]}>
              <View>
                <Text style={styles.cardTitle}>Canais de Notificação</Text>
                <Text style={styles.cardDescription}>Escolha como deseja ser lembrado dos seus horários agendados.</Text>
              </View>
              
              <View style={styles.checkboxList}>
                <ClientSwitch testID="client-settings-channel-push" label="Notificações no App" description="Lembretes push neste dispositivo." value={notificationChannels.includes('push')} disabled={savingNotifications} onValueChange={(value) => toggleNotificationChannel('push', value)} />
                <ClientSwitch testID="client-settings-channel-whatsapp" label="WhatsApp" description="Lembretes automáticos do estabelecimento." value={notificationChannels.includes('whatsapp')} disabled={savingNotifications} onValueChange={(value) => toggleNotificationChannel('whatsapp', value)} />
                <ClientSwitch testID="client-settings-channel-email" label="E-mail" description="Lembretes e novidades autorizadas." value={notificationChannels.includes('email')} disabled={savingNotifications} onValueChange={(value) => toggleNotificationChannel('email', value)} />
              </View>
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
              </View>
            </AppCard>

            <AppCard testID="client-settings-business-card" style={[styles.linksCard, styles.businessCard]}>
              <Text style={styles.businessEyebrow}>CutSync para negócios</Text>
              <SettingsLink testID="client-settings-business-link" title="Quero usar o CutSync no meu negócio" description="Solicite o cadastro do seu estabelecimento." icon={<Building2 color={colors.brand} size={19} strokeWidth={1.8} />} onPress={() => router.push('/(client)/request-establishment' as never)} />
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
  avatarImage: { width: '100%', height: '100%', borderRadius: radii.lg },
  avatarAction: { position: 'absolute', right: -5, bottom: -5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: clientTheme.accent, borderWidth: 2, borderColor: colors.surface },
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
  businessCard: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandSecondary },
  businessEyebrow: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
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
  profileActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 },
});
