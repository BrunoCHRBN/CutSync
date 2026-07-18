import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Scissors, UserRound } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { getErrorMessage } from '../../utils/errors';
import { supabase } from '../../services/supabase';
import { atmosphericShadow, colors, glassSurface, radii, typography } from '../../theme/tokens';
import { readableForeground } from '../../theme/color';
import { tapLight, tapSuccess } from '../../utils/haptics';
<<<<<<< HEAD
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';
import { PasswordInput } from '../../components/ui/PasswordInput';
import { PasswordStrengthChecklist } from '../../components/ui/PasswordStrengthChecklist';
=======
import { PublicBookingAuthModal } from '../../components/booking/PublicBookingAuthModal';
<<<<<<< HEAD
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
=======
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';
>>>>>>> 7148324c8eaef5800955c03c9aa7b36241bb480c

export default function BookingSlugScreen() {
  const { slug, reschedule_id } = useLocalSearchParams<{ slug: string; reschedule_id?: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { establishment: barbershop, loading: shopLoading } = useEstablishment(slug, 'slug');
  const { services, loading: servicesLoading } = useServices(barbershop?.id, true);
  const { team: barbers, loading: teamLoading } = usePublicTeam(barbershop?.id);
  const [barberServices, setBarberServices] = useState<{ professionalId: string; serviceId: string; price: number; durationMinutes: number; isActive: boolean }[]>([]);
  
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);

  useEffect(() => {
    if (reschedule_id) {
      void (async () => {
        const { data, error } = await supabase.from('appointments').select('service_id,professional_id').eq('id', reschedule_id).single();
        if (error) throw error;
        setSelectedService(data.service_id);
        setSelectedBarber(data.professional_id);
      })().catch((err: unknown) => {
        console.warn('Erro ao carregar dados de reagendamento:', err);
      });
    }
  }, [reschedule_id]);
  
  // Calendário em Grade Mensal (Grid)
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  
  const loading = shopLoading || servicesLoading || teamLoading;
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedSegments, setBookedSegments] = useState<{ start: number; end: number }[]>([]);

  // Estados de Autenticação Atrito Zero (Modal)
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authPasswordConfirmation, setAuthPasswordConfirmation] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  // Função auxiliar para resolver preço e duração com base no barbeiro selecionado (Fallback)
  const getServicePriceAndDuration = (serviceId: string | null, professionalId: string | null) => {
    if (!serviceId) return { price: 0, duration: 30, isActive: false };
    const globalSrv = services.find(s => s.id === serviceId);
    if (!globalSrv) return { price: 0, duration: 30, isActive: false };

    if (!professionalId) {
      return { price: globalSrv.price, duration: globalSrv.durationMinutes, isActive: true };
    }

    const custom = barberServices.find(bs => bs.professionalId === professionalId && bs.serviceId === serviceId);
    if (custom) {
      return { price: custom.price, duration: custom.durationMinutes, isActive: custom.isActive };
    }

    return { price: globalSrv.price, duration: globalSrv.durationMinutes, isActive: true };
  };

  // 1. Monitorar slots de tempo ocupados
  useEffect(() => {
    if (!selectedBarber || !selectedDate) {
      return;
    }

    const fetchBookedSegments = async () => {
      try {
        const startOfDay = new Date(selectedDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(selectedDate);
        endOfDay.setHours(23, 59, 59, 999);

        const { data: list, error } = await supabase.rpc('get_public_busy_slots', {
          target_professional_id: selectedBarber,
          range_start: startOfDay.toISOString(),
          range_end: endOfDay.toISOString(),
        });
        if (error) throw error;
<<<<<<< HEAD
        const segments = (list || []).map((slot: any) => {
=======
        const segments = (list || []).map((slot) => {
>>>>>>> 7148324c8eaef5800955c03c9aa7b36241bb480c
          const start = new Date(slot.date_time).getTime();
          return { start, end: start + Number(slot.duration_minutes) * 60 * 1000 };
        });

        setBookedSegments(segments);
      } catch (err) {
        console.error('Erro ao buscar horários ocupados:', err);
      }
    };

    fetchBookedSegments();
  }, [selectedBarber, selectedDate, services, barberServices]);

  const visibleBookedSegments = selectedBarber && selectedDate ? bookedSegments : [];

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
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Domingo
    
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

  // 2. Carregar personalizações de serviço por profissional
  useEffect(() => {
    if (!barbershop?.id) return;
    const fetchProfessionalServices = async () => {
      const { data, error } = await supabase.from('professional_services').select('*').eq('establishment_id', barbershop.id);
      if (error) { console.error('Erro ao buscar serviços por profissional:', error); return; }
      setBarberServices((data || []).map((item) => ({
        professionalId: item.professional_id, serviceId: item.service_id,
        price: Number(item.price), durationMinutes: Number(item.duration_minutes), isActive: Boolean(item.is_active),
      })));
      setSelectedDate((current) => current || new Date());
    };
    void fetchProfessionalServices();
  }, [barbershop?.id]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/salon/${slug}` as never);
    }
  };

  const executeBooking = async (clientId: string) => {
    if (!selectedBarber || !selectedService || !selectedDate || !selectedTime || !barbershop) return;
    setBookingLoading(true);
    try {
      const appointmentDate = new Date(selectedDate);
      const [hours, minutes] = selectedTime.split(':');
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      let targetAppointmentId = '';
      if (reschedule_id) {
        const { error } = await supabase.rpc('reschedule_appointment', {
          target_appointment_id: reschedule_id,
          requested_date_time: appointmentDate.toISOString(),
          requested_professional_id: selectedBarber,
          requested_service_id: selectedService,
        });
        if (error) throw error;
        targetAppointmentId = reschedule_id;
      } else {
<<<<<<< HEAD
<<<<<<< HEAD
        const { data, error } = await supabase.rpc('create_appointment', {
          target_establishment_id: barbershop!.id,
=======
        const { data, error } = await supabase.rpc('create_appointment', {
          target_establishment_id: barbershop.id,
>>>>>>> 7148324c8eaef5800955c03c9aa7b36241bb480c
          target_professional_id: selectedBarber,
          target_service_id: selectedService,
          target_date_time: appointmentDate.toISOString(),
          target_client_name: null,
          target_client_id: clientId,
        });
<<<<<<< HEAD
=======
        const { data, error } = await supabase.from('appointments').insert({
          establishment_id: barbershop.id, client_id: clientId,
          professional_id: selectedBarber, service_id: selectedService,
          date_time: appointmentDate.toISOString(), status: 'pending', reschedule_count: 0,
        }).select('id').single();
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
        if (error) throw error;
        targetAppointmentId = data as string;
=======
        if (error) throw error;
        targetAppointmentId = data;
>>>>>>> 7148324c8eaef5800955c03c9aa7b36241bb480c
      }

      if (barbershop?.name) {
        await scheduleAppointmentNotification(targetAppointmentId, barbershop.name, appointmentDate);
      }

      tapSuccess();
      displayAlert('Sucesso', 'Agendamento solicitado! O horário ficará pendente até a confirmação do estabelecimento.');
      router.replace(`/salon/${slug}` as never);
<<<<<<< HEAD
<<<<<<< HEAD
    } catch (error: any) {
      const conflict = error?.message?.includes('appointment_conflict') || error?.code === '23P01';
      displayAlert('Erro', conflict
        ? 'Esse horário acabou de ser reservado. Escolha outro horário.'
        : 'Não foi possível salvar o agendamento.');
=======
    } catch {
      displayAlert('Erro', 'Não foi possível salvar o agendamento.');
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
=======
    } catch (error: unknown) {
      const message = getErrorMessage(error, '');
      const conflict = message.includes('appointment_conflict');
      displayAlert('Erro', conflict
        ? 'Esse horário acabou de ser reservado. Escolha outro horário.'
        : 'Não foi possível salvar o agendamento.');
>>>>>>> 7148324c8eaef5800955c03c9aa7b36241bb480c
    } finally {
      setBookingLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime) {
      displayAlert('Atenção', 'Por favor, selecione serviço, profissional, data e horário.');
      return;
    }

    if (!user) {
      // Se não estiver logado, abre o modal de autenticação sem senha/cadastro rápido!
      setIsAuthModalVisible(true);
      return;
    }

    await executeBooking(user.id);
  };

  // Fluxo Magic Link (Login sem Senha)
  const handleSendMagicLink = async () => {
    if (!authEmail) {
      displayAlert('E-mail obrigatório', 'Por favor, digite seu e-mail.');
      return;
    }

    setAuthLoading(true);
    try {
      const redirectUrl = Platform.OS === 'web' 
        ? window.location.origin + `/${slug}/booking`
        : 'cutsync://(client)';

      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: redirectUrl,
        }
      });

      if (error) throw error;

      setMagicLinkSent(true);
      displayAlert('Link enviado', 'Verifique sua caixa de entrada para o acesso rápido!');
    } catch (err: unknown) {
      displayAlert('Erro de conexão', getErrorMessage(err, 'Erro ao enviar link.'));
    } finally {
      setAuthLoading(false);
    }
  };

  // Fluxo de Cadastro e Login Clássico Simplificado
  const handleAuthSubmit = async () => {
    if (!authEmail || !authPassword || (isRegisterMode && !authName)) {
      displayAlert('Campos incompletos', 'Preencha todos os campos obrigatórios.');
      return;
    }
    if (isRegisterMode && !isStrongPassword(authPassword)) {
      displayAlert('Senha fraca', passwordPolicyMessage);
      return;
    }
    if (isRegisterMode && authPassword !== authPasswordConfirmation) {
      displayAlert('Senhas diferentes', 'Digite a mesma senha nos dois campos.');
      return;
    }

    setAuthLoading(true);
    try {
      if (isRegisterMode) {
        // Registrar novo usuário visitante
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              name: authName,
            }
          }
        });

        if (error) throw error;
        if (!data.user) throw new Error('Falha no cadastro.');

        displayAlert('Sucesso', 'Conta criada! Agendamento sendo concluído.');
        setIsAuthModalVisible(false);
        await executeBooking(data.user.id);
      } else {
        // Fazer login rápido
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        if (!data.user) throw new Error('Falha no login.');
        setIsAuthModalVisible(false);
        await executeBooking(data.user.id);
      }
    } catch (err: unknown) {
      displayAlert('Erro', getErrorMessage(err, 'Ocorreu um erro na autenticação.'));
    } finally {
      setAuthLoading(false);
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
          <Text style={styles.headerTitle}>{reschedule_id ? 'Reagendamento' : 'Agendamento online'}</Text>
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

                  const isBooked = visibleBookedSegments.some(
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
                <Text style={[styles.confirmButtonText, { color: primaryFg }]}>
                  {user ? (reschedule_id ? 'Confirmar reagendamento' : 'Confirmar agendamento') : 'Entrar e confirmar'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

<<<<<<< HEAD
      {/* Modal: Autenticação Rápida de Atrito Zero (Magic Link e Cadastro Rápido) */}
      <Modal visible={isAuthModalVisible} transparent animationType="slide">
        <View testID="public-booking-auth-overlay" style={styles.modalOverlay}>
          <View testID="public-booking-auth-modal" style={styles.modalCard}>
            <Text testID="public-booking-auth-title" style={styles.modalTitle}>Identifique-se</Text>
            <Text testID="public-booking-auth-description" style={styles.modalDesc}>Você precisa de uma conta rápida para concluir seu agendamento.</Text>

            {magicLinkSent ? (
              <View style={styles.magicLinkState}>
                <Text style={styles.magicSuccessTitle}>E-mail enviado!</Text>
                <Text style={styles.magicSuccessDesc}>
                  Enviamos um link de login rápido para {authEmail}. Abra o link e retorne aqui para finalizar o agendamento!
                </Text>
                <Pressable testID="public-booking-magic-link-dismiss-button"
                  style={({ pressed }) => [styles.modalBtn, { backgroundColor: primaryColor, marginTop: 16 }, pressed && styles.pressedScale]}
                  onPress={() => {
                    setMagicLinkSent(false);
                    setIsAuthModalVisible(false);
                  }}
                >
                  <Text style={[styles.modalBtnText, { color: primaryFg }]}>Entendi</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {/* Abas */}
                <View style={styles.authTabs}>
                  <TouchableOpacity testID="public-booking-magic-link-tab"
                    style={[styles.authTab, !isRegisterMode && styles.authTabActive]}
                    onPress={() => setIsRegisterMode(false)}
                  >
                    <Text style={[styles.authTabText, !isRegisterMode && styles.authTabTextActive]}>Sem senha</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID="public-booking-register-tab"
                    style={[styles.authTab, isRegisterMode && styles.authTabActive]}
                    onPress={() => setIsRegisterMode(true)}
                  >
                    <Text style={[styles.authTabText, isRegisterMode && styles.authTabTextActive]}>Criar conta</Text>
                  </TouchableOpacity>
                </View>

                {/* Formulário */}
                {isRegisterMode ? (
                  <>
                    <TextInput
                      testID="public-booking-register-name-input"
                      style={styles.modalInput}
                      placeholder="Seu nome completo"
                      placeholderTextColor={colors.textMuted}
                      value={authName}
                      onChangeText={setAuthName}
                    />
                    <TextInput
                      testID="public-booking-register-email-input"
                      style={styles.modalInput}
                      placeholder="E-mail"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      value={authEmail}
                      onChangeText={setAuthEmail}
                    />
                    <PasswordInput
                      testID="public-booking-register-password-input"
                      label="Senha"
                      placeholder="Crie uma senha forte"
                      value={authPassword}
                      onChangeText={setAuthPassword}
                      autoComplete="new-password"
                    />
                    <PasswordStrengthChecklist password={authPassword} testID="public-booking-register-password-checklist" />
                    <PasswordInput
                      testID="public-booking-register-password-confirm-input"
                      label="Confirmar senha"
                      placeholder="Repita sua senha"
                      value={authPasswordConfirmation}
                      onChangeText={setAuthPasswordConfirmation}
                      autoComplete="new-password"
                    />
                    <Pressable testID="public-booking-register-submit-button"
                      style={({ pressed }) => [styles.modalBtn, { backgroundColor: primaryColor }, pressed && styles.pressedScale]}
                      onPress={handleAuthSubmit}
                      disabled={authLoading || !isStrongPassword(authPassword) || authPassword !== authPasswordConfirmation}
                    >
                      {authLoading ? <ActivityIndicator color={primaryFg} /> : <Text style={[styles.modalBtnText, { color: primaryFg }]}>Criar e reservar</Text>}
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.magicLinkInfo}>
                      Digite seu e-mail abaixo. Você receberá um link de login imediato, sem senhas.
                    </Text>
                    <TextInput
                      testID="public-booking-magic-link-email-input"
                      style={styles.modalInput}
                      placeholder="Seu melhor e-mail"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="email-address"
                      value={authEmail}
                      onChangeText={setAuthEmail}
                    />
                    <Pressable testID="public-booking-magic-link-submit-button"
                      style={({ pressed }) => [styles.modalBtn, { backgroundColor: primaryColor }, pressed && styles.pressedScale]}
                      onPress={handleSendMagicLink}
                      disabled={authLoading}
                    >
                      {authLoading ? <ActivityIndicator color={primaryFg} /> : <Text style={[styles.modalBtnText, { color: primaryFg }]}>Enviar link de acesso</Text>}
                    </Pressable>
                  </>
                )}

                <TouchableOpacity testID="public-booking-auth-cancel-button"
                  style={styles.modalCancelBtn}
                  onPress={() => setIsAuthModalVisible(false)}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
=======
      <PublicBookingAuthModal
        visible={isAuthModalVisible}
        magicLinkSent={magicLinkSent}
        registerMode={isRegisterMode}
        loading={authLoading}
        email={authEmail}
        name={authName}
        password={authPassword}
        passwordConfirmation={authPasswordConfirmation}
        primaryColor={primaryColor}
        foregroundColor={primaryFg}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
        onPasswordConfirmationChange={setAuthPasswordConfirmation}
        onModeChange={setIsRegisterMode}
        onMagicLinkDismiss={() => { setMagicLinkSent(false); setIsAuthModalVisible(false); }}
        onMagicLinkSubmit={handleSendMagicLink}
        onAuthSubmit={handleAuthSubmit}
        onClose={() => setIsAuthModalVisible(false)}
      />
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9
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
