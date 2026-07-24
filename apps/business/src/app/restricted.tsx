import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { sharedBrand } from '@cutsync/brand';
import { useBusinessSession } from '@/contexts/business-session';

export default function RestrictedRoute() {
  const { session, access, checking, connectionError, verifyAgain, signOut } = useBusinessSession();
  if (!session) return <Redirect href="/sign-in" />;
  if (access?.access_mode === 'full') return <Redirect href="/operation" />;
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>MODO LEITURA</Text>
      <Text style={styles.title}>A operação está temporariamente restrita.</Text>
      <Text style={styles.body}>Os agendamentos existentes continuam preservados. Nenhuma nova reserva ou alteração operacional pode ser feita agora.</Text>
      <Text style={styles.note}>{access?.billing_owner ? 'Administre a assinatura pela versão web do CutSync.' : 'O responsável financeiro do estabelecimento precisa verificar a conta.'}</Text>
      {connectionError ? <Text style={styles.error}>Sem conexão para confirmar uma atualização.</Text> : null}
      <Pressable style={styles.button} disabled={checking} onPress={() => void verifyAgain()}><Text style={styles.buttonText}>{checking ? 'Verificando…' : 'Verificar novamente'}</Text></Pressable>
      <Pressable onPress={() => void signOut()}><Text style={styles.exit}>Sair</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#F5F5F2' },
  eyebrow: { color: sharedBrand.colors.forestDark, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: '#18201B', fontSize: 29, lineHeight: 35, fontWeight: '700', marginTop: 10 },
  body: { color: '#59615B', fontSize: 15, lineHeight: 23, marginTop: 16 },
  note: { color: '#18201B', fontSize: 14, lineHeight: 21, fontWeight: '700', marginTop: 18 },
  error: { color: '#B42318', marginTop: 14 },
  button: { minHeight: 50, borderRadius: 13, backgroundColor: sharedBrand.colors.forestDark, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { color: '#FFF', fontWeight: '700' },
  exit: { color: '#59615B', textAlign: 'center', fontWeight: '700', padding: 16 },
});
