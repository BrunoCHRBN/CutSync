import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ControlButton,
  ControlCard,
  ControlField,
  ControlNotice,
} from '@/components/control-ui';
import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';
import { colors, spacing, typeScale } from '@/theme/tokens';

export default function LoginRoute() {
  const { status, message, signIn, retry } = useControlAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (status === 'loading') return <ControlState loading message="Validando sessão segura..." />;
  if (status === 'ready') return <Redirect href="/" />;
  if (status === 'mfa_required') return <Redirect href="/mfa" />;
  if (status === 'error') {
    return <ControlState title="Não foi possível validar o acesso" message={message} actionLabel="Tentar novamente" onAction={() => { void retry(); }} />;
  }

  return (
    <View style={styles.page}>
      <ControlCard style={styles.panel}>
        <Text style={styles.eyebrow}>AMBIENTE INTERNO</Text>
        <Text style={styles.title}>CutSync Control</Text>
        <Text style={styles.description}>
          Indicadores, operação e governança em um ambiente separado dos aplicativos públicos.
        </Text>

        <View style={styles.form}>
          <ControlField
            label="E-mail"
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="voce@empresa.com"
            value={email}
          />
          <ControlField
            label="Senha"
            autoComplete="current-password"
            onChangeText={setPassword}
            onSubmitEditing={() => { void signIn(email, password); }}
            placeholder="Sua senha"
            secureTextEntry
            value={password}
          />
          <ControlButton
            label="Entrar com segurança"
            disabled={!email.trim() || !password}
            onPress={() => { void signIn(email, password); }}
          />
          {message ? <ControlNotice tone="danger" message={message} /> : null}
        </View>

        <Text style={styles.securityNote}>
          A sessão permanece somente nesta aba e exige autenticação em dois fatores.
        </Text>
      </ControlCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.canvasMuted,
  },
  panel: {
    maxWidth: 460,
    gap: spacing.md,
    padding: spacing.xxl,
  },
  eyebrow: { ...typeScale.eyebrow, color: colors.accent },
  title: { ...typeScale.pageTitle, color: colors.text },
  description: { ...typeScale.body, color: colors.textSecondary },
  form: { gap: spacing.sm, marginTop: spacing.sm },
  securityNote: { ...typeScale.small, color: colors.textMuted, marginTop: spacing.xs },
});
