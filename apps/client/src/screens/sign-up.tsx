import { PASSWORD_RULES, isSafeFilledInput } from '@cutsync/validation';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';

import {
  AuthButton,
  AuthField,
  AuthLink,
  AuthNotice,
  AuthPasswordField,
  AuthScreen,
  AuthSecurityNote,
} from '@/components/auth/auth-form';
import { useSession } from '@/contexts/session-context';

export function ClientSignUpScreen() {
  const router = useRouter();
  const { isConfigured, signUp } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async () => {
    Keyboard.dismiss();
    setError(null);
    setIsSubmitting(true);
    const result = await signUp(name, email, password, confirmation);
    setIsSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    if (result.confirmationRequired) {
      router.replace({ pathname: '/(auth)/check-email', params: { email: result.email } });
    } else {
      router.replace('/');
    }
  };

  const disabled = isSubmitting || !isConfigured;

  return (
    <AuthScreen
      testID="client-sign-up-screen"
      eyebrow="SUA CONTA CUTSYNC"
      title="Crie seu acesso."
      description="Toda nova conta começa como cliente. Acessos de equipe dependem de convite verificado."
    >
      <AuthField
        testID="client-sign-up-name"
        label="Nome"
        autoCapitalize="words"
        autoComplete="name"
        editable={!isSubmitting}
        maxLength={80}
        onChangeText={setName}
        onUnsafeInput={setError}
        placeholder="Como podemos chamar você?"
        returnKeyType="next"
        value={name}
      />
      <AuthField
        testID="client-sign-up-email"
        label="E-mail"
        autoCapitalize="none"
        autoComplete="email"
        editable={!isSubmitting}
        keyboardType="email-address"
        onChangeText={setEmail}
        onUnsafeInput={setError}
        placeholder="voce@exemplo.com"
        returnKeyType="next"
        value={email}
      />
      <AuthPasswordField
        testID="client-sign-up-password"
        label="Senha"
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!isSubmitting}
        onChangeText={setPassword}
        onUnsafeInput={setError}
        placeholder="Crie uma senha forte"
        returnKeyType="next"
        value={password}
      />
      <View testID="client-sign-up-password-rules" style={styles.rules}>
        {PASSWORD_RULES.map((rule) => {
          const met = isSafeFilledInput(password) && rule.isMet(password);
          return (
            <View key={rule.id} style={styles.rule}>
              <View style={[styles.ruleDot, met && styles.ruleDotMet]} />
              <Text style={[styles.ruleText, met && styles.ruleTextMet]}>{rule.label}</Text>
            </View>
          );
        })}
      </View>
      <AuthPasswordField
        testID="client-sign-up-confirmation"
        label="Confirmar senha"
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!isSubmitting}
        onChangeText={setConfirmation}
        onUnsafeInput={setError}
        onSubmitEditing={() => { if (!disabled) void handleSignUp(); }}
        placeholder="Repita a senha"
        returnKeyType="done"
        value={confirmation}
      />
      {error && <AuthNotice testID="client-sign-up-error" message={error} />}
      <AuthButton
        testID="client-sign-up-submit"
        label="Criar conta"
        disabled={disabled}
        loading={isSubmitting}
        onPress={() => { void handleSignUp(); }}
      />
      <AuthLink testID="client-sign-up-back" label="Já possui uma conta? Entrar" onPress={() => router.replace('/(auth)/sign-in')} />
      <AuthSecurityNote>Nome, e-mail e senha são validados antes de qualquer envio. Emojis e SVG são bloqueados.</AuthSecurityNote>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  rules: { gap: 7, marginTop: -8 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C9C2B4' },
  ruleDotMet: { backgroundColor: '#3E7252' },
  ruleText: { color: '#817A6C', fontSize: 11 },
  ruleTextMet: { color: '#3E7252', fontWeight: '700' },
});
