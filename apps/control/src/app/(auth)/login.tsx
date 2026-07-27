import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function LoginRoute() {
  const { status, message, signIn, retry } = useControlAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (status === 'loading') return <ControlState loading message="Validando sessão segura..." />;
  if (status === 'ready') return <Redirect href="/" />;
  if (status === 'mfa_required') return <Redirect href="/mfa" />;
  if (status === 'error') {
    return <ControlState title="Não foi possível validar o acesso" message={message} actionLabel="Tentar novamente" onAction={() => { void retry(); }} />;
  }

  return (
    <View style={styles.page}>
      <View style={styles.panel}>
        <Text style={styles.eyebrow}>AMBIENTE INTERNO</Text>
        <Text style={styles.title}>CutSync Control</Text>
        <Text style={styles.description}>
          Indicadores, operação e governança em um ambiente separado dos aplicativos públicos.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>E-mail</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="voce@empresa.com"
            style={styles.input}
            value={email}
          />
          <Text style={styles.label}>Senha</Text>
          <TextInput
            autoComplete="current-password"
            onChangeText={setPassword}
            onSubmitEditing={() => { void signIn(email, password); }}
            placeholder="Sua senha"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!email.trim() || !password}
            onPress={() => { void signIn(email, password); }}
            style={({ pressed }) => [
              styles.primary,
              (!email.trim() || !password) && styles.primaryDisabled,
              pressed && styles.primaryPressed,
            ]}
          >
            <Text style={styles.primaryText}>Entrar com segurança</Text>
          </Pressable>
          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        </View>

        <Text style={styles.securityNote}>
          A sessão permanece somente nesta aba e exige autenticação em dois fatores.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#eef2ed',
  },
  panel: {
    width: '100%',
    maxWidth: 460,
    gap: 12,
    padding: 34,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },
  eyebrow: { color: '#347452', fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: '#17231c', fontSize: 31, fontWeight: '800' },
  description: { color: '#667269', lineHeight: 22 },
  form: { gap: 9, marginTop: 12 },
  label: { color: '#344239', fontSize: 13, fontWeight: '700', marginTop: 3 },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#cbd4cc',
    borderRadius: 10,
    backgroundColor: '#fbfcfb',
  },
  primary: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#173d2b',
  },
  primaryDisabled: { opacity: 0.45 },
  primaryPressed: { opacity: 0.82 },
  primaryText: { color: '#ffffff', fontWeight: '800' },
  error: { color: '#a33a31', lineHeight: 20 },
  securityNote: { color: '#78827b', fontSize: 12, lineHeight: 18, marginTop: 10 },
});
