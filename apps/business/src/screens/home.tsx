import { products, sharedBrand } from '@cutsync/brand';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

const operationalSlices = [
  { label: 'Meu dia e agenda', code: 'AGENDA' },
  { label: 'Encaixes e bloqueios', code: 'OPERAÇÃO' },
  { label: 'Equipe e serviços', code: 'GESTÃO' },
];

export function BusinessHomeScreen() {
  return (
    <View testID="business-app-shell" style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.topbar}>
        <View>
          <Text style={styles.brandName}>{products.business.name}</Text>
          <Text style={styles.brandCaption}>CENTRAL OPERACIONAL</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>BASE PRONTA</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>APLICATIVO OPERACIONAL</Text>
        <Text style={styles.title}>A operação começa pelo agora.</Text>
        <Text style={styles.description}>{products.business.purpose}</Text>
      </View>

      <View style={styles.stack}>
        {operationalSlices.map((slice, index) => (
          <View key={slice.code} style={styles.row}>
            <Text style={styles.rowIndex}>{index + 1}</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowCode}>{slice.code}</Text>
              <Text style={styles.rowLabel}>{slice.label}</Text>
            </View>
            <Text style={styles.rowArrow}>→</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: sharedBrand.colors.forestDark, paddingHorizontal: 22, paddingTop: 62, paddingBottom: 28 },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  brandCaption: { color: '#9EAAA1', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#3A4A3F', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7FC98B' },
  liveText: { color: '#C7D0C9', fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  hero: { flex: 1, justifyContent: 'center', gap: 12 },
  eyebrow: { color: sharedBrand.colors.sand, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 38, fontWeight: '700', letterSpacing: -1.2, lineHeight: 43 },
  description: { color: '#B5BEB7', fontSize: 15, lineHeight: 23, maxWidth: 330 },
  stack: { gap: 10 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: '#223027', paddingHorizontal: 16, gap: 14 },
  rowIndex: { color: sharedBrand.colors.sand, fontSize: 12, fontWeight: '700' },
  rowCopy: { flex: 1, gap: 4 },
  rowCode: { color: '#819087', fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  rowLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  rowArrow: { color: sharedBrand.colors.sand, fontSize: 20 },
});
