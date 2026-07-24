import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { sharedBrand } from '@cutsync/brand';
import { useBusinessSession } from '@/contexts/business-session';

export default function SignInRoute() {
  const { session, signIn } = useBusinessSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (session) return <Redirect href="/" />;
  const submit = async () => {
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>CUTSYNC BUSINESS</Text>
      <Text style={styles.title}>Acesse sua operação</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-mail" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Senha" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} disabled={busy} onPress={() => void submit()}>
        <Text style={styles.buttonText}>{busy ? 'Entrando…' : 'Entrar'}</Text>
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 26, gap: 14, backgroundColor: '#F5F5F2' },
  eyebrow: { color: sharedBrand.colors.forestDark, fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: '#18201B', fontSize: 30, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#D4D8D4', backgroundColor: '#FFF', borderRadius: 13, paddingHorizontal: 15, fontSize: 15 },
  button: { minHeight: 52, borderRadius: 13, backgroundColor: sharedBrand.colors.forestDark, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 13 },
});
