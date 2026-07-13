import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../services/supabase';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'admin'>('client');
  
  // Dados extras para Barbearia/Admin
  const [barbershopName, setBarbershopName] = useState('');
  const [barbershopSlug, setBarbershopSlug] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#D4AF37'); // Cor dourada padrão
  
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!name || !email || !password || (role === 'admin' && (!barbershopName || !barbershopSlug))) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos obrigatórios.');
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
          })
          .select('id')
          .single();

        if (bError) {
          throw new Error('Falha ao criar barbearia: ' + bError.message);
        }
        barbershopId = bData.id;
      }

      // 2. Criar usuário no Auth
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name,
            phone,
            role,
            barbershop_id: barbershopId,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      Alert.alert('Sucesso', 'Cadastro realizado com sucesso! Faça login para entrar.');
      router.replace('/(auth)/login');
    } catch (error: any) {
      Alert.alert('Erro no Cadastro', error.message || 'Ocorreu um erro.');
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
          <Text style={styles.brandName}>CTRLShot</Text>
          <Text style={styles.tagline}>Crie sua conta agora</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Cadastre-se</Text>

          {/* Seleção do tipo de perfil */}
          <View style={styles.roleContainer}>
            <TouchableOpacity 
              style={[styles.roleButton, role === 'client' && styles.roleButtonActive]}
              onPress={() => setRole('client')}
            >
              <Text style={[styles.roleButtonText, role === 'client' && styles.roleButtonTextActive]}>Sou Cliente</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.roleButton, role === 'admin' && styles.roleButtonActive]}
              onPress={() => setRole('admin')}
            >
              <Text style={[styles.roleButtonText, role === 'admin' && styles.roleButtonTextActive]}>Tenho Barbearia</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome Completo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite seu nome"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-mail *</Text>
            <TextInput
              style={styles.input}
              placeholder="Digite seu e-mail"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telefone</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: (11) 99999-9999"
              placeholderTextColor="#666"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Senha *</Text>
            <TextInput
              style={styles.input}
              placeholder="Crie uma senha forte"
              placeholderTextColor="#666"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />
          </View>

          {/* Seção Extra para Barbearias */}
          {role === 'admin' && (
            <View style={styles.extraSection}>
              <Text style={styles.sectionTitle}>Dados da Barbearia</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nome da Barbearia *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nome comercial"
                  placeholderTextColor="#666"
                  value={barbershopName}
                  onChangeText={setBarbershopName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Link/Slug da Barbearia *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: barbearia-imperial (letras/números)"
                  placeholderTextColor="#666"
                  value={barbershopSlug}
                  onChangeText={setBarbershopSlug}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Cor Primária Destaque (Hex) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: #D4AF37 (dourado)"
                  placeholderTextColor="#666"
                  value={primaryColor}
                  onChangeText={setPrimaryColor}
                  autoCapitalize="none"
                />
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.registerButton} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text style={styles.registerButtonText}>Cadastrar</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.loginLink} 
            onPress={() => router.push('/(auth)/login')}
          >
            <Text style={styles.loginLinkText}>
              Já tem conta? <Text style={styles.loginLinkHighlight}>Entrar</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
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
    fontSize: 14,
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
  loginLinkHighlight: {
    color: '#D4AF37',
    fontWeight: 'bold',
  },
});
