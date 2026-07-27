import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundRoute() {
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Página não encontrada</Text>
      <Link href="/" style={styles.link}>Voltar à visão geral</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { color: '#17231c', fontSize: 24, fontWeight: '800' },
  link: { color: '#347452', fontWeight: '700' },
});
