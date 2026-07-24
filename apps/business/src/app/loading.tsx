import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { sharedBrand } from '@cutsync/brand';
import { useBusinessSession } from '@/contexts/business-session';
import { Redirect } from 'expo-router';

export default function LoadingRoute() {
  const { session, access, connectionError, verifyAgain } = useBusinessSession();
  if (!session) return <Redirect href="/sign-in" />;
  if (access?.access_mode === 'full') return <Redirect href="/operation" />;
  if (access) return <Redirect href="/restricted" />;
  return (
    <View style={styles.screen}>
      <ActivityIndicator color={sharedBrand.colors.sand} size="large" />
      <Text style={styles.text}>{connectionError ? 'Sem conexão para verificar seu acesso.' : 'Verificando acesso…'}</Text>
      {connectionError ? <Text style={styles.retry} onPress={() => void verifyAgain()}>Tentar novamente</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: sharedBrand.colors.forestDark },
  text: { color: '#D7DDD8', fontSize: 15 },
  retry: { color: sharedBrand.colors.sand, fontSize: 14, fontWeight: '700' },
});
