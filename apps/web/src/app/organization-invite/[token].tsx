import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { AppButton } from '../../components/ui/AppButton';
import { AppCard } from '../../components/ui/AppCard';
import { colors, radii, typeScale } from '../../theme/tokens';

export default function OrganizationInviteRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!token) return;
    setLoading(true);
    const { error: rpcError } = await (supabase.rpc as any)('accept_organization_invitation', {
      invitation_token: token,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.replace('/(admin)/organization');
  };

  return (
    <View style={styles.root}>
      <AppCard style={styles.card}>
        <Text style={styles.title}>Convite para grupo empresarial</Text>
        <Text style={styles.copy}>O vínculo libera somente o papel corporativo indicado. A operação de cada unidade continua exigindo uma associação local.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!user ? (
          <Link href="/(auth)/login" style={styles.link}>Entre na sua conta para aceitar</Link>
        ) : loading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : (
          <AppButton label="Aceitar convite" onPress={() => { void accept(); }} />
        )}
      </AppCard>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.canvas },
  card: { width: '100%', maxWidth: 520, gap: 16, borderRadius: radii.lg },
  title: { ...typeScale.sectionTitle, color: colors.text },
  copy: { ...typeScale.body, color: colors.textSecondary },
  error: { ...typeScale.small, color: colors.danger },
  link: { ...typeScale.bodyStrong, color: colors.brandPrimary },
});
