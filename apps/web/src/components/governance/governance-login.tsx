import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
import { useGovernanceAuth } from '../../contexts/governance-auth-context';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { ScreenBackground } from '../ui/ScreenBackground';
import { colors, typography } from '../../theme/tokens';

export function GovernanceLogin() {
  const {
    loading,
    notice,
    mfaRequired,
    mfaError,
    mfaBusy,
    hasVerifiedTotp,
    enrollment,
    signIn,
    enrollMfa,
    confirmMfa,
    signOut,
  } = useGovernanceAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password) {
      setLocalError('Informe e-mail e senha.');
      return;
    }
    setLocalError('');
    await signIn(email, password);
  };

  return (
    <ScreenBackground testID="governance-login-screen">
      <View style={styles.container}>
        <AppCard testID="governance-login-card" style={styles.card} elevated>
          <View style={styles.brand}>
            <ShieldAlert color={colors.brand} size={32} />
            <Text style={styles.title}>Central de Governança</Text>
          </View>
          <Text style={styles.description}>
            Sessão volátil mantida apenas em memória. Atualizar a página encerra o acesso à Central.
          </Text>
          {!!(localError || notice) && (
            <InlineNotice
              testID="governance-login-notice"
              tone="danger"
              message={localError || notice?.message || ''}
            />
          )}
          <View style={styles.fields}>
            <AppInput
              testID="governance-email-input"
              label="E-mail administrativo"
              value={email}
              onChangeText={setEmail}
              placeholder="nome@cutsync.com.br"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <AppInput
              testID="governance-password-input"
              label="Senha de acesso"
              value={password}
              onChangeText={setPassword}
              placeholder="Digite sua senha"
              secureTextEntry
              autoCapitalize="none"
              onSubmitEditing={submit}
            />
          </View>
          {loading ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <AppButton testID="governance-login-button" label="Entrar na Central" onPress={submit} fullWidth />
          )}
        </AppCard>
      </View>

      <Modal visible={mfaRequired} transparent animationType="fade">
        <View style={styles.overlay}>
          <AppCard testID="governance-mfa-card" style={styles.modalCard} elevated>
            <Text style={styles.modalTitle}>Verificação de duas etapas</Text>
            <Text style={styles.description}>
              O acesso à Governança exige uma sessão AAL2. Use o código atual do seu aplicativo autenticador.
            </Text>
            {!!enrollment && (
              <View style={styles.enrollment}>
                <Image
                  accessibilityLabel="QR Code para cadastrar o autenticador"
                  source={{ uri: enrollment.qrCode }}
                  style={styles.qrCode}
                />
                <Text style={styles.description}>Se necessário, use a chave manual:</Text>
                <Text selectable style={styles.secret}>{enrollment.secret}</Text>
              </View>
            )}
            {!hasVerifiedTotp && !enrollment && (
              <AppButton
                testID="governance-mfa-enroll-button"
                label="Cadastrar autenticador"
                onPress={() => void enrollMfa()}
                loading={mfaBusy}
                variant="secondary"
                fullWidth
              />
            )}
            <AppInput
              testID="governance-mfa-input"
              label="Código de 6 dígitos"
              value={mfaCode}
              onChangeText={(value) => setMfaCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              error={mfaError || undefined}
            />
            <AppButton
              testID="governance-mfa-button"
              label="Verificar acesso"
              onPress={() => void confirmMfa(mfaCode)}
              loading={mfaBusy}
              disabled={mfaCode.length !== 6 || (!hasVerifiedTotp && !enrollment)}
              fullWidth
            />
            <AppButton
              label="Entrar com outra conta"
              onPress={() => void signOut()}
              disabled={mfaBusy}
              variant="ghost"
              fullWidth
            />
          </AppCard>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, padding: 28, gap: 20 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 22 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  fields: { gap: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.42)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 420, padding: 24, gap: 16 },
  modalTitle: { color: colors.text, fontFamily: typography.display, fontSize: 19 },
  enrollment: { alignItems: 'center', gap: 8 },
  qrCode: { width: 190, height: 190, backgroundColor: '#fff' },
  secret: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, letterSpacing: 1, textAlign: 'center' },
});
