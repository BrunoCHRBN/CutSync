import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';

export default function ServicesScreen() {
  const { profile } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!profile?.barbershop_id) {
      setLoading(false);
      return;
    }

    // 1. Ouvir a barbearia
    const bSub = database.collections
      .get<Barbershop>('barbershops')
      .findAndObserve(profile.barbershop_id)
      .subscribe((data) => setBarbershop(data));

    // 2. Ouvir os serviços associados à barbearia localmente
    const sSub = database.collections
      .get<Service>('services')
      .query(Q.where('barbershop_id', profile.barbershop_id))
      .observe()
      .subscribe((data) => {
        setServices(data);
        setLoading(false);
      });

    return () => {
      bSub.unsubscribe();
      sSub.unsubscribe();
    };
  }, [profile]);

  const handleAddService = async () => {
    if (!name || !price || !duration) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    if (!profile?.barbershop_id) return;

    setIsSubmitting(true);
    try {
      // Criar o serviço localmente no WatermelonDB
      await database.write(async () => {
        await database.collections.get('services').create((record: any) => {
          record.barbershopId = profile.barbershop_id;
          record.name = name;
          record.price = parseFloat(price);
          record.durationMinutes = parseInt(duration);
          record.isActive = true;
        });
      });

      // Limpar campos
      setName('');
      setPrice('');
      setDuration('');

      Alert.alert('Sucesso', 'Serviço adicionado localmente! Sincronizando...');
      
      // Dispara a sincronização
      sync();
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar o serviço.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (serviceId: string, currentStatus: boolean) => {
    try {
      await database.write(async () => {
        const service = await database.collections.get<Service>('services').find(serviceId);
        await service.update((record) => {
          record.isActive = !currentStatus;
        });
      });
      sync();
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível atualizar o status do serviço.');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const primaryColor = barbershop?.primaryColor || '#D4AF37';

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Gestão de Serviços</Text>
      <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>

      {/* Formulário de Adicionar Serviço */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Novo Serviço</Text>

        <TextInput
          style={styles.input}
          placeholder="Nome do Serviço (ex: Barba)"
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
        />

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder="Preço (ex: 35.00)"
            placeholderTextColor="#666"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="Duração (min)"
            placeholderTextColor="#666"
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: primaryColor }]}
          onPress={handleAddService}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#121212" />
          ) : (
            <Text style={styles.addButtonText}>Salvar Serviço</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Lista de Serviços */}
      <View style={{ flex: 1, marginTop: 16 }}>
        <Text style={styles.sectionTitle}>Serviços Cadastrados</Text>

        {services.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nenhum serviço cadastrado localmente.</Text>
          </View>
        ) : (
          <FlatList
            data={services}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.serviceCard}>
                <View>
                  <Text style={styles.serviceName}>{item.name}</Text>
                  <Text style={styles.serviceDetails}>
                    R$ {Number(item.price).toFixed(2)} | {item.durationMinutes} min
                  </Text>
                </View>
                <TouchableOpacity 
                  style={[
                    styles.statusButton, 
                    { backgroundColor: item.isActive ? '#30d158' : '#ff453a' }
                  ]}
                  onPress={() => handleToggleActive(item.id, item.isActive)}
                >
                  <Text style={styles.statusButtonText}>
                    {item.isActive ? 'Ativo' : 'Inativo'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Voltar ao Painel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 24,
    paddingTop: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 14,
    color: '#a0a0a0',
    textTransform: 'uppercase',
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 20,
  },
  formCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
  },
  addButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'Montserrat_700Bold',
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
  serviceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  serviceName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  serviceDetails: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  statusButton: {
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statusButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
