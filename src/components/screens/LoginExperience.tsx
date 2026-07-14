import React, { useState } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { BrandMark } from '../ui/BrandMark';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, layout, radii, typography } from '../../theme/tokens';

const heroImage = 'https://images.unsplash.com/photo-1759134198561-e2041049419c?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBiYXJiZXJzaG9wJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzgzOTkxNzE1fDA&ixlib=rb-4.1.0&q=85';

export const LoginExperience = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 920;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMagicLink, setIsMagicLink] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const handleLogin = async () => {
    setError('');
    if (!email.trim()) {
      setError('Informe seu e-mail para continuar.');
      return;
    }

    if (!isMagicLink && !password) {
      setError('Informe sua senha para continuar.');
      return;
    }

    setLoading(true);
    try {
      if (isMagicLink) {
        const redirectUrl = Platform.OS === 'web' ? window.location.origin : 'cutsync://(client)';
        const { error: magicError } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: {
            emailRedirectTo: redirectUrl,
          }
        });
        if (magicError) throw magicError;
        setMagicLinkSent(true);
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (loginError) setError('Não foi possível entrar. Confira seus dados e tente novamente.');
      }
    } catch (err: any) {
      setError(err.message || 'A conexão falhou. Tente novamente em instantes.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenBackground testID="login-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.shell, isWide && styles.shellWide]}>
            <View style={[styles.formPane, isWide && styles.formPaneWide]}>
              <BrandMark testID="login-brand" />

              <View style={styles.intro}>
                <Text testID="login-eyebrow" style={styles.eyebrow}>SUA OPERAÇÃO, NO RITMO CERTO</Text>
                <Text testID="login-title" style={styles.title}>Bem-vindo de volta.</Text>
                <Text testID="login-description" style={styles.description}>
                  Entre para acompanhar sua agenda, equipe e resultados em um só lugar.
                </Text>
              </View>

              <AppCard testID="login-form-card" style={styles.formCard} elevated>
                {magicLinkSent ? (
                  <View style={{ gap: 12, alignItems: 'center', paddingVertical: 12 }}>
                    <Text style={{ fontSize: 16, color: colors.success, fontWeight: 'bold' }}>📬 E-mail Enviado!</Text>
                    <Text style={{ color: colors.text, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                      Enviamos um link de login rápido para **{email}**. Abra o link em seu dispositivo para acessar sua conta!
                    </Text>
                    <AppButton
                      label="Voltar para Login"
                      onPress={() => {
                        setMagicLinkSent(false);
                        setIsMagicLink(false);
                      }}
                      fullWidth
                    />
                  </View>
                ) : (
                  <>
                    <View style={styles.fields}>
                      <AppInput
                        label="E-mail"
                        testID="login-email-input"
                        icon={<Mail color={colors.textMuted} size={18} />}
                        placeholder="voce@exemplo.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        returnKeyType="next"
                      />

                      {!isMagicLink && (
                        <View>
                          <AppInput
                            label="Senha"
                            testID="login-password-input"
                            icon={<LockKeyhole color={colors.textMuted} size={18} />}
                            placeholder="Digite sua senha"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoComplete="password"
                            onSubmitEditing={handleLogin}
                            returnKeyType="done"
                          />
                          <Pressable
                            testID="login-password-visibility-button"
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                            onPress={() => setShowPassword((current) => !current)}
                            style={({ pressed }) => [styles.eyeButton, pressed && styles.eyeButtonPressed]}
                          >
                            {showPassword
                              ? <EyeOff color={colors.textSecondary} size={18} />
                              : <Eye color={colors.textSecondary} size={18} />}
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {!!error && (
                      <View testID="login-error-message" style={styles.errorBox}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}

                    <AppButton
                      label={isMagicLink ? "Enviar Link de Acesso" : "Entrar no CutSync"}
                      testID="login-submit-button"
                      onPress={handleLogin}
                      loading={loading}
                      fullWidth
                    />

                    <View style={{ gap: 10, marginTop: 4 }}>
                      <Pressable
                        onPress={() => {
                          setError('');
                          setIsMagicLink(prev => !prev);
                        }}
                        style={{ paddingVertical: 8 }}
                      >
                        <Text style={{ color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12, textAlign: 'center' }}>
                          {isMagicLink ? "Entrar com E-mail e Senha" : "Entrar sem senha (Link rápido por E-mail)"}
                        </Text>
                      </Pressable>

                      <Pressable
                        testID="login-register-link"
                        accessibilityRole="link"
                        onPress={() => router.push('/(auth)/register')}
                        style={({ pressed }) => [styles.registerLink, pressed && styles.linkPressed]}
                      >
                        <Text style={styles.registerText}>Ainda não usa o CutSync? </Text>
                        <Text style={styles.registerAccent}>Criar conta</Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </AppCard>

              <View testID="login-security-note" style={styles.securityNote}>
                <ShieldCheck color={colors.success} size={16} />
                <Text style={styles.securityText}>Acesso protegido e dados disponíveis mesmo offline.</Text>
              </View>
            </View>

            {isWide && (
              <ImageBackground
                testID="login-hero-image"
                source={{ uri: heroImage }}
                resizeMode="cover"
                imageStyle={styles.heroImage}
                style={styles.hero}
              >
                <View style={styles.heroOverlay} />
                <View style={styles.heroTopline}>
                  <Sparkles color={colors.brand} size={16} />
                  <Text style={styles.heroToplineText}>GESTÃO FEITA PARA BARBEARIAS</Text>
                </View>
                <View style={styles.heroCopy}>
                  <Text testID="login-hero-stat" style={styles.heroStat}>Menos ruído.{`\n`}Mais cadeira ocupada.</Text>
                  <Text testID="login-hero-description" style={styles.heroDescription}>
                    Agenda, equipe e caixa sincronizados para você focar na experiência do cliente.
                  </Text>
                </View>
              </ImageBackground>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 18 },
  shell: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  shellWide: {
    minHeight: 690,
    flexDirection: 'row',
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  formPane: { width: '100%', padding: 10 },
  formPaneWide: { width: '48%', padding: 46, justifyContent: 'center' },
  intro: { marginTop: 48, marginBottom: 28 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 38, letterSpacing: -1.7, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, maxWidth: 410, marginTop: 10 },
  formCard: { gap: 20, padding: 22 },
  fields: { gap: 18 },
  eyeButton: { position: 'absolute', right: 12, bottom: 15, padding: 4 },
  eyeButtonPressed: { opacity: 0.5 },
  errorBox: { backgroundColor: colors.dangerSoft, borderLeftWidth: 2, borderLeftColor: colors.danger, padding: 12, borderRadius: radii.sm },
  errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  registerLink: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 4 },
  registerText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  registerAccent: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12 },
  linkPressed: { opacity: 0.55 },
  securityNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, justifyContent: 'center' },
  securityText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10 },
  hero: { flex: 1, minHeight: 690, justifyContent: 'space-between', padding: 38 },
  heroImage: { borderTopRightRadius: radii.xl, borderBottomRightRadius: radii.xl },
  heroOverlay: { position: 'absolute', inset: 0, backgroundColor: '#05050576' } as any,
  heroTopline: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 1 },
  heroToplineText: { color: colors.white, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.8 },
  heroCopy: { zIndex: 1, maxWidth: 470 },
  heroStat: { color: colors.white, fontFamily: typography.display, fontSize: 44, lineHeight: 49, letterSpacing: -2 },
  heroDescription: { color: '#E4E4E7', fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 16, maxWidth: 390 },
});