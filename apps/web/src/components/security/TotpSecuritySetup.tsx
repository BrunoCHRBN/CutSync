import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../services/supabase';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';

type Props = {
  onVerified: () => void;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export const TotpSecuritySetup = ({ onVerified }: Props) => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      const factor = data?.totp.find((item) => item.status === 'verified');
      setVerifiedFactorId(factor?.id ?? null);
    });
  }, []);

  const startEnrollment = async () => {
    setLoading(true);
    setMessage(null);
    const result = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'CutSync',
    });
    if (result.error) setMessage('Não foi possível iniciar o cadastro do autenticador.');
    else {
      setEnrollment({
        factorId: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
    }
    setLoading(false);
  };

  const verify = async () => {
    const factorId = enrollment?.factorId ?? verifiedFactorId;
    if (!factorId || !/^\d{6}$/.test(code.trim())) {
      setMessage('Informe o código de 6 dígitos do aplicativo autenticador.');
      return;
    }
    setLoading(true);
    setMessage(null);
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setMessage('Não foi possível criar o desafio TOTP.');
      setLoading(false);
      return;
    }
    const verification = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    if (verification.error) setMessage('Código inválido ou expirado.');
    else {
      setCode('');
      onVerified();
    }
    setLoading(false);
  };

  return (
    <View style={styles.card} testID="totp-security-setup">
      <Text style={styles.title}>Proteja esta ação com TOTP</Text>
      <Text style={styles.description}>
        Use Google Authenticator, Microsoft Authenticator, Authy, 1Password ou Bitwarden.
      </Text>
      {!verifiedFactorId && !enrollment && (
        <AppButton label="Cadastrar autenticador" onPress={() => void startEnrollment()} loading={loading} />
      )}
      {!!enrollment && (
        <View style={styles.enrollment}>
          <Image source={{ uri: enrollment.qrCode }} style={styles.qrCode} accessibilityLabel="QR Code do autenticador" />
          <Text style={styles.secretLabel}>Chave manual</Text>
          <Text selectable style={styles.secret}>{enrollment.secret}</Text>
          <Text style={styles.recovery}>
            Guarde esta chave em local seguro. Ela é o recurso operacional para recadastrar o autenticador.
          </Text>
        </View>
      )}
      {(verifiedFactorId || enrollment) && (
        <>
          <AppInput
            label="Código do autenticador"
            value={code}
            onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            testID="totp-security-code"
          />
          <AppButton label="Confirmar código" onPress={() => void verify()} loading={loading} />
        </>
      )}
      {!!message && <InlineNotice tone="danger" message={message} />}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  title: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 15 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  enrollment: { alignItems: 'center', gap: 8 },
  qrCode: { backgroundColor: '#fff', height: 180, width: 180 },
  secretLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  secret: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, letterSpacing: 1 },
  recovery: { color: colors.warning, fontFamily: typography.body, fontSize: 11, lineHeight: 16, textAlign: 'center' },
});
