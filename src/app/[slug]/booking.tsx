import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Scissors, UserRound } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { useAvailableSlots } from '../../hooks/useAvailableSlots';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { getErrorMessage } from '../../utils/errors';
import { supabase } from '../../services/supabase';
import { atmosphericShadow, colors, glassSurface, radii, typography } from '../../theme/tokens';
import { readableForeground } from '../../theme/color';
import { tapLight, tapSuccess } from '../../utils/haptics';
import { PublicBookingAuthModal } from '../../components/booking/PublicBookingAuthModal';
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';
import { formatCalendarDate, getTodayInTimeZone } from '../../utils/dateTime';

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
  const {
    availableSlots,
    loading: availabilityLoading,
    error: availabilityError,
    emptyMessage,
    refresh: refreshAvailability,
  } = useAvailableSlots({
    establishmentId: barbershop?.id,
    professionalId: selectedBarber,
    serviceId: selectedService,
    date: selectedDate,
    appointmentId: user ? reschedule_id : null,
  });

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

  useEffect(() => {
    if (barbershop?.timezone) {
      const today = getTodayInTimeZone(barbershop.timezone);
      setSelectedDate(today);
      setViewDate(today);
    }
  }, [barbershop?.timezone]);

  useEffect(() => {
    if (selectedTime && !availabilityLoading && !availableSlots.some((slot) => slot.localTime === selectedTime)) {
      setSelectedTime(null);
    }
  }, [availabilityLoading, availableSlots, selectedTime]);

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
    const today = getTodayInTimeZone(barbershop?.timezone || 'America/Sao_Paulo');
    today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today);
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
      const freshSlots = await refreshAvailability();
      if (!freshSlots) throw new Error('availability_check_failed');
      const confirmedSlot = freshSlots.find((slot) => slot.available && slot.localTime === selectedTime);
      if (!confirmedSlot) throw new Error('appointment_conflict');
      const appointmentDate = new Date(confirmedSlot.startsAt);

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
        const { data, error } = await supabase.rpc('create_appointment', {
          target_establishment_id: barbershop.id,
          target_professional_id: selectedBarber,
          target_service_id: selectedService,
          target_date_time: appointmentDate.toISOString(),
          target_client_name: null,
          target_client_id: clientId,
        });
        if (error) throw error;
        targetAppointmentId = data;
      }

      if (barbershop?.name) {
        await scheduleAppointmentNotification(targetAppointmentId, barbershop.name, appointmentDate);
      }

      tapSuccess();
      displayAlert('Sucesso', 'Agendamento solicitado! O horário ficará pendente até a confirmação do estabelecimento.');
      router.replace(`/salon/${slug}` as never);
    } catch (error: unknown) {
      const message = getErrorMessage(error, '');
      const conflict = message.includes('appointment_conflict');
      const outsideAvailability = message.includes('appointment_outside_availability');
      displayAlert('Erro', conflict
        ? 'Esse horário acabou de ser reservado. Escolha outro horário.'
        : outsideAvailability
          ? 'Esse horário não está mais dentro da jornada disponível.'
          : 'Não foi possível salvar o agendamento.');
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

  const isToday = (date: Date) => formatCalendarDate(date) === formatCalendarDate(
    getTodayInTimeZone(barbershop?.timezone || 'America/Sao_Paulo'),
  );
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
                <Pressable testID="booking-previous-month-button" onPress={handlePrevMonth} style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressedScale]}>
                  <ChevronLeft color={colors.textSecondary} size={16} strokeWidth={1.8} />
                </Pressable>
                <Text style={styles.monthLabel}>{formattedMonthYearLabel}</Text>
                <Pressable testID="booking-next-month-button" onPress={handleNextMonth} style={({ pressed }) => [styles.monthNavButton, pressed && styles.pressedScale]}>
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
                      key={formatCalendarDate(date)}
                      testID={`booking-day-${formatCalendarDate(date)}`}
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
                {availabilityLoading ? (
                  <ActivityIndicator testID="booking-availability-loading" color={primaryColor} />
                ) : availabilityError ? (
                  <Text testID="booking-availability-error" style={styles.emptyText}>{availabilityError}</Text>
                ) : availableSlots.length === 0 ? (
                  <Text testID="booking-availability-empty" style={styles.emptyText}>{emptyMessage}</Text>
                ) : availableSlots.map((slot) => {
                  const isSelected = selectedTime === slot.localTime;
                  return (
                    <Pressable
                      key={slot.startsAt}
                      testID={`booking-time-${slot.localTime.replace(':', '-')}`}
                      style={({ pressed }) => [
                        styles.timeCard,
                        isSelected && { backgroundColor: primaryColor, borderColor: primaryColor },
                        pressed && styles.pressedScale,
                      ]}
                      onPress={() => { tapLight(); setSelectedTime(slot.localTime); }}
                    >
                      <Text testID={`booking-time-${slot.localTime.replace(':', '-')}-label`} style={[
                        styles.timeText,
                        isSelected && { color: primaryFg },
                      ]}>
                        {slot.localTime}
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
