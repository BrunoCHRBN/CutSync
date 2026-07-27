import { Redirect } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ControlState } from '@/components/control-state';
import { useControlAuth } from '@/contexts/control-auth-context';

export default function MfaRoute() {
  const {
    status,
    message,
    enrollment,
    hasVerifiedTotp,
    mfaBusy,
    enrollMfa,
    verifyMfa,
    signOut,
  } = useControlAuth();
  const [code, setCode] = useState('');

  if (status === 'loading') return <ControlState loading message="Validando o autenticador..." />;
  if (status === 'signed_out') return <Redirect href="/login" />;
  if (status === 'ready') return <Redirect href="/" />;
  if (status === 'unauthorized' || status === 'error') return <Redirect href="/" />;

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>SEGUNDA ETAPA</Text>
        <Text style={styles.title}>Confirme seu autenticador</Text>
        <Text style={styles.description}>
          O CutSync Control exige TOTP e uma sessão AAL2 para liberar qualquer dado interno.
        </Text>

        {enrollment ? (
          <View style={styles.enrollment}>
            <Image
              accessibilityLabel="QR Code para cadastrar o autenticador"
              source={{ uri: enrollment.qrCode }}
              style={styles.qrCode}
            />
            <Text style={styles.helper}>Se necessário, use a chave manual:</Text>
            <Text selectable style={styles.secret}>{enrollment.secret}</Text>
          </View>
        ) : !hasVerifiedTotp ? (
          <Pressable
            accessibilityRole="button"
            disabled={mfaBusy}
            style={[styles.secondary, mfaBusy && styles.disabled]}
            onPress={() => { void enrollMfa(); }}
          >
            <Text style={styles.secondaryText}>
              {mfaBusy ? 'Preparando QR Code...' : 'Cadastrar novo autenticador'}
            </Text>
          </Pressable>
        ) : (
          <Text style={styles.helper}>Abra seu aplicativo autenticador e informe o código atual.</Text>
        )}

        <TextInput
          accessibilityLabel="Código do autenticador"
          inputMode="numeric"
          maxLength={6}
          editable={!mfaBusy}
          onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
          onSubmitEditing={() => { if (code.length === 6) void verifyMfa(code); }}
          placeholder="Código de 6 dígitos"
          style={styles.input}
          value={code}
        />
        <Pressable
          accessibilityRole="button"
          disabled={code.length !== 6 || mfaBusy}
          onPress={() => { void verifyMfa(code); }}
          style={[styles.primary, (code.length !== 6 || mfaBusy) && styles.disabled]}
        >
          <Text style={styles.primaryText}>{mfaBusy ? 'Verificando...' : 'Verificar e continuar'}</Text>
        </Pressable>
        {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.exit}>
          <Text style={styles.exitText}>Encerrar sessão</Text>
        </Pressable>
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
  card: {
    width: '100%',
    maxWidth: 480,
    gap: 13,
    padding: 32,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },
  eyebrow: { color: '#347452', fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: '#17231c', fontSize: 27, fontWeight: '800' },
  description: { color: '#667269', lineHeight: 21 },
  enrollment: { alignItems: 'center', gap: 8, paddingVertical: 6 },
  qrCode: { width: 190, height: 190, backgroundColor: '#ffffff' },
  helper: { color: '#667269', fontSize: 12 },
  secret: { color: '#17231c', fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#cbd4cc',
    borderRadius: 10,
    backgroundColor: '#fbfcfb',
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 3,
  },
  primary: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#173d2b',
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: '#ffffff', fontWeight: '800' },
  secondary: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bdc9bf',
    borderRadius: 10,
  },
  secondaryText: { color: '#274936', fontWeight: '700' },
  error: { color: '#a33a31', lineHeight: 20 },
  exit: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  exitText: { color: '#667269', fontWeight: '600' },
});
