import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Profile, Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { scheduleAppointmentNotification } from '../../services/notifications';

export default function BookingScreen() {
  const { t, i18n } = useTranslation();
  const { barbershopId } = useLocalSearchParams<{ barbershopId: string }>();
  const { user } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  
  // Date & Time selection states
  const [selectedDateId, setSelectedDateId] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Obter os próximos 5 dias a partir de hoje
  const getNextDays = () => {
    const days = [];
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    for (let i = 0; i < 5; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      
      let label = d.toLocaleDateString(locale, { weekday: 'short' });
      if (i === 0) label = i18n.language === 'en' ? 'Today' : 'Hoje';
      if (i === 1) label = i18n.language === 'en' ? 'Tomorrow' : 'Amanhã';

      days.push({
        id: d.toISOString().split('T')[0],
        date: d,
        label,
        dayStr: d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
      });
    }
    return days;
  };

  const nextDays = getNextDays();
  const availableTimes = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

  useEffect(() => {
    if (!barbershopId) {
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const b = await database.collections.get<Barbershop>('barbershops').find(barbershopId);
        setBarbershop(b);

        const sList = await database.collections
          .get<Service>('services')
          .query(Q.where('barbershop_id', barbershopId), Q.where('is_active', true))
          .fetch();
        setServices(sList);

        // Busca perfis vinculados que sejam barbeiros OU o próprio admin da barbearia
        const bList = await database.collections
          .get<Profile>('profiles')
          .query(
            Q.where('barbershop_id', barbershopId),
            Q.where('role', Q.oneOf(['barber', 'admin']))
          )
          .fetch();
        setBarbers(bList);

        // Selecionar primeiro dia por padrão
        if (nextDays.length > 0) {
          setSelectedDateId(nextDays[0].id);
        }

      } catch (err) {
        console.error('Erro ao buscar dados locais para agendamento:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [barbershopId]);

  const handleConfirmBooking = async () => {
    if (!selectedService) {
      displayAlert(t('common.attention'), 'Por favor, selecione um serviço.');
      return;
    }

    if (!selectedBarber) {
      displayAlert(t('common.attention'), 'Por favor, selecione um profissional.');
      return;
    }

    if (!selectedDateId || !selectedTime) {
      displayAlert(t('common.attention'), 'Por favor, escolha a data e o horário.');
      return;
    }

    if (!user) {
      displayAlert(t('common.error'), 'Login required.');
      return;
    }

    setBookingLoading(true);
    try {
      // Montar data e hora selecionadas
      const dateObj = nextDays.find(d => d.id === selectedDateId);
      if (!dateObj) throw new Error('Data inválida');

      const appointmentDate = new Date(dateObj.date);
      const [hours, minutes] = selectedTime.split(':');
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

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

      if (barbershop?.name) {
        await scheduleAppointmentNotification(newAppointmentId, barbershop.name, appointmentDate);
      }

      displayAlert(t('common.success'), t('booking.success_message'));
      
      sync();
      router.replace('/(client)');
    } catch (error) {
      displayAlert(t('common.error'), 'Could not save booking.');
    } finally {
      setBookingLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    const currencyCode = barbershop?.currency || 'BRL';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.headerTitle}>{t('booking.title')}</Text>
      <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>

      {/* Selecionar Serviço */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('booking.step_service')}</Text>
        {services.length === 0 ? (
          <Text style={styles.emptyText}>{t('booking.no_services')}</Text>
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
                <Text style={[styles.cardPrice, { color: primaryColor }]}>{formatPrice(item.price)}</Text>
                <Text style={styles.cardDuration}>{item.durationMinutes} min</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Selecionar Profissional */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('booking.step_barber')}</Text>
        {barbers.length === 0 ? (
          <Text style={styles.emptyText}>{t('booking.no_barbers')}</Text>
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
                <Text style={styles.cardSubText}>
                  {item.role === 'admin' ? 'PROPRIETÁRIO' : item.role.toUpperCase()}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      {/* Escolha do Dia */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Escolha o Dia</Text>
        <FlatList
          data={nextDays}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.dateCard,
                selectedDateId === item.id && [styles.cardActive, { borderColor: primaryColor }]
              ]}
              onPress={() => setSelectedDateId(item.id)}
            >
              <Text style={styles.dateLabel}>{item.label}</Text>
              <Text style={styles.dateDayStr}>{item.dayStr}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Escolha do Horário */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Escolha o Horário</Text>
        <View style={styles.timeGrid}>
          {availableTimes.map((time) => (
            <TouchableOpacity
              key={time}
              style={[
                styles.timeCard,
                selectedTime === time && [styles.timeCardActive, { backgroundColor: primaryColor }]
              ]}
              onPress={() => setSelectedTime(time)}
            >
              <Text style={[
                styles.timeText,
                selectedTime === time && { color: '#121212' }
              ]}>
                {time}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
          <Text style={styles.confirmButtonText}>{t('booking.button')}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>{t('common.back')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 12,
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
  dateCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginRight: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  dateLabel: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  dateDayStr: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingVertical: 12,
    width: '22%',
    alignItems: 'center',
  },
  timeCardActive: {
    borderWidth: 0,
  },
  timeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardActive: {
    borderWidth: 2,
  },
  cardName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
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
    fontSize: 10,
    marginTop: 6,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  confirmButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
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
