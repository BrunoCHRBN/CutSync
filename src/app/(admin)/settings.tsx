import { colors } from '../../theme/tokens';
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { database } from '../../database';
import { Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { SettingsExperience } from '../../components/screens/SettingsExperience';

export default SettingsExperience;

function LegacyBarbershopSettingsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#D4AF37');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [openingHours, setOpeningHours] = useState('');
  const [shareAgendas, setShareAgendas] = useState(true);

  const displayAlert = (title: string, message: string) => {
    console.warn(`${title}: ${message}`);
  };

  useEffect(() => {
    if (!profile?.establishment_id) {
      setLoading(false);
      return;
    }

    const barbershopId = profile.establishment_id;
    const fetchBarbershop = async () => {
      try {
        const b = await database.collections.get<Barbershop>('establishments').find(barbershopId);
        setBarbershop(b);

        setName(b.name);
        setPrimaryColor(b.primaryColor);
        setDescription(b.description || '');
        setAddress(b.address || '');
        setPhone(b.phone || '');
        setOpeningHours(b.openingHours || '');
        setShareAgendas(b.shareAgendas !== undefined && b.shareAgendas !== null ? b.shareAgendas : true);
      } catch (err) {
        console.error('Erro ao carregar dados da barbearia:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBarbershop();
  }, [profile]);

  const handleSaveSettings = async () => {
    if (!name.trim()) {
      displayAlert(t('common.error'), 'O nome da barbearia é obrigatório.');
      return;
    }

    if (!barbershop) return;

    setIsSubmitting(true);
    try {
      await database.write(async () => {
        await barbershop.update((record) => {
          record.name = name;
          record.primaryColor = primaryColor;
          record.description = description;
          record.address = address;
          record.phone = phone;
          record.openingHours = openingHours;
          record.shareAgendas = shareAgendas;
        });
      });

      displayAlert(t('common.success'), 'Dados da barbearia atualizados com sucesso!');
      sync();
      router.back();
    } catch (err) {
      displayAlert(t('common.error'), 'Não foi possível salvar as configurações.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const activeColor = primaryColor || '#D4AF37';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>CONFIGURAÇÕES</Text>
        <Text style={[styles.barbershopName, { color: activeColor }]}>{barbershop?.name}</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Dados do Salão</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nome da Barbearia</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Nome comercial"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Cor Primária (Hexadecimal)</Text>
          <TextInput
            style={styles.input}
            value={primaryColor}
            onChangeText={setPrimaryColor}
            placeholder="Ex: #D4AF37"
            placeholderTextColor="#666"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Descrição / Sobre nós</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Conte um pouco sobre sua barbearia e equipe..."
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Endereço Completo</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="Rua, Número, Bairro, Cidade"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Telefone de Contato</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+55 (11) 99999-9999"
            placeholderTextColor="#666"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Horário de Funcionamento</Text>
          <TextInput
            style={styles.input}
            value={openingHours}
            onChangeText={setOpeningHours}
            placeholder="Ex: Seg a Sáb: 09:00 - 20:00"
            placeholderTextColor="#666"
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={styles.toggleLabel}>Compartilhar Agendas</Text>
            <Text style={styles.toggleSubText}>
              Permitir que barbeiros vejam os horários ocupados uns dos outros para agendamento cruzado.
            </Text>
          </View>
          <Switch
            value={shareAgendas}
            onValueChange={setShareAgendas}
            trackColor={{ false: '#3a3a3c', true: activeColor + '44' }}
            thumbColor={shareAgendas ? activeColor : '#8e8e93'}
          />
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, { backgroundColor: activeColor }]}
          onPress={handleSaveSettings}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#121212" />
          ) : (
            <Text style={styles.saveButtonText}>Salvar Dados</Text>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(admin)');
          }
        }}
      >
        <Text style={styles.backButtonText}>{t('common.back')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 16,
    color: colors.text,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surfacePressed,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  saveButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: colors.surfacePressed,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
  },
  toggleSubText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
});
