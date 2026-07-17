import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { BrandMark } from '../ui/BrandMark';
import { InlineNotice } from '../ui/InlineNotice';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthChecklist } from '../ui/PasswordStrengthChecklist';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const ChangePasswordExperience = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  const changePassword = async () => {
    setNotice(null);
    if (!user?.email) {
      setNotice({ tone: 'danger', message: 'Sua sessão não possui um e-mail válido. Entre novamente.' });
      return;
    }
    if (!currentPassword) {
      setNotice({ tone: 'danger', message: 'Informe sua senha atual para confirmar sua identidade.' });
      return;
    }
    if (!isStrongPassword(newPassword)) {
      setNotice({ tone: 'danger', message: passwordPolicyMessage });
      return;
    }
    if (newPassword !== confirmation) {
      setNotice({ tone: 'danger', message: 'As novas senhas não coincidem.' });
      return;
    }
    if (newPassword === currentPassword) {
      setNotice({ tone: 'danger', message: 'A nova senha precisa ser diferente da senha atual.' });
      return;
    }

    setLoading(true);
    try {
      const { error: verificationError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (verificationError) {
        setNotice({ tone: 'danger', message: 'A senha atual não confere.' });
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await supabase.auth.signOut({ scope: 'others' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setNotice({ tone: 'success', message: 'Senha alterada com sucesso. Seu acesso continua protegido.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível alterar a senha agora. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground testID="change-password-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <View style={styles.topbar}>
              <BrandMark compact testID="change-password-brand" />
              <Pressable testID="change-password-back-button" accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <ArrowLeft color={colors.textSecondary} size={17} />
                <Text style={styles.backText}>Voltar</Text>
              </Pressable>
            </View>
            <View style={styles.intro}>
              <Text testID="change-password-eyebrow" style={styles.eyebrow}>SEGURANÇA DA CONTA</Text>
              <Text testID="change-password-title" style={styles.title}>Alterar senha</Text>
              <Text testID="change-password-description" style={styles.description}>Confirme sua senha atual e escolha uma nova credencial que você não utiliza em outros serviços.</Text>
            </View>

            <AppCard testID="change-password-card" style={styles.card} elevated>
              <View testID="change-password-identity-note" style={styles.identityNote}><KeyRound color={colors.info} size={18} /><View style={styles.identityCopy}><Text style={styles.identityTitle}>Confirmação de identidade</Text><Text style={styles.identityText}>Validamos sua senha atual antes de permitir a mudança.</Text></View></View>
              <PasswordInput label="Senha atual" testID="change-password-current-input" value={currentPassword} onChangeText={setCurrentPassword} placeholder="Digite sua senha atual" autoComplete="current-password" />
              <PasswordInput label="Nova senha" testID="change-password-new-input" value={newPassword} onChangeText={setNewPassword} placeholder="Digite uma nova senha" autoComplete="new-password" />
              <PasswordStrengthChecklist password={newPassword} testID="change-password-strength-checklist" />
              <PasswordInput label="Confirmar nova senha" testID="change-password-confirm-input" value={confirmation} onChangeText={setConfirmation} placeholder="Repita a nova senha" autoComplete="new-password" onSubmitEditing={changePassword} returnKeyType="done" />
              {!!notice && <InlineNotice testID="change-password-notice" tone={notice.tone} message={notice.message} />}
              <AppButton label="Atualizar minha senha" testID="change-password-submit-button" onPress={changePassword} loading={loading} disabled={!currentPassword || !isStrongPassword(newPassword) || newPassword !== confirmation} fullWidth />
            </AppCard>
            <View testID="change-password-security-note" style={styles.securityNote}><ShieldCheck color={colors.success} size={15} /><Text style={styles.securityText}>Nunca compartilhe sua senha com profissionais ou administradores do estabelecimento.</Text></View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingVertical: 36 },
  shell: { width: '100%', maxWidth: layout.formMax, alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  backText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  intro: { marginTop: 42, marginBottom: 24 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 37, lineHeight: 42, letterSpacing: -1.6, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  card: { gap: 18, padding: 24 },
  identityNote: { flexDirection: 'row', gap: 11, backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: `${colors.info}33`, borderRadius: radii.md, padding: 14 },
  identityCopy: { flex: 1 },
  identityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  identityText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 },
  securityNote: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  securityText: { flexShrink: 1, color: colors.textMuted, fontFamily: typography.body, fontSize: 10 },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
});