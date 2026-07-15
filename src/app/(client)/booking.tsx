import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Platform, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Scissors, UserRound } from 'lucide-react-native';
import { database } from '../../database';
import { Service, Profile, Barbershop, Appointment, BarberService } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { atmosphericShadow, colors, glassSurface, radii, typography } from '../../theme/tokens';
import { readableForeground } from '../../theme/color';
import { tapLight, tapSuccess } from '../../utils/haptics';

export default function BookingScreen() {
  const { barbershopId } = useLocalSearchParams<{ barbershopId: string }>();
  const { user, profile } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [barberServices, setBarberServices] = useState<BarberService[]>([]);
  
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  
  // Calendário em Grade Mensal (Grid)
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedSegments, setBookedSegments] = useState<{ start: number; end: number }[]>([]);

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Função auxiliar para resolver preço e duração com base no barbeiro selecionado (Fallback)
  const getServicePriceAndDuration = (serviceId: string | null, barberId: string | null) => {
    if (!serviceId) return { price: 0, duration: 30, isActive: false };
    const globalSrv = services.find(s => s.id === serviceId);
    if (!globalSrv) return { price: 0, duration: 30, isActive: false };

    if (!barberId) {
      return { price: globalSrv.price, duration: globalSrv.durationMinutes, isActive: true };
    }

    const custom = barberServices.find(bs => bs.professionalId === barberId && bs.serviceId === serviceId);
    if (custom) {
      return { price: custom.price, duration: custom.durationMinutes, isActive: custom.isActive };
    }

    return { price: globalSrv.price, duration: globalSrv.durationMinutes, isActive: true };
  };

  // 1. Monitorar slots de tempo ocupados
  useEffect(() => {
    if (!selectedBarber || !selectedDate) {
      setBookedSegments([]);
      return;
    }

    const fetchBookedSegments = async () => {
      try {
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const list = await database.collections
          .get<Appointment>('appointments')
          .query(
            Q.where('professional_id', selectedBarber),
            Q.where('status', Q.notEq('cancelled')),
            Q.where('date_time', Q.between(startOfDay.getTime(), endOfDay.getTime()))
          )
          .fetch();

        const segments = [];
        for (const apt of list) {
          // Utiliza a duração correta do barbeiro que realizou o agendamento
          const { duration } = getServicePriceAndDuration(apt.serviceId, apt.professionalId);
          const startTime = new Date(apt.dateTime).getTime();
          const endTime = startTime + duration * 60 * 1000;
          segments.push({ start: startTime, end: endTime });
        }

        setBookedSegments(segments);
      } catch (err) {
        console.error('Erro ao buscar horários ocupados:', err);
      }
    };

    fetchBookedSegments();
  }, [selectedBarber, selectedDate, services, barberServices]);

  const availableTimes = [
    '08:00', '09:00', '10:00', '11:00', 
    '13:00', '14:00', '15:00', '16:00', 
    '17:00', '18:00', '19:00', '20:00'
  ];

  // Lógica de geração de dias do mês da grade
  const generateMonthGrid = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Domingo, 1 = Segunda...
    
    const grid: (Date | null)[] = [];
    
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.push(null);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push(new Date(year, month, day));
    }
    
    return grid;
  };

  const monthGrid = generateMonthGrid(viewDate.getFullYear(), viewDate.getMonth());

  // Validar se uma data específica é selecionável (hoje até 30 dias no futuro)
  const isDateSelectable = (date: Date | null) => {
    if (!date) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    maxDate.setHours(23, 59, 59, 999);
    
    return date >= today && date <= maxDate;
  };

  const handlePrevMonth = () => {
    tapLight();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    tapLight();
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // 2. Carregar informações iniciais da barbearia
  useEffect(() => {
    if (!barbershopId) {
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const b = await database.collections.get<Barbershop>('establishments').find(barbershopId);
        setBarbershop(b);

        const sList = await database.collections
          .get<Service>('services')
          .query(Q.where('establishment_id', barbershopId), Q.where('is_active', true))
          .fetch();
        setServices(sList);

        const bList = await database.collections
          .get<Profile>('profiles')
          .query(
            Q.where('establishment_id', barbershopId),
            Q.where('role', Q.oneOf(['professional', 'barber', 'admin']))
          )
          .fetch();
        setBarbers(bList);

        const bsList = await database.collections
          .get<BarberService>('professional_services')
          .query(Q.where('establishment_id', barbershopId))
          .fetch();
        setBarberServices(bsList);

        // Selecionar o dia de hoje por padrão
        const today = new Date();
        setSelectedDate(today);

      } catch (err) {
        console.error('Erro ao buscar dados locais para agendamento:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [barbershopId]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(client)');
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedService) {
      displayAlert('Atenção', 'Por favor, selecione um serviço.');
      return;
    }

    if (!selectedBarber) {
      displayAlert('Atenção', 'Por favor, selecione um profissional.');
      return;
    }

    if (!selectedDate || !selectedTime) {
      displayAlert('Atenção', 'Por favor, escolha a data e o horário.');
      return;
    }

    if (!user) {
      displayAlert('Erro', 'Sua sessão expirou. Entre novamente para concluir o agendamento.');
      return;
    }

    setBookingLoading(true);
    try {
      const appointmentDate = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':');
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      let newAppointmentId = '';
      await database.write(async () => {
        const created = await database.collections.get('appointments').create((record: any) => {
          record.establishmentId = barbershopId;
          record.clientId = user.id;
          record.clientName = profile?.name || 'Cliente';
          record.professionalId = selectedBarber;
          record.serviceId = selectedService;
          record.dateTime = appointmentDate;
          record.status = 'pending';
        });
        newAppointmentId = created.id;
      });

      if (barbershop?.name) {
        await scheduleAppointmentNotification(newAppointmentId, barbershop.name, appointmentDate);
      }

      tapSuccess();
      displayAlert('Sucesso', 'Agendamento solicitado! O horário ficará pendente até a confirmação do estabelecimento.');
      
      sync();
      router.replace('/(client)');
    } catch (error) {
      displayAlert('Erro', 'Não foi possível salvar o agendamento.');
    } finally {
      setBookingLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    const currencyCode = barbershop?.currency || 'BRL';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  };

  const monthYearLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const formattedMonthYearLabel = monthYearLabel.charAt(0).toUpperCase() + monthYearLabel.slice(1);

  const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Preparando horários disponíveis...</Text>
      </View>
    );
  }

  const primaryColor = barbershop?.primaryColor || colors.accent;
  const primaryFg = readableForeground(primaryColor);

  // Filtrar barbeiros que realizam o serviço selecionado
  const filteredBarbers = barbers.filter(b => {
    if (!selectedService) return true;
    const { isActive } = getServicePriceAndDuration(selectedService, b.id);
    return isActive;
  });

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString();
  const summaryReady = !!(selectedService && selectedBarber && selectedDate && selectedTime);
  const { price: summaryPrice } = getServicePriceAndDuration(selectedService, selectedBarber);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable testID="booking-back-button" onPress={handleBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressedScale]}>
          <ArrowLeft color={colors.text} size={18} strokeWidth={1.8} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Agendamento online</Text>
          <Text numberOfLines={1} style={styles.barbershopName}>{barbershop?.name}</Text>
        </View>
      </View>

      <View style={styles.innerContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* 1. Escolha do Serviço */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>Etapa 01</Text>
            <Text style={styles.sectionTitle}>Escolha o serviço</Text>
            {services.map((item) => {
              const active = selectedService === item.id;
              return (
                <Pressable
                  key={item.id}
                  testID={`booking-service-${item.id}`}
                  style={({ pressed }) => [
                    styles.card,
                    active && { borderColor: primaryColor, borderWidth: 1.5 },
                    pressed && styles.pressedScale,
                  ]}
                  onPress={() => {
                    tapLight();
                    setSelectedService(item.id);
                    // Reseta barbeiro se ele não realizar o novo serviço escolhido
                    if (selectedBarber) {
                      const { isActive } = getServicePriceAndDuration(item.id, selectedBarber);
                      if (!isActive) setSelectedBarber(null);
                    }
                    setSelectedTime(null);
                  }}
                >
                  <View style={styles.cardIcon}>
                    <Scissors color={colors.textSecondary} size={14} strokeWidth={1.6} />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardSubText}>
                      {formatPrice(item.price)} · {item.durationMinutes} min
                    </Text>
                  </View>
                  {active && (
                    <View style={[styles.checkCircle, { backgroundColor: primaryColor }]}>
                      <Check color={primaryFg} size={12} strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* 2. Escolha do Profissional */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>Etapa 02</Text>
            <Text style={styles.sectionTitle}>Escolha o profissional</Text>
            {filteredBarbers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Sem profissionais disponíveis para este serviço.</Text>
              </View>
            ) : (
              filteredBarbers.map((item) => {
                const { price: customPrice } = getServicePriceAndDuration(selectedService, item.id);
                const active = selectedBarber === item.id;
                return (
                  <Pressable
                    key={item.id}
                    testID={`booking-barber-${item.id}`}
                    style={({ pressed }) => [
                      styles.card,
                      active && { borderColor: primaryColor, borderWidth: 1.5 },
                      pressed && styles.pressedScale,
                    ]}
                    onPress={() => {
                      tapLight();
                      setSelectedBarber(item.id);
                      setSelectedTime(null);
                    }}
                  >
                    <View style={styles.cardIcon}>
                      <UserRound color={colors.textSecondary} size={14} strokeWidth={1.6} />
                    </View>
                    <View style={styles.cardCopy}>
                      <Text style={styles.cardName}>{item.name}</Text>
                      <Text style={styles.cardSubText}>
                        {item.tituloProfissional || 'Especialista'}
                        {selectedService && customPrice > 0 ? ` · ${formatPrice(customPrice)}` : ''}
                      </Text>
                    </View>
                    {active && (
                      <View style={[styles.checkCircle, { backgroundColor: primaryColor }]}>
                        <Check color={primaryFg} size={12} strokeWidth={3} />
                      </View>
                    )}
                  </Pressable>
                );
              })
            )}
          </View>

          {/* 3. Escolha do Dia (Calendário estilo Fresha) */}
          <View style={styles.section}>
            <Text style={styles.sectionEyebrow}>Etapa 03</Text>
            <View style={styles.calendarHeader}>
              <Text style={styles.sectionTitle}>Escolha o dia</Text>
              <View style={styles.monthSelector}>
                <Pressable onPress={handlePrevMonth} style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressedScale]}>
                  <ChevronLeft color={colors.textSecondary} size={16} strokeWidth={1.8} />
                </Pressable>
                <Text style={styles.monthLabel}>{formattedMonthYearLabel}</Text>
                <Pressable onPress={handleNextMonth} style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressedScale]}>
                  <ChevronRight color={colors.textSecondary} size={16} strokeWidth={1.8} />
                </Pressable>
              </View>
            </View>

            <View style={styles.calendarCard}>
              <View style={styles.weekDaysRow}>
                {weekDays.map((wd, index) => (
                  <Text key={index} style={styles.weekDayText}>{wd}</Text>
                ))}
              </View>

              <View style={styles.daysRow}>
                {monthGrid.map((date, index) => {
                  if (!date) {
                    return <View key={`empty-${index}`} style={styles.dayCellEmpty} />;
                  }

                  const selectable = isDateSelectable(date);
                  const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();
                  const today = isToday(date);

                  return (
                    <Pressable
                      key={date.toISOString()}
                      testID={`booking-day-${date.toISOString().split('T')[0]}`}
                      style={({ pressed }) => [styles.dayCell, pressed && selectable && styles.pressedScale]}
                      onPress={() => { if (selectable) { tapLight(); setSelectedDate(date); setSelectedTime(null); } }}
                      disabled={!selectable}
                    >
                      <View style={[
                        styles.dayCircle,
                        today && !isSelected && styles.dayCircleToday,
                        isSelected && { backgroundColor: primaryColor },
                      ]}>
                        <Text style={[
                          styles.dayCellText,
                          !selectable && styles.dayCellTextDisabled,
                          isSelected && { color: primaryFg, fontFamily: typography.bodyStrong },
                        ]}>
                          {date.getDate()}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* 4. Escolha do Horário */}
          {selectedBarber && selectedService && selectedDate && (
            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>Etapa 04</Text>
              <Text style={styles.sectionTitle}>Escolha o horário</Text>
              <View style={styles.timeGrid}>
                {availableTimes.map((time) => {
                  const { duration: durationMinutes } = getServicePriceAndDuration(selectedService, selectedBarber);

                  const slotDate = new Date(selectedDate);
                  const [hours, minutes] = time.split(':');
                  slotDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                  
                  const slotStart = slotDate.getTime();
                  const slotEnd = slotStart + durationMinutes * 60 * 1000;

                  const isBooked = bookedSegments.some(
                    (seg) => slotStart < seg.end && slotEnd > seg.start
                  );
                  const isSelected = selectedTime === time;

                  return (
                    <Pressable
                      key={time}
                      testID={`booking-time-${time.replace(':', '-')}`}
                      style={({ pressed }) => [
                        styles.timeCard,
                        isSelected && { backgroundColor: primaryColor, borderColor: primaryColor },
                        isBooked && styles.timeCardDisabled,
                        pressed && !isBooked && styles.pressedScale,
                      ]}
                      onPress={() => { if (!isBooked) { tapLight(); setSelectedTime(time); } }}
                      disabled={isBooked}
                    >
                      <Text style={[
                        styles.timeText,
                        isSelected && { color: primaryFg },
                        isBooked && styles.timeTextDisabled
                      ]}>
                        {time}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Barra flutuante de confirmação */}
      {summaryReady && (
        <View style={styles.floatingWrap} pointerEvents="box-none">
          <View style={styles.floatingBar}>
            <View style={styles.floatingCopy}>
              <Text style={styles.floatingEyebrow}>
                {selectedDate?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')} · {selectedTime}
              </Text>
              <Text numberOfLines={1} style={styles.floatingTitle}>{formatPrice(summaryPrice)}</Text>
            </View>
            <Pressable
              testID="booking-confirm-button"
              onPress={handleConfirmBooking}
              disabled={bookingLoading}
              style={({ pressed }) => [styles.confirmButton, { backgroundColor: primaryColor }, pressed && styles.pressedScale, bookingLoading && { opacity: 0.7 }]}
            >
              {bookingLoading ? (
                <ActivityIndicator color={primaryFg} />
              ) : (
                <Text style={[styles.confirmButtonText, { color: primaryFg }]}>Confirmar agendamento</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  innerContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 26,
    paddingBottom: 140,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    borderBottomWidth: hairlineW,
    borderBottomColor: colors.hairline,
    ...glassSurface,
    zIndex: 3,
  },
  backButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 8,
    color: colors.labelSoft,
    fontFamily: typography.bodyStrong,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  barbershopName: {
    fontSize: 16,
    color: colors.text,
    fontFamily: typography.display,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  section: {
    marginBottom: 34,
  },
  sectionEyebrow: {
    color: colors.labelSoft,
    fontFamily: typography.bodyStrong,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 2.2,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    color: colors.text,
    fontFamily: typography.display,
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 15,
    marginBottom: 9,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    ...atmosphericShadow,
  },
  cardIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.canvas,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
  },
  cardCopy: { flex: 1, minWidth: 0 },
  cardName: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.bodyStrong,
  },
  cardSubText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.body,
    marginTop: 3,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radii.lg,
    padding: 18,
    alignItems: 'center',
    borderWidth: hairlineW,
    borderColor: colors.hairline,
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 11,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  monthNavButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
  },
  monthLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.bodyStrong,
    minWidth: 110,
    textAlign: 'center',
  },
  calendarCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: 14,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    ...atmosphericShadow,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  weekDayText: {
    color: colors.labelSoft,
    width: '14.28%',
    textAlign: 'center',
    fontSize: 9,
    fontFamily: typography.bodyStrong,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  daysRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dayCellText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: typography.body,
  },
  dayCellTextDisabled: {
    color: colors.textMuted,
    opacity: 0.4,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeCard: {
    width: '23%',
    minWidth: 72,
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
    paddingVertical: 11,
    alignItems: 'center',
    ...atmosphericShadow,
  },
  timeCardDisabled: {
    backgroundColor: colors.canvas,
    opacity: 0.35,
  },
  timeText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: typography.bodyStrong,
  },
  timeTextDisabled: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  floatingWrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 10 },
  floatingBar: {
    width: '100%',
    maxWidth: 560,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    paddingVertical: 12,
    paddingHorizontal: 18,
    ...glassSurface,
    ...Platform.select({
      web: { boxShadow: '0 16px 44px rgba(0,0,0,0.10)' } as any,
      default: { elevation: 9, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  floatingCopy: { flex: 1, minWidth: 0 },
  floatingEyebrow: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.6, textTransform: 'uppercase' },
  floatingTitle: { color: colors.text, fontFamily: typography.display, fontSize: 16, letterSpacing: -0.4, marginTop: 2 },
  confirmButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: radii.pill,
  },
  confirmButtonText: {
    fontFamily: typography.bodyStrong,
    fontSize: 13,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  pressedScale: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
