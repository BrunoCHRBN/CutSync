import { Redirect, useLocalSearchParams } from 'expo-router';
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
import { CLOUD_ROUTES } from '@/navigation/cloud-routes';
import { resolvePostAuthDestination } from '@/navigation/safe-return-to';
import { isSupabaseConfigured, supabaseProjectHost } from '@/services/supabase';
import { colors, spacing, typeScale } from '@/theme/tokens';

export default function LoginRoute() {
  const { status, message, signIn, retry } = useControlAuth();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const destination = resolvePostAuthDestination(returnTo);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (status === 'loading') return <ControlState loading message="Validando sessão segura..." />;
  if (status === 'ready') return <Redirect href={destination} />;
  if (status === 'mfa_required') {
    const mfaHref = returnTo
      ? ({ pathname: CLOUD_ROUTES.mfa, params: { returnTo } } as const)
      : CLOUD_ROUTES.mfa;
    return <Redirect href={mfaHref} />;
  }
  if (status === 'unauthorized') return <Redirect href={CLOUD_ROUTES.semAcesso} />;
  if (status === 'error') {
    return <ControlState title="Não foi possível validar o acesso" message={message} actionLabel="Tentar novamente" onAction={() => { void retry(); }} />;
  }

  return (
    <View style={styles.page}>
      <ControlCard style={styles.panel}>
        <Text style={styles.eyebrow}>AMBIENTE INTERNO</Text>
        <Text style={styles.title}>CutSync Cloud</Text>
        <Text style={styles.description}>
          Indicadores, operação e governança em um ambiente separado dos aplicativos públicos.
        </Text>

        <View style={styles.form}>
          {!isSupabaseConfigured ? (
            <ControlNotice
              tone="warning"
              title="Build sem Supabase"
              message="Este deploy não embutiu a URL/publishable key de Homolog. Configure as variáveis públicas no projeto Vercel do Control e faça redeploy."
            />
          ) : null}
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
            disabled={!isSupabaseConfigured || !email.trim() || !password}
            onPress={() => { void signIn(email, password); }}
          />
          {message ? <ControlNotice tone="danger" message={message} /> : null}
        </View>

        <Text style={styles.securityNote}>
          A sessão permanece somente nesta aba e exige autenticação em dois fatores.
        </Text>
        {supabaseProjectHost ? (
          <Text style={styles.securityNote}>Projeto Auth: {supabaseProjectHost}</Text>
        ) : null}
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
