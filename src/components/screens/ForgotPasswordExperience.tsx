import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, Mail, MailCheck, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';
import { getPasswordRecoveryRedirectUrl } from '../../services/passwordRecovery';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { BrandMark } from '../ui/BrandMark';
import { InlineNotice } from '../ui/InlineNotice';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const ForgotPasswordExperience = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const requestRecovery = async () => {
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError('Informe um e-mail válido para continuar.');
      return;
    }

    setLoading(true);
    try {
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: getPasswordRecoveryRedirectUrl(),
      });
      if (requestError) throw requestError;
      setSent(true);
    } catch {
      setError('Não foi possível enviar o link agora. Aguarde um instante e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground testID="forgot-password-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <BrandMark testID="forgot-password-brand" />
            <Pressable testID="forgot-password-back-link" accessibilityRole="link" onPress={() => router.replace('/(auth)/login')} style={styles.backLink}>
              <ArrowLeft color={colors.textSecondary} size={16} />
              <Text style={styles.backText}>Voltar para entrar</Text>
            </Pressable>

            <View style={styles.intro}>
              <Text testID="forgot-password-eyebrow" style={styles.eyebrow}>RECUPERAÇÃO SEGURA</Text>
              <Text testID="forgot-password-title" style={styles.title}>Vamos recuperar seu acesso.</Text>
              <Text testID="forgot-password-description" style={styles.description}>Informe o e-mail da conta. Enviaremos um link único que abre diretamente o CutSync.</Text>
            </View>

            <AppCard testID="forgot-password-card" style={styles.card} elevated>
              {sent ? (
                <View testID="forgot-password-sent-state" style={styles.sentState}>
                  <View style={styles.sentIcon}><MailCheck color={colors.success} size={28} /></View>
                  <Text testID="forgot-password-sent-title" style={styles.sentTitle}>Confira seu e-mail</Text>
                  <Text testID="forgot-password-sent-description" style={styles.sentDescription}>Se houver uma conta para este endereço, o link chegará em alguns instantes. Ele expira e só pode ser usado uma vez.</Text>
                  <AppButton label="Voltar para entrar" testID="forgot-password-sent-login-button" onPress={() => router.replace('/(auth)/login')} fullWidth />
                  <AppButton label="Enviar novamente" testID="forgot-password-resend-button" onPress={() => setSent(false)} variant="ghost" fullWidth />
                </View>
              ) : (
                <>
                  <AppInput label="E-mail da conta" testID="forgot-password-email-input" icon={<Mail color={colors.textMuted} size={18} />} value={email} onChangeText={setEmail} placeholder="voce@exemplo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" onSubmitEditing={requestRecovery} returnKeyType="send" />
                  {!!error && <InlineNotice testID="forgot-password-error-message" tone="danger" message={error} />}
                  <AppButton label="Enviar link de recuperação" testID="forgot-password-submit-button" onPress={requestRecovery} loading={loading} fullWidth />
                </>
              )}
            </AppCard>

            <View testID="forgot-password-security-note" style={styles.securityNote}><ShieldCheck color={colors.success} size={15} /><Text style={styles.securityText}>Por segurança, nunca confirmamos se um e-mail está cadastrado.</Text></View>
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
  backLink: { marginTop: 34, flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 8 },
  backText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  intro: { marginTop: 34, marginBottom: 24 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 37, lineHeight: 42, letterSpacing: -1.6, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  card: { gap: 18, padding: 24 },
  sentState: { alignItems: 'center', gap: 14 },
  sentIcon: { width: 58, height: 58, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSoft },
  sentTitle: { color: colors.text, fontFamily: typography.display, fontSize: 22 },
  sentDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 19, textAlign: 'center', marginBottom: 6 },
  securityNote: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  securityText: { flexShrink: 1, color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
});
