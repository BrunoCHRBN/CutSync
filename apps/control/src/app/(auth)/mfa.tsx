import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

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
import { colors, spacing, typeScale } from '@/theme/tokens';

export default function MfaRoute() {
  const {
    status,
    message,
    enrollment,
    hasVerifiedTotp,
    mfaBusy,
    enrollMfa,
    verifyMfa,
    signOut,
  } = useControlAuth();
  const params = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const destination = resolvePostAuthDestination(returnTo);
  const [code, setCode] = useState('');

  if (status === 'loading') return <ControlState loading message="Validando o autenticador..." />;
  if (status === 'signed_out') return <Redirect href={CLOUD_ROUTES.login} />;
  if (status === 'ready') return <Redirect href={destination} />;
  if (status === 'unauthorized') return <Redirect href={CLOUD_ROUTES.semAcesso} />;
  if (status === 'error') return <Redirect href={CLOUD_ROUTES.root} />;

  return (
    <View style={styles.page}>
      <ControlCard style={styles.card}>
        <Text style={styles.eyebrow}>SEGUNDA ETAPA</Text>
        <Text style={styles.title}>Confirme seu autenticador</Text>
        <Text style={styles.description}>
          O CutSync Cloud exige TOTP e uma sessão AAL2 para liberar qualquer dado interno.
        </Text>

        {enrollment ? (
          <View style={styles.enrollment}>
            <Image
              accessibilityLabel="QR Code para cadastrar o autenticador"
              source={{ uri: enrollment.qrCode }}
              style={styles.qrCode}
            />
            <Text style={styles.helper}>Se necessário, use a chave manual:</Text>
            <Text selectable style={styles.secret}>{enrollment.secret}</Text>
          </View>
        ) : !hasVerifiedTotp ? (
          <ControlButton
            label={mfaBusy ? 'Preparando QR Code...' : 'Cadastrar novo autenticador'}
            variant="secondary"
            busy={mfaBusy}
            onPress={() => { void enrollMfa(); }}
          />
        ) : (
          <Text style={styles.helper}>Abra seu aplicativo autenticador e informe o código atual.</Text>
        )}

        <ControlField
          label="Código do autenticador"
          inputMode="numeric"
          maxLength={6}
          editable={!mfaBusy}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          onSubmitEditing={() => { if (code.length === 6) void verifyMfa(code); }}
          placeholder="Código de 6 dígitos"
          style={styles.input}
          value={code}
        />
        <ControlButton
          label={mfaBusy ? 'Verificando...' : 'Verificar e continuar'}
          disabled={code.length !== 6 || mfaBusy}
          busy={mfaBusy}
          onPress={() => { void verifyMfa(code); }}
        />
        {message ? <ControlNotice tone="danger" message={message} /> : null}
        <ControlButton
          label="Encerrar sessão"
          variant="ghost"
          onPress={() => { void signOut(); }}
        />
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
  card: {
    maxWidth: 480,
    gap: spacing.md,
    padding: spacing.xxl,
  },
  eyebrow: { ...typeScale.eyebrow, color: colors.accent },
  title: { ...typeScale.pageTitleCompact, color: colors.text },
  description: { ...typeScale.body, color: colors.textSecondary },
  enrollment: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  qrCode: { width: 190, height: 190, backgroundColor: colors.surface },
  helper: { ...typeScale.small, color: colors.textSecondary },
  secret: { ...typeScale.bodyStrong, color: colors.text, letterSpacing: 1, textAlign: 'center' },
  input: {
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 3,
  },
});
