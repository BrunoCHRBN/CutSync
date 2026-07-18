import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';
import { isStrongPassword } from '../../utils/passwordPolicy';
import { PasswordInput } from '../ui/PasswordInput';
import { PasswordStrengthChecklist } from '../ui/PasswordStrengthChecklist';

interface PublicBookingAuthModalProps {
  visible: boolean;
  magicLinkSent: boolean;
  registerMode: boolean;
  loading: boolean;
  email: string;
  name: string;
  password: string;
  passwordConfirmation: string;
  primaryColor: string;
  foregroundColor: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordConfirmationChange: (value: string) => void;
  onModeChange: (registerMode: boolean) => void;
  onMagicLinkDismiss: () => void;
  onMagicLinkSubmit: () => void;
  onAuthSubmit: () => void;
  onClose: () => void;
}

export const PublicBookingAuthModal = ({ visible, magicLinkSent, registerMode, loading, email, name, password, passwordConfirmation, primaryColor, foregroundColor, onEmailChange, onNameChange, onPasswordChange, onPasswordConfirmationChange, onModeChange, onMagicLinkDismiss, onMagicLinkSubmit, onAuthSubmit, onClose }: PublicBookingAuthModalProps) => (
  <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View testID="public-booking-auth-overlay" style={styles.overlay}>
      <View testID="public-booking-auth-modal" style={styles.card}>
        <Text testID="public-booking-auth-title" style={styles.title}>Identifique-se</Text>
        <Text testID="public-booking-auth-description" style={styles.description}>Você precisa de uma conta rápida para concluir seu agendamento.</Text>
        {magicLinkSent ? (
          <View style={styles.magicState}>
            <Text style={styles.successTitle}>E-mail enviado!</Text>
            <Text style={styles.successDescription}>Enviamos um link de login rápido para {email}. Abra o link e retorne aqui para finalizar o agendamento.</Text>
            <Pressable testID="public-booking-magic-link-dismiss-button" style={({ pressed }) => [styles.primaryButton, { backgroundColor: primaryColor }, pressed && styles.pressed]} onPress={onMagicLinkDismiss}><Text style={[styles.primaryButtonText, { color: foregroundColor }]}>Entendi</Text></Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.tabs}>
              <TouchableOpacity testID="public-booking-magic-link-tab" style={[styles.tab, !registerMode && styles.activeTab]} onPress={() => onModeChange(false)}><Text style={[styles.tabText, !registerMode && styles.activeTabText]}>Sem senha</Text></TouchableOpacity>
              <TouchableOpacity testID="public-booking-register-tab" style={[styles.tab, registerMode && styles.activeTab]} onPress={() => onModeChange(true)}><Text style={[styles.tabText, registerMode && styles.activeTabText]}>Criar conta</Text></TouchableOpacity>
            </View>
            {registerMode ? (
              <>
                <TextInput testID="public-booking-register-name-input" style={styles.input} placeholder="Seu nome completo" placeholderTextColor={colors.textMuted} value={name} onChangeText={onNameChange} />
                <TextInput testID="public-booking-register-email-input" style={styles.input} placeholder="E-mail" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={onEmailChange} />
                <PasswordInput testID="public-booking-register-password-input" label="Senha" placeholder="Crie uma senha forte" value={password} onChangeText={onPasswordChange} autoComplete="new-password" />
                <PasswordStrengthChecklist password={password} testID="public-booking-register-password-checklist" />
                <PasswordInput testID="public-booking-register-password-confirm-input" label="Confirmar senha" placeholder="Repita sua senha" value={passwordConfirmation} onChangeText={onPasswordConfirmationChange} autoComplete="new-password" error={passwordConfirmation && password !== passwordConfirmation ? 'As senhas precisam ser iguais.' : undefined} />
                <Pressable testID="public-booking-register-submit-button" style={({ pressed }) => [styles.primaryButton, { backgroundColor: primaryColor }, pressed && styles.pressed]} onPress={onAuthSubmit} disabled={loading || !isStrongPassword(password) || password !== passwordConfirmation}>{loading ? <ActivityIndicator color={foregroundColor} /> : <Text style={[styles.primaryButtonText, { color: foregroundColor }]}>Criar e reservar</Text>}</Pressable>
              </>
            ) : (
              <>
                <Text style={styles.info}>Digite seu e-mail abaixo. Você receberá um link de login imediato, sem senhas.</Text>
                <TextInput testID="public-booking-magic-link-email-input" style={styles.input} placeholder="Seu melhor e-mail" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={onEmailChange} />
                <Pressable testID="public-booking-magic-link-submit-button" style={({ pressed }) => [styles.primaryButton, { backgroundColor: primaryColor }, pressed && styles.pressed]} onPress={onMagicLinkSubmit} disabled={loading}>{loading ? <ActivityIndicator color={foregroundColor} /> : <Text style={[styles.primaryButtonText, { color: foregroundColor }]}>Enviar link de acesso</Text>}</Pressable>
              </>
            )}
            <TouchableOpacity testID="public-booking-auth-cancel-button" style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Cancelar</Text></TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(9,9,11,0.35)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 24, width: '100%', maxWidth: 440, borderWidth: 1, borderColor: colors.hairline, boxShadow: '0 24px 60px rgba(0,0,0,0.14)' },
  title: { fontSize: 19, color: colors.text, fontFamily: typography.display, letterSpacing: -0.5, textAlign: 'center' },
  description: { fontSize: 12, color: colors.textSecondary, fontFamily: typography.body, textAlign: 'center', marginTop: 6, marginBottom: 20 },
  magicState: { alignItems: 'center', paddingVertical: 12 },
  successTitle: { fontSize: 15, color: colors.success, fontFamily: typography.bodyStrong },
  successDescription: { color: colors.textSecondary, fontSize: 13, fontFamily: typography.body, textAlign: 'center', lineHeight: 20, marginTop: 12 },
  form: { gap: 12 },
  tabs: { flexDirection: 'row', backgroundColor: '#ECEDEF', borderRadius: radii.pill, padding: 4, gap: 4, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: radii.pill },
  activeTab: { backgroundColor: colors.surface, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  tabText: { color: colors.textMuted, fontSize: 12, fontFamily: typography.bodyStrong },
  activeTabText: { color: colors.text },
  info: { color: colors.textSecondary, fontSize: 12, fontFamily: typography.body, lineHeight: 18, marginBottom: 8 },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: typography.body, borderWidth: 1, borderColor: 'rgba(228,228,231,0.8)' },
  primaryButton: { borderRadius: radii.pill, minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8, width: '100%' },
  primaryButtonText: { fontFamily: typography.bodyStrong, fontSize: 13 },
  cancelButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});