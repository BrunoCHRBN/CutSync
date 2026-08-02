import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CLOUD_ROUTES } from '@/navigation/cloud-routes';

export default function NotFoundRoute() {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Página não encontrada</Text>
      <Link href={CLOUD_ROUTES.central} style={styles.link}>Voltar à Central</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { color: '#17231c', fontSize: 24, fontWeight: '800' },
  link: { color: '#347452', fontWeight: '700' },
});
