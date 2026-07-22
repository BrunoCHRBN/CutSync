import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking as NativeLinking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { KeyRound, ShieldCheck } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';
import { consumePasswordRecoveryUrl, isPasswordRecoveryUrl } from '../../services/passwordRecovery';
import { isStrongPassword, passwordPolicyMessage } from '@cutsync/validation';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { BrandMark } from '../ui/BrandMark';
import { InlineNotice } from '../ui/InlineNotice';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthChecklist } from '../ui/PasswordStrengthChecklist';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

type RecoveryState = 'checking' | 'ready' | 'invalid';

export const ResetPasswordExperience = () => {
  const router = useRouter();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const handleUrl = async (url: string | null) => {
      if (!url || !isPasswordRecoveryUrl(url)) {
        if (active) setRecoveryState('invalid');
        return;
      }

      try {
        await consumePasswordRecoveryUrl(url);
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState({}, '', '/reset-password');
        if (active) setRecoveryState('ready');
      } catch {
        if (active) setRecoveryState('invalid');
      }
    };

    const initialUrl = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;
    void (initialUrl ? handleUrl(initialUrl) : Linking.getInitialURL().then(handleUrl));
    const subscription = NativeLinking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    const { data: authSubscription } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === 'PASSWORD_RECOVERY') setRecoveryState('ready');
    });

    return () => {
      active = false;
      subscription.remove();
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async () => {
    setError('');
    if (!isStrongPassword(password)) {
      setError(passwordPolicyMessage);
      return;
    }
    if (password !== confirmation) {
      setError('As senhas não coincidem. Digite a mesma senha nos dois campos.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      router.replace({ pathname: '/(auth)/login', params: { passwordReset: 'success' } } as never);
    } catch {
      setError('O link expirou ou não pôde ser usado. Solicite uma nova recuperação.');
      setRecoveryState('invalid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground testID="reset-password-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.shell}>
            <BrandMark testID="reset-password-brand" />
            <View style={styles.intro}>
              <Text testID="reset-password-eyebrow" style={styles.eyebrow}>NOVA CREDENCIAL</Text>
              <Text testID="reset-password-title" style={styles.title}>Crie uma senha forte.</Text>
              <Text testID="reset-password-description" style={styles.description}>A nova senha passa a valer imediatamente em todos os acessos do CutSync.</Text>
            </View>

            <AppCard testID="reset-password-card" style={styles.card} elevated>
              {recoveryState === 'checking' ? (
                <View testID="reset-password-checking-state" style={styles.centerState}><ActivityIndicator color={colors.brand} /><Text style={styles.stateText}>Validando seu link seguro…</Text></View>
              ) : recoveryState === 'invalid' ? (
                <View testID="reset-password-invalid-state" style={styles.centerState}>
                  <View style={styles.invalidIcon}><KeyRound color={colors.danger} size={26} /></View>
                  <Text testID="reset-password-invalid-title" style={styles.stateTitle}>Link inválido ou expirado</Text>
                  <Text testID="reset-password-invalid-description" style={styles.stateText}>Solicite um novo link. Por segurança, links usados ou antigos deixam de funcionar.</Text>
                  <AppButton label="Solicitar novo link" testID="reset-password-new-link-button" onPress={() => router.replace('/(auth)/forgot-password')} fullWidth />
                  <AppButton label="Voltar para entrar" testID="reset-password-login-button" onPress={() => router.replace('/(auth)/login')} variant="ghost" fullWidth />
                </View>
              ) : (
                <>
                  <PasswordInput label="Nova senha" testID="reset-password-new-input" value={password} onChangeText={setPassword} placeholder="Digite sua nova senha" autoComplete="new-password" />
                  <PasswordStrengthChecklist password={password} testID="reset-password-strength-checklist" />
                  <PasswordInput label="Confirmar nova senha" testID="reset-password-confirm-input" value={confirmation} onChangeText={setConfirmation} placeholder="Repita a nova senha" autoComplete="new-password" onSubmitEditing={updatePassword} returnKeyType="done" />
                  {!!error && <InlineNotice testID="reset-password-error-message" tone="danger" message={error} />}
                  <AppButton label="Salvar nova senha" testID="reset-password-submit-button" onPress={updatePassword} loading={loading} disabled={!isStrongPassword(password) || password !== confirmation} fullWidth />
                </>
              )}
            </AppCard>
            <View testID="reset-password-security-note" style={styles.securityNote}><ShieldCheck color={colors.success} size={15} /><Text style={styles.securityText}>O CutSync nunca envia ou solicita sua senha por e-mail.</Text></View>
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
  intro: { marginTop: 42, marginBottom: 24 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 37, lineHeight: 42, letterSpacing: -1.6, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 12 },
  card: { gap: 18, padding: 24 },
  centerState: { alignItems: 'center', gap: 14, paddingVertical: 10 },
  invalidIcon: { width: 56, height: 56, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.dangerSoft },
  stateTitle: { color: colors.text, fontFamily: typography.display, fontSize: 21 },
  stateText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  securityNote: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  securityText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
});
