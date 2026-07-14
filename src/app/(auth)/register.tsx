import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../services/supabase';
import { RegisterExperience } from '../../components/screens/RegisterExperience';

export default RegisterExperience;

function LegacyRegisterScreen() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'admin' | 'barber'>('client');
  
  // Dados extras para Barbearia/Admin
  const [barbershopName, setBarbershopName] = useState('');
  const [barbershopSlug, setBarbershopSlug] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#D4AF37');
  
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const displayAlert = (title: string, message: string) => {
    console.warn(`${title}: ${message}`);
  };

  const handleRegister = async () => {
    if (!name || !email || !password) {
      displayAlert(t('common.error'), t('register.error_fill'));
      return;
    }

    if (role === 'admin' && (!barbershopName || !barbershopSlug)) {
      displayAlert(t('common.error'), 'Por favor, preencha os dados da barbearia.');
      return;
    }

    if (role === 'barber' && !barbershopSlug) {
      displayAlert(t('common.error'), 'Por favor, informe o link/slug da barbearia à qual deseja se vincular.');
      return;
    }

    setLoading(true);
    try {
      let barbershopId = null;

      // 1. Se for Admin, cria a barbearia primeiro
      if (role === 'admin') {
        const { data: bData, error: bError } = await supabase
          .from('barbershops')
          .insert({
            name: barbershopName,
            slug: barbershopSlug.toLowerCase().replace(/[^a-z0-9-_]/g, ''),
            primary_color: primaryColor,
            timezone: 'America/Sao_Paulo',
            currency: 'BRL',
          })
          .select('id')
          .single();

        if (bError) {
          throw new Error('Falha ao criar barbearia: ' + bError.message);
        }
        barbershopId = bData.id;
      }

      // 2. Se for Barbeiro, vincula à barbearia existente pelo slug
      if (role === 'barber') {
        const { data: bData, error: bError } = await supabase
          .from('barbershops')
          .select('id')
          .eq('slug', barbershopSlug.toLowerCase().trim())
          .single();

        if (bError || !bData) {
          throw new Error('Barbearia com o link informado não foi encontrada no sistema.');
        }
        barbershopId = bData.id;
      }

      // 3. Criar usuário no Auth
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
            role,
            establishment_id: barbershopId,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      displayAlert(t('common.success'), 'Cadastro realizado com sucesso! Faça login.');
      router.replace('/(auth)/login');
    } catch (error: any) {
      displayAlert(t('common.error'), error.message || 'Ocorreu um erro.');
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
          <Text style={styles.tagline}>{t('register.title')}</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{t('register.title')}</Text>

          {/* Seleção do tipo de perfil */}
          <View style={styles.roleContainer}>
            <TouchableOpacity 
              style={[styles.roleButton, role === 'client' && styles.roleButtonActive]}
              onPress={() => setRole('client')}
            >
              <Text style={[styles.roleButtonText, role === 'client' && styles.roleButtonTextActive]}>
                {t('register.client_tab')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]}
              onPress={() => setRole('admin')}
            >
              <Text style={[styles.roleButtonText, role === 'admin' && styles.roleButtonTextActive]}>
                Dono/Admin
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.roleButton, role === 'barber' && styles.roleButtonActive]}
              onPress={() => setRole('barber')}
            >
              <Text style={[styles.roleButtonText, role === 'barber' && styles.roleButtonTextActive]}>
                Barbeiro
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('register.name_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: John Doe"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('register.email_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder="john@example.com"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('register.phone_label')}</Text>
            <TextInput
              style={styles.input}
              placeholder="+55 (11) 99999-9999"
              placeholderTextColor="#666"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('register.password_label')}</Text>
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

          {/* Seção Extra para Dono/Administrador da Barbearia */}
          {role === 'admin' && (
            <View style={styles.extraSection}>
              <Text style={styles.sectionTitle}>{t('register.barber_section')}</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('register.barber_name')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Premium Barber"
                  placeholderTextColor="#666"
                  value={barbershopName}
                  onChangeText={setBarbershopName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('register.barber_slug')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="premium-barber"
                  placeholderTextColor="#666"
                  value={barbershopSlug}
                  onChangeText={setBarbershopSlug}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('register.barber_color')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="#D4AF37"
                  placeholderTextColor="#666"
                  value={primaryColor}
                  onChangeText={setPrimaryColor}
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}

          {/* Seção Extra para Barbeiro/Funcionário Contratado */}
          {role === 'barber' && (
            <View style={styles.extraSection}>
              <Text style={styles.sectionTitle}>Vincular à Barbearia</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Link/Slug da Barbearia contratante</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: premium-barber"
                  placeholderTextColor="#666"
                  value={barbershopSlug}
                  onChangeText={setBarbershopSlug}
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.registerButton} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text style={styles.registerButtonText}>{t('register.button')}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.loginLink} 
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginLinkText}>
              {t('register.has_account')}
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
    marginBottom: 32,
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
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  roleContainer: {
    flexDirection: 'row',
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    padding: 4,
    marginBottom: 24,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  roleButtonActive: {
    backgroundColor: '#D4AF37',
  },
  roleButtonText: {
    color: '#a0a0a0',
    fontWeight: 'bold',
    fontSize: 12,
  },
  roleButtonTextActive: {
    color: '#121212',
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
  extraSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#3a3a3c',
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#D4AF37',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  registerButton: {
    backgroundColor: '#D4AF37',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  registerButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLinkText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
});
