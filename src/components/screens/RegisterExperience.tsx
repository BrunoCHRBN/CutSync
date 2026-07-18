import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, Phone, ShieldCheck, UserRound, UsersRound, Link2 } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { BrandMark } from '../ui/BrandMark';
import { InlineNotice } from '../ui/InlineNotice';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthChecklist } from '../ui/PasswordStrengthChecklist';
import { ScreenBackground } from '../ui/ScreenBackground';
<<<<<<< HEAD
import { colors, radii, typography } from '../../theme/tokens';
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';
=======
import { colors, layout, radii, typography } from '../../theme/tokens';
import { getErrorMessage } from '../../utils/errors';
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9

export const RegisterExperience = () => {
  const router = useRouter();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');
    if (!name.trim() || !email.trim()) {
      setError('Informe nome e e-mail para continuar.');
      return;
    }
    if (!isStrongPassword(password)) {
      setError(passwordPolicyMessage);
      return;
    }
    if (password !== passwordConfirmation) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: name.trim(), phone: phone.trim() } },
      });
      if (signUpError) throw new Error(signUpError.message.includes('registered') ? 'Este e-mail já possui uma conta.' : 'Não foi possível concluir o cadastro.');
      if (data.session && redirect?.startsWith('/')) router.replace(redirect as never);
      else router.replace({ pathname: '/(auth)/login', params: redirect ? { redirect } : undefined } as never);
    } catch (registerError: unknown) {
      setError(getErrorMessage(registerError, 'Não foi possível concluir o cadastro.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground testID="register-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={[styles.introPane, isWide && styles.introPaneWide]}>
              <BrandMark testID="register-brand" />
              <View style={styles.introCopy}>
                <Text testID="register-eyebrow" style={styles.eyebrow}>COMECE DO SEU JEITO</Text>
                <Text testID="register-title" style={styles.title}>Uma conta.{`\n`}Acesso protegido.</Text>
                <Text testID="register-description" style={styles.description}>Toda conta começa como cliente. Acessos de equipe só chegam por convite verificado.</Text>
              </View>
              {isWide && (
                <View testID="register-benefits" style={styles.benefits}>
                  <Benefit icon={<UsersRound color={colors.brand} size={18} />} title="Feito para a operação real" text="Cliente, profissional e gestor conectados no mesmo fluxo." />
                  <Benefit icon={<Link2 color={colors.info} size={18} />} title="Conexão por convite" text="Gestores e profissionais recebem um link único, válido por 24 horas." />
                </View>
              )}
            </View>

            <AppCard testID="register-form-card" style={[styles.formCard, isWide && styles.formCardWide]} elevated>
              <Text style={styles.formTitle}>Criar sua conta</Text>
              <Text style={styles.formSubtitle}>Cadastre seu acesso pessoal. Permissões administrativas nunca são escolhidas aqui.</Text>

              <View testID="register-security-notice" style={styles.securityNotice}>
                <ShieldCheck color={colors.success} size={18} />
                <View style={styles.securityCopy}>
                  <Text style={styles.securityTitle}>Conta cliente por padrão</Text>
                  <Text style={styles.securityDescription}>Convites de equipe validam e-mail, estabelecimento, função e prazo antes de liberar acesso.</Text>
                </View>
              </View>

              <View style={styles.fields}>
                <AppInput label="Nome completo" testID="register-name-input" icon={<UserRound color={colors.textMuted} size={17} />} placeholder="Como podemos chamar você?" value={name} onChangeText={setName} autoComplete="name" />
                <View style={styles.fieldsRow}>
                  <AppInput containerStyle={styles.halfField} label="E-mail" testID="register-email-input" icon={<Mail color={colors.textMuted} size={17} />} placeholder="voce@exemplo.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                  <AppInput containerStyle={styles.halfField} label="Telefone" testID="register-phone-input" icon={<Phone color={colors.textMuted} size={17} />} placeholder="(11) 99999-9999" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
                </View>
                <PasswordInput label="Senha" testID="register-password-input" placeholder="Crie uma senha forte" value={password} onChangeText={setPassword} autoComplete="new-password" />
                <PasswordStrengthChecklist password={password} testID="register-password-strength-checklist" />
                <PasswordInput label="Confirmar senha" testID="register-password-confirm-input" placeholder="Repita sua senha" value={passwordConfirmation} onChangeText={setPasswordConfirmation} autoComplete="new-password" onSubmitEditing={handleRegister} returnKeyType="done" />
              </View>

              {!!error && <InlineNotice testID="register-error-message" tone="danger" message={error} />}

              <AppButton label="Criar conta" testID="register-submit-button" onPress={handleRegister} loading={loading} disabled={!isStrongPassword(password) || password !== passwordConfirmation} fullWidth />
              <Pressable testID="register-login-link" accessibilityRole="link" onPress={() => router.push({ pathname: '/(auth)/login', params: redirect ? { redirect } : undefined } as never)} style={({ pressed }) => [styles.loginLink, pressed && styles.pressed]}>
                <Text style={styles.loginText}>Já possui uma conta? <Text style={styles.loginAccent}>Entrar</Text></Text>
              </Pressable>
            </AppCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const Benefit = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => (
  <View style={styles.benefit}><View style={styles.benefitIcon}>{icon}</View><View style={styles.benefitCopy}><Text style={styles.benefitTitle}>{title}</Text><Text style={styles.benefitText}>{text}</Text></View></View>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 18, paddingVertical: 32 },
  shell: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 28 },
  shellWide: { flexDirection: 'row', alignItems: 'flex-start' },
  introPane: { padding: 10 },
  introPaneWide: { width: '36%', padding: 34, paddingTop: 24, position: 'sticky', top: 20 } as any,
  introCopy: { marginTop: 54 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 39, lineHeight: 44, letterSpacing: -1.9, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 21, marginTop: 12, maxWidth: 350 },
  benefits: { gap: 16, marginTop: 48 },
  benefit: { flexDirection: 'row', gap: 12 },
  benefitIcon: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  benefitCopy: { flex: 1 },
  benefitTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  benefitText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 },
  formCard: { gap: 20, padding: 22 },
  formCardWide: { flex: 1, padding: 30 },
  formTitle: { color: colors.text, fontFamily: typography.display, fontSize: 23, letterSpacing: -0.7 },
  formSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: -14 },
  securityNotice: { flexDirection: 'row', gap: 12, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: `${colors.success}33`, borderRadius: radii.md, padding: 14 },
  securityCopy: { flex: 1 },
  securityTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  securityDescription: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
  fields: { gap: 16 },
  fieldsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  halfField: { flex: 1, minWidth: 210 },
  loginLink: { alignItems: 'center', paddingVertical: 4 },
  loginText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  loginAccent: { color: colors.brand, fontFamily: typography.bodyStrong },
  pressed: { opacity: 0.65, transform: [{ scale: 0.99 }] },
});