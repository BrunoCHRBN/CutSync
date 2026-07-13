import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../services/supabase';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      displayAlert(t('common.error'), t('login.error_fill'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        displayAlert(t('login.error_fail'), error.message);
      }
    } catch (error: any) {
      displayAlert(t('common.error'), error.message || 'Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brandName}>CutSync</Text>
          <Text style={styles.tagline}>Gestão inteligente para sua barbearia</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{t('login.title')}</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('login.email')}</Text>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('login.password')}</Text>
            <TextInput
              style={styles.input}
              placeholder="******"
              placeholderTextColor="#666"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text style={styles.loginButtonText}>{t('login.button')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.registerLink} 
            onPress={() => router.push('/(auth)/register')}
          >
            <Text style={styles.registerLinkText}>
              {t('login.no_account')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  brandName: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 36,
    color: '#D4AF37',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 8,
  },
  form: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  loginButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  loginButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  registerLinkText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
});
