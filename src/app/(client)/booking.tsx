import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Profile, Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { scheduleAppointmentNotification } from '../../services/notifications';

export default function BookingScreen() {
  const { barbershopId } = useLocalSearchParams<{ barbershopId: string }>();
  const { user } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);

  useEffect(() => {
    if (!barbershopId) {
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        // Buscar barbearia
        const b = await database.collections.get<Barbershop>('barbershops').find(barbershopId);
        setBarbershop(b);

        // Buscar serviços ativos da barbearia
        const sList = await database.collections
          .get<Service>('services')
          .query(Q.where('barbershop_id', barbershopId), Q.where('is_active', true))
          .fetch();
        setServices(sList);

        // Buscar barbeiros da barbearia
        const bList = await database.collections
          .get<Profile>('profiles')
          .query(Q.where('barbershop_id', barbershopId), Q.where('role', 'barber'))
          .fetch();
        setBarbers(bList);

      } catch (err) {
        console.error('Erro ao buscar dados locais para agendamento:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [barbershopId]);

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedBarber) {
      Alert.alert('Atenção', 'Selecione um serviço e um profissional.');
      return;
    }

    if (!user) {
      Alert.alert('Erro', 'Você precisa estar logado para agendar.');
      return;
    }

    setBookingLoading(true);
    try {
      // Definir um horário padrão para testes (amanhã às 14h)
      const appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + 1);
      appointmentDate.setHours(14, 0, 0, 0);

      // Criar agendamento localmente no WatermelonDB
      let newAppointmentId = '';
      await database.write(async () => {
        const created = await database.collections.get('appointments').create((record: any) => {
          record.barbershopId = barbershopId;
          record.clientId = user.id;
          record.barberId = selectedBarber;
          record.serviceId = selectedService;
          record.dateTime = appointmentDate;
          record.status = 'pending';
        });
        newAppointmentId = created.id;
      });

      // Agendar notificação local offline
      if (barbershop?.name) {
        await scheduleAppointmentNotification(newAppointmentId, barbershop.name, appointmentDate);
      }

      Alert.alert('Sucesso!', 'Agendamento registrado offline! Sincronizando com o servidor...');
      
      // Dispara a sincronização
      sync();
      
      router.replace('/(client)');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar o agendamento localmente.');
    } finally {
      setBookingLoading(false);
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
      <Text style={styles.headerTitle}>Agendar Horário</Text>
      <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>

      {/* Selecionar Serviço */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Escolha o Serviço</Text>
        {services.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum serviço disponível.</Text>
        ) : (
          <FlatList
            data={services}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.card,
                  selectedService === item.id && [styles.cardActive, { borderColor: primaryColor }]
                ]}
                onPress={() => setSelectedService(item.id)}
              >
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={[styles.cardPrice, { color: primaryColor }]}>R$ {Number(item.price).toFixed(2)}</Text>
                <Text style={styles.cardDuration}>{item.durationMinutes} min</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Selecionar Profissional */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Escolha o Barbeiro</Text>
        {barbers.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum profissional disponível.</Text>
        ) : (
          <FlatList
            data={barbers}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.card,
                  selectedBarber === item.id && [styles.cardActive, { borderColor: primaryColor }]
                ]}
                onPress={() => setSelectedBarber(item.id)}
              >
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardSubText}>{item.role.toUpperCase()}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Horário Padrão Informativo */}
      <View style={styles.infoBox}>
        <Text style={styles.infoBoxText}>
          📅 Data do Teste: Amanhã às 14:00h
        </Text>
        <Text style={styles.infoBoxSubText}>
          (Em um fluxo de produção real, carregaríamos a grade de horários disponíveis livres do barbeiro).
        </Text>
      </View>

      {/* Botão de Confirmação */}
      <TouchableOpacity
        style={[styles.confirmButton, { backgroundColor: primaryColor }]}
        onPress={handleConfirmBooking}
        disabled={bookingLoading}
      >
        {bookingLoading ? (
          <ActivityIndicator color="#121212" />
        ) : (
          <Text style={styles.confirmButtonText}>Confirmar Agendamento</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>Voltar</Text>
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
    fontSize: 16,
    color: '#a0a0a0',
    fontFamily: 'Inter_400Regular',
    textTransform: 'uppercase',
  },
  barbershopName: {
    fontSize: 26,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'Montserrat_700Bold',
  },
  emptyText: {
    color: '#666',
  },
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 16,
    marginRight: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  cardActive: {
    borderWidth: 2,
  },
  cardName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
  },
  cardDuration: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  cardSubText: {
    color: '#a0a0a0',
    fontSize: 11,
    marginTop: 4,
  },
  infoBox: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 16,
    borderRadius: 8,
    marginBottom: 32,
  },
  infoBoxText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoBoxSubText: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
  },
  confirmButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
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
