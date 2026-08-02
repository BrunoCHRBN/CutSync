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
import { cloudTheme } from '@/theme/cloud-components';

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
    return (
      <ControlState
        title="Não foi possível validar o acesso"
        message={message}
        actionLabel="Tentar novamente"
        onAction={() => { void retry(); }}
      />
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.atmosphere} />
      <ControlCard style={styles.panel}>
        <Text style={styles.brandMark}>AMBIENTE INTERNO</Text>
        <Text style={styles.title}>CutSync Cloud</Text>
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
          {message ? (
            <ControlNotice
              tone="danger"
              title="Não foi possível entrar"
              message={message}
            />
          ) : null}
        </View>

        <Text style={styles.securityNote}>
          A sessão permanece somente nesta aba e exige autenticação em dois fatores (TOTP / AAL2).
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
    padding: cloudTheme.spacing.xl,
    backgroundColor: cloudTheme.colors.canvas,
  },
  atmosphere: {
    ...StyleSheet.absoluteFill,
    backgroundColor: cloudTheme.colors.brandSoft,
    opacity: 0.35,
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    gap: cloudTheme.spacing.md,
    padding: cloudTheme.spacing.xxl,
    borderRadius: cloudTheme.radii.lg,
    zIndex: 1,
  },
  brandMark: {
    ...cloudTheme.type.eyebrow,
    color: cloudTheme.colors.accent,
  },
  title: {
    ...cloudTheme.type.pageTitle,
    color: cloudTheme.colors.text,
  },
  description: {
    ...cloudTheme.type.body,
    color: cloudTheme.colors.textSecondary,
  },
  form: {
    gap: cloudTheme.spacing.sm,
    marginTop: cloudTheme.spacing.sm,
  },
  securityNote: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textMuted,
    marginTop: cloudTheme.spacing.xs,
  },
});
