import { products, sharedBrand } from '@cutsync/brand';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

const nextSlices = ['Explorar estabelecimentos', 'Agendar atendimento', 'Acompanhar meus horários'];

export function ClientHomeScreen() {
  return (
    <View testID="client-app-shell" style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.brandRow}>
        <View style={styles.brandMark} />
        <Text style={styles.brandName}>{products.client.name}</Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>APLICATIVO DO CLIENTE</Text>
        <Text style={styles.title}>Seu tempo, do seu jeito.</Text>
        <Text style={styles.description}>{products.client.purpose}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Próximas fatias</Text>
        {nextSlices.map((slice, index) => (
          <View key={slice} style={styles.item}>
            <Text style={styles.itemIndex}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.itemLabel}>{slice}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: sharedBrand.colors.sandSoft,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 32,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 18, height: 18, borderRadius: 6, backgroundColor: sharedBrand.colors.forest },
  brandName: { color: sharedBrand.colors.forestDark, fontSize: 17, fontWeight: '700' },
  hero: { flex: 1, justifyContent: 'center', gap: 12 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: sharedBrand.colors.forestDark, fontSize: 42, fontWeight: '700', letterSpacing: -1.4, lineHeight: 47 },
  description: { color: '#59615B', fontSize: 16, lineHeight: 24, maxWidth: 320 },
  panel: { backgroundColor: sharedBrand.colors.surface, borderRadius: 24, padding: 20, gap: 4 },
  panelTitle: { color: sharedBrand.colors.forestDark, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  itemIndex: { color: '#8C8068', fontSize: 11, fontWeight: '700' },
  itemLabel: { color: sharedBrand.colors.forestDark, fontSize: 14, fontWeight: '600' },
});
