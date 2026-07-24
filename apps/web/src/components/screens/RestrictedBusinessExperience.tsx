import { useRouter } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useBillingAccess } from '../../contexts/BillingAccessContext';
import { colors, radii, typography } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';

export function RestrictedBusinessExperience() {
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const { access, connectionError, loading, refresh } = useBillingAccess();
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <LockKeyhole color={colors.accent} size={30} />
        <Text style={styles.eyebrow}>OPERAÇÃO EM MODO LEITURA</Text>
        <Text style={styles.title}>Os dados continuam preservados.</Text>
        <Text style={styles.body}>Novas reservas e alterações administrativas estão indisponíveis. Compromissos existentes permanecem e clientes ainda podem consultá-los e cancelá-los.</Text>
        <Text style={styles.note}>{access?.billing_owner ? 'Regularize a assinatura no ambiente web para restaurar a operação.' : 'O responsável financeiro do estabelecimento precisa regularizar a conta.'}</Text>
        {connectionError ? <Text style={styles.error}>Sem conexão para confirmar a situação agora.</Text> : null}
        <View style={styles.actions}>
          {access?.billing_owner && access.membership_role === 'admin' ? <AppButton label="Ver cobrança" onPress={() => router.push('/(admin)/billing')} /> : null}
          <AppButton label="Verificar novamente" variant="secondary" loading={loading} onPress={() => void refresh()} />
          <AppButton label="Sair" variant="ghost" onPress={() => void signOut()} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 560, backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: 30 },
  eyebrow: { color: colors.accent, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4, marginTop: 20 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 29, marginTop: 8 },
  body: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 15, lineHeight: 23, marginTop: 14 },
  note: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  error: { color: colors.danger, fontFamily: typography.bodyStrong, marginTop: 12 },
  actions: { gap: 10, marginTop: 24, alignItems: 'flex-start' },
});
