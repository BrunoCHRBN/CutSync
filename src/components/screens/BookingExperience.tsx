import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, ChevronRight, Clock3, Scissors, UserRound } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { useAvailableSlots } from '../../hooks/useAvailableSlots';
import { supabase } from '../../services/supabase';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { BrandMark } from '../ui/BrandMark';
import { ChoiceCard } from '../ui/ChoiceCard';
import { ScreenBackground } from '../ui/ScreenBackground';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { formatCalendarDate, getTodayInTimeZone } from '../../utils/dateTime';

const toolsImage = 'https://images.unsplash.com/photo-1596362601603-b74f6ef166e4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Nzd8MHwxfHNlYXJjaHwxfHxoYWlyY3V0JTIwdG9vbHMlMjBzY2lzc29ycyUyMGNsaXBwZXJ8ZW58MHx8fHwxNzgzOTkxNzE1fDA&ixlib=rb-4.1.0&q=85';

export const BookingExperience = () => {
  const { barbershopId } = useLocalSearchParams<{ barbershopId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 940;
  const router = useRouter();
  const { user, profile } = useAuth();
  const { establishment: barbershop, loading: shopLoading } = useEstablishment(barbershopId);
  const { services, loading: servicesLoading } = useServices(barbershopId, true);
  const { team: barbers, loading: teamLoading } = usePublicTeam(barbershopId);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const {
    availableSlots,
    loading: availabilityLoading,
    error: availabilityError,
    emptyMessage,
    refresh: refreshAvailability,
  } = useAvailableSlots({
    establishmentId: barbershopId,
    professionalId: selectedBarber,
    serviceId: selectedService,
    date: selectedDate,
  });

  const triggerHaptic = () => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate(10);
    }
  };

  const barberOpacity = React.useRef(new Animated.Value(selectedService ? 1 : 0.48)).current;
  const barberTranslateY = React.useRef(new Animated.Value(selectedService ? 0 : 15)).current;

  const dateTimeOpacity = React.useRef(new Animated.Value(selectedBarber ? 1 : 0.48)).current;
  const dateTimeTranslateY = React.useRef(new Animated.Value(selectedBarber ? 0 : 15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(barberOpacity, {
        toValue: selectedService ? 1 : 0.48,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(barberTranslateY, {
        toValue: selectedService ? 0 : 15,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [barberOpacity, barberTranslateY, selectedService]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(dateTimeOpacity, {
        toValue: selectedBarber ? 1 : 0.48,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(dateTimeTranslateY, {
        toValue: selectedBarber ? 0 : 15,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dateTimeOpacity, dateTimeTranslateY, selectedBarber]);
  const loading = shopLoading || servicesLoading || teamLoading;
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');

  const dateOptions = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = getTodayInTimeZone(barbershop?.timezone || 'America/Sao_Paulo');
    date.setDate(date.getDate() + index);
    return date;
  }), [barbershop?.timezone]);

  useEffect(() => {
    if (barbershopId && barbershop?.timezone) {
      setSelectedDate(getTodayInTimeZone(barbershop.timezone));
    }
  }, [barbershop?.timezone, barbershopId]);

  useEffect(() => {
    if (selectedTime && !availabilityLoading && !availableSlots.some((slot) => slot.localTime === selectedTime)) {
      setSelectedTime(null);
    }
  }, [availabilityLoading, availableSlots, selectedTime]);

  const currentService = services.find((service) => service.id === selectedService);
  const currentBarber = barbers.find((barber) => barber.id === selectedBarber);
  const activeStep = !selectedService ? 1 : !selectedBarber ? 2 : !selectedDate || !selectedTime ? 3 : 4;
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);

  const chooseService = (id: string) => {
    triggerHaptic();
    setSelectedService(id);
    setSelectedTime(null);
    setError('');
  };

  const chooseBarber = (id: string) => {
    triggerHaptic();
    setSelectedBarber(id);
    setSelectedTime(null);
    setError('');
  };

  const chooseDate = (date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setError('');
  };

  const confirmBooking = async () => {
    setError('');
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime) {
      setError('Complete serviço, profissional, data e horário antes de confirmar.');
      return;
    }
    if (!user) {
      setError('Sua sessão expirou. Entre novamente para concluir o agendamento.');
      return;
    }

    setBookingLoading(true);
    try {
      const freshSlots = await refreshAvailability();
      if (!freshSlots) throw new Error('availability_check_failed');
      const confirmedSlot = freshSlots.find((slot) => slot.available && slot.localTime === selectedTime);
      if (!confirmedSlot) throw new Error('appointment_conflict');
      const appointmentDate = new Date(confirmedSlot.startsAt);
      const { data: appointmentId, error: rpcError } = await supabase.rpc('create_appointment', {
        target_establishment_id: barbershopId,
        target_professional_id: selectedBarber,
        target_service_id: selectedService,
        target_date_time: appointmentDate.toISOString(),
        target_client_name: profile?.name ?? null,
        target_client_id: user.id,
      });
      if (rpcError) throw rpcError;
      if (barbershop?.name && appointmentId) {
        await scheduleAppointmentNotification(appointmentId as string, barbershop.name, appointmentDate);
      }
      router.replace('/(client)');
    } catch (err) {
      console.error('[BookingExperience] create_appointment falhou:', err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('appointment_conflict')) {
        setSelectedTime(null);
        setError('Esse horário acabou de ser reservado. Escolha outro horário.');
      } else if (message.includes('appointment_outside_availability')) {
        setSelectedTime(null);
        setError('Esse horário não está mais dentro da jornada disponível. Escolha outro horário.');
      } else if (message.includes('availability_check_failed')) {
        setError('Não foi possível revalidar os horários. Tente novamente.');
      } else {
        setError('Não foi possível concluir agora. Sua seleção foi mantida para tentar novamente.');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <ScreenBackground testID="booking-loading-screen" style={styles.center}>
        <ActivityIndicator testID="booking-loading-indicator" color={colors.brand} size="large" />
        <Text testID="booking-loading-text" style={styles.loadingText}>Preparando horários disponíveis...</Text>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground testID="booking-screen">
      <View style={styles.topbar}>
        <Pressable testID="booking-back-button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(client)')} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={19} />
        </Pressable>
        <BrandMark compact testID="booking-brand" />
        <StatusBadge testID="booking-progress-status" label={`Etapa ${activeStep} de 4`} tone={activeStep === 4 ? 'success' : 'warning'} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text testID="booking-eyebrow" style={styles.eyebrow}>AGENDAMENTO ONLINE</Text>
            <Text testID="booking-title" style={styles.title}>Seu próximo corte,{`\n`}sem espera.</Text>
            <Text testID="booking-shop-name" style={styles.shopName}>{barbershop?.name || 'Barbearia'}</Text>
          </View>
          {isWide && (
            <ImageBackground testID="booking-hero-image" source={{ uri: toolsImage }} imageStyle={styles.heroImage} style={styles.heroImageBox}>
              <View style={styles.imageOverlay} />
            </ImageBackground>
          )}
        </View>

        <View style={[styles.contentGrid, isWide && styles.contentGridWide]}>
          <View style={styles.stepsColumn}>
            <AppCard testID="booking-service-step" style={styles.stepCard}>
              <StepHeader number="01" title="Escolha o serviço" active={activeStep === 1} complete={!!selectedService} />
              {services.length === 0 ? (
                <Text testID="booking-services-empty" style={styles.emptyText}>Nenhum serviço disponível no momento.</Text>
              ) : (
                <View style={styles.choiceGrid}>
                  {services.map((service) => (
                    <ChoiceCard
                      key={service.id}
                      testID={`booking-service-${service.id}`}
                      title={service.name}
                      subtitle={`${service.durationMinutes} minutos`}
                      meta={currency(service.price)}
                      selected={selectedService === service.id}
                      onPress={() => chooseService(service.id)}
                      icon={<Scissors color={colors.textSecondary} size={16} />}
                      style={styles.choiceCard}
                    />
                  ))}
                </View>
              )}
            </AppCard>

            <Animated.View style={{ opacity: barberOpacity, transform: [{ translateY: barberTranslateY }] }}>
              <AppCard testID="booking-barber-step" style={[styles.stepCard, !selectedService && styles.stepDisabled]}>
                <StepHeader number="02" title="Escolha o profissional" active={activeStep === 2} complete={!!selectedBarber} />
                <View style={styles.choiceGrid}>
                  {barbers.map((barber) => (
                    <ChoiceCard
                      key={barber.id}
                      testID={`booking-barber-${barber.id}`}
                      title={barber.name}
                      subtitle={barber.role === 'admin' ? 'Proprietário' : 'Profissional'}
                      selected={selectedBarber === barber.id}
                      onPress={() => selectedService && chooseBarber(barber.id)}
                      icon={<UserRound color={colors.textSecondary} size={16} />}
                      style={styles.choiceCard}
                    />
                  ))}
                </View>
              </AppCard>
            </Animated.View>

            <Animated.View style={{ opacity: dateTimeOpacity, transform: [{ translateY: dateTimeTranslateY }] }}>
              <AppCard testID="booking-datetime-step" style={[styles.stepCard, !selectedBarber && styles.stepDisabled]}>
                <StepHeader number="03" title="Data e horário" active={activeStep === 3} complete={!!selectedTime} />
                <Text style={styles.subsectionLabel}>Próximos 14 dias</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateList}>
                  {dateOptions.map((date) => {
                    const id = formatCalendarDate(date);
                    const selected = selectedDate?.toDateString() === date.toDateString();
                    return (
                      <Pressable
                        key={id}
                        testID={`booking-date-${id}`}
                        disabled={!selectedBarber}
                        onPress={() => chooseDate(date)}
                        style={({ pressed }) => [styles.dateCard, selected && styles.dateCardSelected, pressed && styles.pressed]}
                      >
                        <Text style={[styles.dateWeek, selected && styles.selectedInk]}>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</Text>
                        <Text style={[styles.dateDay, selected && styles.selectedInk]}>{date.getDate()}</Text>
                        <Text style={[styles.dateMonth, selected && styles.selectedInk]}>{date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.subsectionLabel, styles.timeLabel]}>Horários disponíveis</Text>
                <View style={styles.timeGrid}>
                  {availabilityLoading ? (
                    <ActivityIndicator testID="booking-availability-loading" color={colors.brand} />
                  ) : availabilityError ? (
                    <Text testID="booking-availability-error" style={styles.errorText}>{availabilityError}</Text>
                  ) : availableSlots.length === 0 ? (
                    <Text testID="booking-availability-empty" style={styles.emptyText}>{emptyMessage}</Text>
                  ) : availableSlots.map((slot) => {
                    const selected = selectedTime === slot.localTime;
                    return (
                      <Pressable
                        key={slot.startsAt}
                        testID={`booking-time-${slot.localTime.replace(':', '-')}`}
                        onPress={() => { setSelectedTime(slot.localTime); setError(''); }}
                        style={({ pressed }) => [
                          styles.timeCard,
                          selected && styles.timeCardSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Clock3 color={selected ? colors.ink : colors.textMuted} size={14} />
                        <Text testID={`booking-time-${slot.localTime.replace(':', '-')}-label`} style={[styles.timeText, selected && styles.selectedInk]}>{slot.localTime}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </AppCard>
            </Animated.View>
          </View>

          <View style={styles.summaryColumn}>
            <AppCard testID="booking-summary-card" style={styles.summaryCard} elevated>
              <Text testID="booking-summary-title" style={styles.summaryTitle}>Resumo do agendamento</Text>
              <Text style={styles.summaryDescription}>Confira os detalhes antes de enviar sua solicitação.</Text>

              <SummaryRow testID="booking-summary-service" label="Serviço" value={currentService?.name || 'Escolha um serviço'} />
              <SummaryRow testID="booking-summary-professional" label="Profissional" value={currentBarber?.name || 'Escolha um profissional'} />
              <SummaryRow
                testID="booking-summary-date"
                label="Data e hora"
                value={selectedDate && selectedTime
                  ? `${selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${selectedTime}`
                  : 'Escolha data e horário'}
              />

              <View style={styles.summaryTotal}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text testID="booking-summary-total" style={styles.totalValue}>{currentService ? currency(currentService.price) : '—'}</Text>
              </View>

              {!!error && <Text testID="booking-error-message" style={styles.errorText}>{error}</Text>}

              <AppButton
                label="Solicitar agendamento"
                testID="booking-confirm-button"
                onPress={confirmBooking}
                loading={bookingLoading}
                disabled={activeStep !== 4}
                fullWidth
                icon={<ChevronRight color={colors.ink} size={17} />}
              />
              <Text testID="booking-confirmation-note" style={styles.confirmationNote}>O horário ficará pendente até a confirmação da barbearia.</Text>
            </AppCard>
          </View>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
};

const StepHeader = ({ number, title, active, complete }: { number: string; title: string; active: boolean; complete: boolean }) => (
  <View style={styles.stepHeader}>
    <View style={[styles.stepNumber, active && styles.stepNumberActive, complete && styles.stepNumberComplete]}>
      {complete ? <Check color={colors.ink} size={14} strokeWidth={3} /> : <Text style={[styles.stepNumberText, active && styles.stepNumberTextActive]}>{number}</Text>}
    </View>
    <Text style={styles.stepTitle}>{title}</Text>
  </View>
);

const SummaryRow = ({ label, value, testID }: { label: string; value: string; testID: string }) => (
  <View testID={testID} style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={styles.summaryValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  topbar: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#09090BF2', zIndex: 2 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 20, paddingBottom: 70 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', gap: 24, marginTop: 22, marginBottom: 26 },
  heroCopy: { flex: 1, justifyContent: 'center', paddingVertical: 20 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 38, lineHeight: 42, letterSpacing: -1.8, marginTop: 12 },
  shopName: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: 12 },
  heroImageBox: { width: '38%', minHeight: 170, borderRadius: radii.lg, overflow: 'hidden' },
  heroImage: { borderRadius: radii.lg },
  imageOverlay: { position: 'absolute', inset: 0, backgroundColor: '#00000040' } as any,
  contentGrid: { gap: 18 },
  contentGridWide: { flexDirection: 'row', alignItems: 'flex-start' },
  stepsColumn: { flex: 1.7, gap: 14 },
  summaryColumn: { flex: 0.85, minWidth: 300 },
  stepCard: { gap: 18 },
  stepDisabled: { opacity: 0.48 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepNumber: { width: 30, height: 30, borderRadius: radii.sm, backgroundColor: colors.surfacePressed, alignItems: 'center', justifyContent: 'center' },
  stepNumberActive: { borderWidth: 1, borderColor: colors.brand },
  stepNumberComplete: { backgroundColor: colors.brand },
  stepNumberText: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10 },
  stepNumberTextActive: { color: colors.brand },
  stepTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.4 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choiceCard: { width: '48%', minWidth: 150, flexGrow: 1 },
  emptyText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  subsectionLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  dateList: { gap: 8, paddingVertical: 2 },
  dateCard: { width: 62, alignItems: 'center', paddingVertical: 10, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  dateCardSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  dateWeek: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase' },
  dateDay: { color: colors.text, fontFamily: typography.display, fontSize: 18, marginTop: 3 },
  dateMonth: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, textTransform: 'uppercase', marginTop: 2 },
  selectedInk: { color: colors.ink },
  timeLabel: { marginTop: 4 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeCard: { width: '23%', minWidth: 76, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 43, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  timeCardSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  timeCardDisabled: { opacity: 0.25 },
  timeText: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  summaryCard: { gap: 17 },
  summaryTitle: { color: colors.text, fontFamily: typography.display, fontSize: 19, letterSpacing: -0.5 },
  summaryDescription: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 17, marginTop: -8 },
  summaryRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  summaryLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 5 },
  summaryTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: radii.md, padding: 14 },
  totalLabel: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11 },
  totalValue: { color: colors.brand, fontFamily: typography.display, fontSize: 20 },
  errorText: { color: colors.danger, backgroundColor: colors.dangerSoft, borderRadius: radii.sm, padding: 11, fontFamily: typography.body, fontSize: 10, lineHeight: 15 },
  confirmationNote: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9, lineHeight: 14, textAlign: 'center' },
});