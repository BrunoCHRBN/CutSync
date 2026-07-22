import React, { useEffect, useState } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react-native';
import { supabase } from '../../services/supabase';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { BrandMark } from '../ui/BrandMark';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, radii, typography } from '../../theme/tokens';
import { getErrorMessage } from '../../utils/errors';
import { useAuth } from '../../contexts/AuthContext';

const heroImage = require('../../../assets/images/login-hero.jpg');

export const LoginExperience = () => {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ audience?: string | string[]; redirect?: string | string[] }>();
  const rawAudience = Array.isArray(params.audience) ? params.audience[0] : params.audience;
  const rawRedirect = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  const audience = rawAudience === 'client' ? 'client' : 'business';
  const safeRedirect = rawRedirect?.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : undefined;
  const isClient = audience === 'client';
  const { width } = useWindowDimensions();
  const isWide = width >= 940;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isMagicLink, setIsMagicLink] = useState(isClient);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  useEffect(() => {
    setIsMagicLink(isClient);
    setMagicLinkSent(false);
    setError('');
  }, [isClient]);

  useEffect(() => {
    if (user && safeRedirect) router.replace(safeRedirect as never);
  }, [router, safeRedirect, user]);

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
        let redirectUrl = 'cutsync://(client)';
        if (Platform.OS === 'web') {
          const callbackUrl = new URL('/login', window.location.origin);
          callbackUrl.searchParams.set('audience', audience);
          if (safeRedirect) callbackUrl.searchParams.set('redirect', safeRedirect);
          redirectUrl = callbackUrl.toString();
        }
        const { error: magicError } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(),
          options: {
            emailRedirectTo: redirectUrl,
          }
        });
        if (magicError) throw magicError;
        setMagicLinkSent(true);
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (loginError) setError('Não foi possível entrar. Confira seus dados e tente novamente.');
        else if (data.session && safeRedirect) router.replace(safeRedirect as never);
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'A conexão falhou. Tente novamente em instantes.'));
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
                <Text testID="login-eyebrow" style={styles.eyebrow}>
                  {isClient ? 'SEUS HORÁRIOS, SEM COMPLICAÇÃO' : 'SUA OPERAÇÃO, NO RITMO CERTO'}
                </Text>
                <Text testID="login-title" style={styles.title}>
                  {isClient ? 'Bem-vindo de volta.' : 'Acesse sua operação.'}
                </Text>
                <Text testID="login-description" style={styles.description}>
                  {isClient
                    ? 'Entre para agendar, acompanhar e gerenciar seus horários.'
                    : 'Gerencie agenda, clientes, equipe e resultados em um só lugar.'}
                </Text>
              </View>

              <View testID="login-form-card" style={styles.formCard}>
                {magicLinkSent ? (
                  <View style={{ gap: 12, alignItems: 'center', paddingVertical: 12 }}>
                    <Text style={{ fontSize: 16, color: colors.success, fontWeight: 'bold' }}>📬 E-mail Enviado!</Text>
                    <Text style={{ color: colors.text, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                      Enviamos um link de acesso para <Text style={styles.sentEmail}>{email}</Text>. Abra o e-mail para acessar sua conta.
                    </Text>
                    <AppButton
                      testID="login-back-from-magic-button"
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
                      label={isMagicLink ? 'Enviar link de acesso' : isClient ? 'Entrar como cliente' : 'Entrar na área de gestão'}
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
                          {isMagicLink ? 'Entrar com e-mail e senha' : 'Entrar sem senha por link de acesso'}
                        </Text>
                      </Pressable>

                      {!isClient && (
                        <Pressable
                          testID="login-forgot-password-link"
                          accessibilityRole="link"
                          onPress={() => router.push('/(auth)/forgot-password')}
                          style={({ pressed }) => [styles.textLink, pressed && styles.linkPressed]}
                        >
                          <Text style={styles.textLinkLabel}>Esqueci minha senha</Text>
                        </Pressable>
                      )}

                      <Pressable
                        testID="login-register-link"
                        accessibilityRole="link"
                        onPress={() => router.push({
                          pathname: '/(auth)/register',
                          params: isClient
                            ? { intent: 'client', ...(safeRedirect ? { redirect: safeRedirect } : {}) }
                            : { intent: 'establishment', redirect: safeRedirect ?? '/(client)/request-establishment' },
                        } as never)}
                        style={({ pressed }) => [styles.registerLink, pressed && styles.linkPressed]}
                      >
                        <Text style={styles.registerText}>{isClient ? 'Ainda não tem uma conta? ' : 'Quer usar o CutSync no seu negócio? '}</Text>
                        <Text style={styles.registerAccent}>{isClient ? 'Criar conta' : 'Cadastrar estabelecimento'}</Text>
                      </Pressable>

                      {!isClient && (
                        <Text testID="login-invite-note" style={styles.inviteNote}>
                          Colaboradores entram com a conta criada a partir do convite recebido.
                        </Text>
                      )}
                    </View>
                  </>
                )}
              </View>

              <View testID="login-security-note" style={styles.securityNote}>
                <ShieldCheck color={colors.success} size={16} />
                <Text style={styles.securityText}>Acesso protegido e dados sempre atualizados.</Text>
              </View>
            </View>

            {isWide && (
              <ImageBackground
                testID="login-hero-image"
                source={heroImage}
                resizeMode="cover"
                imageStyle={styles.heroImage}
                style={styles.hero}
              >
                <View style={styles.heroOverlay} />
                <View style={styles.heroTopline}>
                  <Sparkles color={colors.brand} size={16} />
                  <Text style={styles.heroToplineText}>
                    {isClient ? 'AGENDAMENTO PARA BELEZA & ESTÉTICA' : 'GESTÃO PARA BELEZA & ESTÉTICA'}
                  </Text>
                </View>
                <View style={styles.heroCopy}>
                  <Text testID="login-hero-stat" style={styles.heroStat}>
                    {isClient ? <>Seu próximo cuidado.{`\n`}No horário certo.</> : <>Menos ruído.{`\n`}Mais cadeira ocupada.</>}
                  </Text>
                  <Text testID="login-hero-description" style={styles.heroDescription}>
                    {isClient
                      ? 'Encontre seus horários e acompanhe seus agendamentos em um só lugar.'
                      : 'Agenda, equipe e caixa em tempo real para você focar na experiência do cliente.'}
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
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 38, letterSpacing: -1.7, marginTop: 12 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22, maxWidth: 410, marginTop: 10 },
  formCard: { gap: 20 },
  fields: { gap: 18 },
  eyeButton: { position: 'absolute', right: 12, bottom: 15, padding: 4 },
  eyeButtonPressed: { opacity: 0.5 },
  errorBox: { backgroundColor: colors.dangerSoft, borderLeftWidth: 2, borderLeftColor: colors.danger, padding: 12, borderRadius: radii.sm },
  errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  sentEmail: { color: colors.text, fontFamily: typography.bodyStrong },
  textLink: { alignItems: 'center', paddingVertical: 4 },
  textLinkLabel: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12 },
  registerLink: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 4 },
  registerText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  registerAccent: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 12 },
  linkPressed: { opacity: 0.55 },
  inviteNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: 18 },
  securityNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, justifyContent: 'center' },
  securityText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  hero: { flex: 1, minHeight: 690, justifyContent: 'space-between', padding: 38 },
  heroImage: { borderTopRightRadius: radii.xl, borderBottomRightRadius: radii.xl },
  heroOverlay: { position: 'absolute', inset: 0, backgroundColor: '#05050576' } as any,
  heroTopline: { flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 1 },
  heroToplineText: { color: colors.white, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4 },
  heroCopy: { zIndex: 1, maxWidth: 470 },
  heroStat: { color: colors.white, fontFamily: typography.display, fontSize: 44, lineHeight: 49, letterSpacing: -2 },
  heroDescription: { color: '#E4E4E7', fontFamily: typography.body, fontSize: 14, lineHeight: 22, marginTop: 16, maxWidth: 390 },
});
