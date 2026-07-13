import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Profile, Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { scheduleAppointmentNotification } from '../../services/notifications';

interface DayItem {
  id: string;
  date: Date;
  weekday: string;
  dayNum: string;
  monthName: string;
  year: number;
}

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
  const [currentMonthYearLabel, setCurrentMonthYearLabel] = useState<string>('');
  
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Gerar os próximos 30 dias de forma robusta e dinâmica
  const getNext30Days = (): DayItem[] => {
    const days: DayItem[] = [];
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      
      let weekday = d.toLocaleDateString(locale, { weekday: 'short' });
      const dayNum = d.toLocaleDateString(locale, { day: '2-digit' });
      const monthName = d.toLocaleDateString(locale, { month: 'long' });
      const year = d.getFullYear();

      days.push({
        id: d.toISOString().split('T')[0],
        date: d,
        weekday: weekday.toUpperCase().replace('.', ''),
        dayNum,
        monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        year,
      });
    }
    return days;
  };

  const next30Days = getNext30Days();
  const availableTimes = [
    '08:00', '09:00', '10:00', '11:00', 
    '13:00', '14:00', '15:00', '16:00', 
    '17:00', '18:00', '19:00', '20:00'
  ];

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

        const bList = await database.collections
          .get<Profile>('profiles')
          .query(
            Q.where('barbershop_id', barbershopId),
            Q.where('role', Q.oneOf(['barber', 'admin']))
          )
          .fetch();
        setBarbers(bList);

        // Selecionar o dia de hoje por padrão
        if (next30Days.length > 0) {
          const firstDay = next30Days[0];
          setSelectedDateId(firstDay.id);
          setCurrentMonthYearLabel(`${firstDay.monthName} ${firstDay.year}`);
        }

      } catch (err) {
        console.error('Erro ao buscar dados locais para agendamento:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [barbershopId]);

  // Atualiza o label do mês correspondente ao dia que o usuário seleciona
  const handleSelectDay = (day: DayItem) => {
    setSelectedDateId(day.id);
    setCurrentMonthYearLabel(`${day.monthName} ${day.year}`);
  };

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
      const dateObj = next30Days.find(d => d.id === selectedDateId);
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
      <View style={styles.cardContainer}>
        <Text style={styles.headerTitle}>{t('booking.title')}</Text>
        <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>

        {/* 1. Escolha de Serviço */}
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

        {/* 2. Escolha de Profissional */}
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

        {/* 3. Calendário de 30 Dias (Navegação por Mês) */}
        <View style={styles.section}>
          <View style={styles.calendarHeader}>
            <Text style={styles.sectionTitle}>Escolha o Dia</Text>
            <Text style={[styles.monthLabel, { color: primaryColor }]}>{currentMonthYearLabel}</Text>
          </View>
          
          <FlatList
            data={next30Days}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.calendarList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.dateCard,
                  selectedDateId === item.id && [styles.cardActive, { borderColor: primaryColor }]
                ]}
                onPress={() => handleSelectDay(item)}
              >
                <Text style={styles.dateLabel}>{item.weekday}</Text>
                <Text style={styles.dateDayStr}>{item.dayNum}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* 4. Escolha do Horário */}
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

        {/* Confirmar Agendamento */}
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
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  contentContainer: {
    padding: 16,
    paddingTop: 48,
    paddingBottom: 48,
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 600, // Limita a largura na Web para manter o design focado e premium
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
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
    letterSpacing: 1,
  },
  barbershopName: {
    fontSize: 26,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 28,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'Inter_600SemiBold',
  },
  emptyText: {
    color: '#666',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3a3a3c',
    padding: 16,
    marginRight: 12,
    minWidth: 120,
    alignItems: 'center',
    marginTop: 8,
  },
  calendarList: {
    paddingVertical: 4,
  },
  dateCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3a3a3c',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginRight: 8,
    minWidth: 62,
    alignItems: 'center',
  },
  dateLabel: {
    color: '#a0a0a0',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Inter_600SemiBold',
  },
  dateDayStr: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
    fontFamily: 'Montserrat_700Bold',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  timeCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#3a3a3c',
    paddingVertical: 10,
    width: '23%', // 4 colunas alinhadas por linha
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeCardActive: {
    borderWidth: 0,
  },
  timeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'Inter_600SemiBold',
  },
  cardActive: {
    borderWidth: 2.5,
    backgroundColor: '#1c1c1e',
  },
  cardName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 6,
  },
  cardDuration: {
    color: '#a0a0a0',
    fontSize: 11,
    marginTop: 2,
  },
  cardSubText: {
    color: '#a0a0a0',
    fontSize: 9,
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
    fontFamily: 'Montserrat_700Bold',
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
