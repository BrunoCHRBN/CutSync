import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Scissors,
  Star,
  UserRound,
  UsersRound,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useEstablishmentRouteParams } from '../../hooks/use-establishment-route-params';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { useAvailableSlots } from '../../hooks/useAvailableSlots';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { supabase } from '../../services/supabase';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { buildMonthWeeks, CALENDAR_WEEKDAYS } from '../../utils/booking-calendar';
import { tapLight, tapSuccess } from '../../utils/haptics';
import { buildEstablishmentTheme } from '@cutsync/brand';
import {
  accentText,
  iconSoftBackground,
  logoRing,
  outlineSurface,
  primaryButton,
  selectedChip,
  selectedChipText,
  selectedSurface,
} from '../../theme/establishment-styles';
import { PublicBookingAuthModal } from '../booking/PublicBookingAuthModal';
import { EstablishmentThemeProvider } from '../../contexts/establishment-theme-context';
import { EstablishmentThemeScope } from '../theme/establishment-theme-scope';
import { isStrongPassword, passwordPolicyMessage } from '@cutsync/validation';
import { getBookingDateOptions, getTodayInTimeZone, translateAppointmentError } from '@cutsync/domain';
import { InlineNotice } from '../ui/InlineNotice';
import { AppButton } from '../ui/AppButton';
import { BookingStepper } from '../ui/BookingStepper';

const ANY_PROFESSIONAL = 'any';

export const EstablishmentBookingExperience = () => {
  const { width } = useWindowDimensions();
  const isMobileWeb = width < layout.mobileBreakpoint;
  const { by, identifier, slug, rescheduleId, initialProfessionalId, initialServiceId } = useEstablishmentRouteParams();
  const router = useRouter();
  const { user } = useAuth();

  const { establishment: barbershop, loading: shopLoading } = useEstablishment(identifier, by);
  const { services, loading: servicesLoading } = useServices(barbershop?.id, true);
  const { team: barbers, loading: teamLoading } = usePublicTeam(barbershop?.id);
  const [barberServices, setBarberServices] = useState<
    { professionalId: string; serviceId: string; price: number; durationMinutes: number; isActive: boolean }[]
  >([]);

  // ── WIZARD STEP STATE (1: Serviço, 2: Profissional, 3: Data & Horário, 4: Confirmação) ──
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  // Step transition animation — only opacity, useNativeDriver:false for web compat
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const pendingStep = useRef<1 | 2 | 3 | 4 | null>(null);

  // After wizardStep changes, fade in the new content
  useEffect(() => {
    if (pendingStep.current !== null) {
      pendingStep.current = null;
      stepOpacity.setValue(0);
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: false,
      }).start();
    }
  }, [wizardStep]);

  const animateStep = (newStep: 1 | 2 | 3 | 4) => {
    if (newStep === wizardStep) return;
    // Fade out current content, then switch step
    Animated.timing(stepOpacity, {
      toValue: 0,
      duration: 130,
      useNativeDriver: false,
    }).start(() => {
      pendingStep.current = newStep;
      setWizardStep(newStep);
    });
  };

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  const [didApplyDeepLinkPrefill, setDidApplyDeepLinkPrefill] = useState(false);

  useEffect(() => {
    if (!rescheduleId) return;
    void (async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('service_id,professional_id')
        .eq('id', rescheduleId)
        .single();
      if (error) throw error;
      setSelectedService(data.service_id);
      setSelectedBarber(data.professional_id);
      setWizardStep(3);
    })().catch((err: unknown) => {
      console.warn('Erro ao carregar dados de reagendamento:', err);
    });
  }, [rescheduleId]);

  useEffect(() => {
    if (rescheduleId || didApplyDeepLinkPrefill || servicesLoading || teamLoading) return;
    if (!initialServiceId && !initialProfessionalId) return;

    const serviceReady = Boolean(
      initialServiceId && services.some((service) => service.id === initialServiceId),
    );
    const professionalReady = Boolean(
      initialProfessionalId && barbers.some((barber) => barber.id === initialProfessionalId),
    );

    if (serviceReady && initialServiceId) setSelectedService(initialServiceId);
    if (professionalReady && initialProfessionalId) setSelectedBarber(initialProfessionalId);

    if (serviceReady && professionalReady) setWizardStep(3);
    else if (serviceReady) setWizardStep(2);

    setDidApplyDeepLinkPrefill(true);
  }, [
    barbers,
    didApplyDeepLinkPrefill,
    initialProfessionalId,
    initialServiceId,
    rescheduleId,
    services,
    servicesLoading,
    teamLoading,
  ]);

  // Calendar State
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  const loading = shopLoading || servicesLoading || teamLoading;
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const isAnyProfessional = selectedBarber === ANY_PROFESSIONAL;

  const {
    availableSlots,
    loading: availabilityLoading,
    error: availabilityError,
    emptyMessage,
    refresh: refreshAvailability,
  } = useAvailableSlots({
    establishmentId: barbershop?.id,
    professionalId: isAnyProfessional ? null : selectedBarber,
    serviceId: selectedService,
    date: selectedDate,
    appointmentId: user ? rescheduleId : null,
  });

  // Auth Modal State
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

  // Service price & duration resolution
  const getServicePriceAndDuration = (serviceId: string | null, professionalId: string | null) => {
    if (!serviceId) return { price: 0, duration: 30, isActive: false };
    const globalSrv = services.find((s) => s.id === serviceId);
    if (!globalSrv) return { price: 0, duration: 30, isActive: false };

    if (!professionalId) {
      return { price: globalSrv.price, duration: globalSrv.durationMinutes, isActive: true };
    }

    const custom = barberServices.find((bs) => bs.professionalId === professionalId && bs.serviceId === serviceId);
    if (custom) {
      return { price: custom.price, duration: custom.durationMinutes, isActive: custom.isActive };
    }

    return { price: globalSrv.price, duration: globalSrv.durationMinutes, isActive: true };
  };

  // Fetch barber custom services
  useEffect(() => {
    if (!barbershop?.id) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('professional_services')
        .select('professional_id, service_id, price, duration_minutes, is_active')
        .eq('is_active', true);

      if (error) return;
      if (active && data) {
        setBarberServices(
          data.map((item) => ({
            professionalId: item.professional_id,
            serviceId: item.service_id,
            price: Number(item.price),
            durationMinutes: item.duration_minutes,
            isActive: item.is_active,
          }))
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [barbershop?.id]);

  // Filtered barbers based on selected service
  const filteredBarbers = useMemo(() => {
    if (!selectedService) return barbers;
    return barbers.filter((b) => {
      const { isActive } = getServicePriceAndDuration(selectedService, b.id);
      return isActive;
    });
  }, [barbers, selectedService, barberServices, services]);

  const activeServiceObj = services.find((s) => s.id === selectedService);
  const activeBarberObj = barbers.find((b) => b.id === selectedBarber);

  const anyFromPrice = useMemo(() => {
    if (!selectedService || filteredBarbers.length === 0) return null;
    const prices = filteredBarbers
      .map((barber) => getServicePriceAndDuration(selectedService, barber.id).price)
      .filter((price) => typeof price === 'number' && price > 0);
    return prices.length > 0 ? Math.min(...prices) : null;
  }, [filteredBarbers, selectedService, barberServices, services]);

  const { price: summaryPrice } = getServicePriceAndDuration(
    selectedService,
    isAnyProfessional ? null : selectedBarber,
  );

  // Month navigation
  const handlePrevMonth = () => {
    const prev = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const today = getTodayInTimeZone(barbershop?.timezone || 'America/Sao_Paulo');
    if (prev.getFullYear() < today.getFullYear() || (prev.getFullYear() === today.getFullYear() && prev.getMonth() < today.getMonth())) {
      return;
    }
    setViewDate(prev);
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Month Grid computation
  const monthWeeks = useMemo(() => buildMonthWeeks(viewDate), [viewDate]);

  const isDateSelectable = (date: Date) => {
    const today = getTodayInTimeZone(barbershop?.timezone || 'America/Sao_Paulo');
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target >= today;
  };

  const formattedMonthYearLabel = useMemo(() => {
    return viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [viewDate]);
  const todayInShopTimeZone = getTodayInTimeZone(barbershop?.timezone || 'America/Sao_Paulo');
  const previousMonthDisabled = viewDate.getFullYear() === todayInShopTimeZone.getFullYear()
    && viewDate.getMonth() === todayInShopTimeZone.getMonth();
  const quickDates = useMemo(
    () => getBookingDateOptions(barbershop?.timezone || 'America/Sao_Paulo', 14),
    [barbershop?.timezone],
  );

  // Group slots by period
  const groupedSlots = useMemo(() => {
    const morning: typeof availableSlots = [];
    const afternoon: typeof availableSlots = [];
    const evening: typeof availableSlots = [];

    availableSlots.forEach((slot) => {
      const hour = parseInt(slot.localTime.split(':')[0], 10);
      if (hour < 12) morning.push(slot);
      else if (hour < 18) afternoon.push(slot);
      else evening.push(slot);
    });

    return { morning, afternoon, evening };
  }, [availableSlots]);

  const theme = useMemo(() => buildEstablishmentTheme(barbershop?.primaryColor), [barbershop?.primaryColor]);
  const primaryColor = theme.primary;
  const primaryForeground = theme.onPrimary;
  const profileSlug = slug || barbershop?.slug;

  const goBackFromBooking = () => {
    if (profileSlug) {
      router.push(`/${profileSlug}` as never);
      return;
    }
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(client)' as never);
  };

  // Booking Execution
  const executeBooking = async () => {
    setBookingLoading(true);
    setBookingError('');

    try {
      if (!selectedService || !selectedBarber || !selectedDate || !selectedTime || !barbershop) {
        throw new Error('Preencha todas as etapas antes de confirmar.');
      }

      const chosenSlot = availableSlots.find((s) => s.localTime === selectedTime);
      if (!chosenSlot) {
        throw new Error('O horário selecionado não está mais disponível.');
      }

      const resolvedProfessionalId = isAnyProfessional
        ? (chosenSlot.professionalId || filteredBarbers[0]?.id)
        : selectedBarber;
      if (!resolvedProfessionalId || resolvedProfessionalId === ANY_PROFESSIONAL) {
        throw new Error('Não foi possível definir o profissional para este horário.');
      }

      if (rescheduleId) {
        const latestSlots = await refreshAvailability(rescheduleId);
        const confirmedSlot = latestSlots?.find((slot) => (
          slot.available && slot.startsAt === chosenSlot.startsAt
        ));
        if (!confirmedSlot) throw new Error('appointment_conflict');
        const { error: rescheduleError } = await supabase.rpc('reschedule_appointment', {
          target_appointment_id: rescheduleId,
          requested_professional_id: resolvedProfessionalId,
          requested_service_id: selectedService,
          requested_date_time: confirmedSlot.startsAt,
        });
        if (rescheduleError) throw rescheduleError;
        tapSuccess();
        router.replace('/appointments?feedback=appointment_rescheduled' as never);
        return;
      }

      const { data: created, error: insertError } = await supabase.rpc('create_client_appointment', {
        target_establishment_id: barbershop.id,
        target_service_id: selectedService,
        target_professional_id: resolvedProfessionalId,
        target_date_time: chosenSlot.startsAt,
      }).single();

      if (insertError) throw insertError;

      tapSuccess();
      void scheduleAppointmentNotification(
        created.appointment_id,
        barbershop.name,
        new Date(chosenSlot.startsAt),
      );

      router.replace('/appointments?feedback=appointment_created' as never);
    } catch (err: unknown) {
      console.error('Booking execution error:', err);
      setBookingError(
        rescheduleId
          ? translateAppointmentError(err, 'Não foi possível concluir o reagendamento.')
          : err instanceof Error ? err.message : 'Erro ao processar agendamento.',
      );
    } finally {
      setBookingLoading(false);
    }
  };

  const handleConfirmBooking = () => {
    if (user) {
      void executeBooking();
    } else {
      setIsAuthModalVisible(true);
    }
  };

  const handleSendMagicLink = async () => {
    if (!authEmail.trim()) {
      displayAlert('Atenção', 'Informe seu e-mail.');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: authEmail.trim() });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: any) {
      displayAlert('Erro', err.message || 'Erro ao enviar código.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      displayAlert('Atenção', 'Preencha e-mail e senha.');
      return;
    }

    if (isRegisterMode) {
      if (!authName.trim()) {
        displayAlert('Atenção', 'Informe seu nome completo.');
        return;
      }
      if (authPassword !== authPasswordConfirmation) {
        displayAlert('Atenção', 'As senhas não coincidem.');
        return;
      }
      if (!isStrongPassword(authPassword)) {
        displayAlert('Senha Fraca', passwordPolicyMessage);
        return;
      }
    }

    setAuthLoading(true);
    try {
      if (isRegisterMode) {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { data: { name: authName.trim(), role: 'client' } },
        });
        if (error) throw error;
        if (data.user) {
          setIsAuthModalVisible(false);
          void executeBooking();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        if (data.user) {
          setIsAuthModalVisible(false);
          void executeBooking();
        }
      }
    } catch (err: any) {
      displayAlert('Erro de Autenticação', err.message || 'Falha na autenticação.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <EstablishmentThemeProvider primaryColor={barbershop?.primaryColor} establishmentId={barbershop?.id} establishmentName={barbershop?.name}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={styles.loadingText}>Carregando informações do agendamento...</Text>
        </View>
      </EstablishmentThemeProvider>
    );
  }

  return (
    <EstablishmentThemeProvider primaryColor={barbershop?.primaryColor} establishmentId={barbershop?.id} establishmentName={barbershop?.name}>
      <EstablishmentThemeScope style={styles.root}>
      {/* ─── TOPBAR NAV ─────────────────────────────────────────────── */}
      <View style={styles.topbar}>
        <View style={styles.topbarInner}>
          <Pressable style={styles.backBtn} onPress={goBackFromBooking}>
            <ArrowLeft size={16} color={colors.text} />
            <Text style={styles.backBtnText}>Voltar</Text>
          </Pressable>

          <Text style={[styles.topbarTitle, accentText(theme)]} numberOfLines={1}>
            {barbershop?.name || 'Novo Agendamento'}
          </Text>

          <View style={{ width: 60 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.mainWrapper}>
          {/* ─── SALON HERO CARD ────────────────────────────────────── */}
          <View style={styles.heroCard}>
            {barbershop?.bannerUrl ? (
              <Image source={{ uri: barbershop.bannerUrl }} style={styles.heroImg} contentFit="cover" />
            ) : (
              <View style={[styles.heroFallback, iconSoftBackground(theme)]}>
                <Scissors size={28} color={theme.primary} />
              </View>
            )}

            <View style={styles.heroInfoRow}>
              <View style={[styles.heroLogoCircle, logoRing(theme)]}>
                {barbershop?.logoUrl ? (
                  <Image source={{ uri: barbershop.logoUrl }} style={styles.logoImg} contentFit="cover" />
                ) : (
                  <Scissors size={20} color={theme.primary} />
                )}
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.salonName}>{barbershop?.name}</Text>
                <Text style={styles.salonAddress} numberOfLines={1}>
                  {barbershop?.address || 'Endereço não informado'}
                </Text>
              </View>

              <View style={styles.ratingBadge}>
                <Star size={11} color="#F5A524" fill="#F5A524" />
                <Text style={styles.ratingText}>
                  {barbershop?.averageRating ? Number(barbershop.averageRating).toFixed(1) : 'Novo'}
                </Text>
              </View>
            </View>
          </View>

          {/* ─── INTERACTIVE 4-STEP WIZARD TRACKER ──────────────────── */}
          <BookingStepper
            currentStep={wizardStep}
            accentColor={theme.primary}
            accentSoft={theme.soft}
            items={[
              { step: 1, label: 'Serviço', done: Boolean(selectedService) },
              { step: 2, label: 'Profissional', done: Boolean(selectedBarber) },
              { step: 3, label: 'Data e horário', done: Boolean(selectedDate && selectedTime) },
              { step: 4, label: 'Confirmação', done: false },
            ]}
            onStepPress={(step) => {
              tapLight();
              animateStep(step as 1 | 2 | 3 | 4);
            }}
          />

          {/* ─── PASSO 1: ESCOLHA O SERVIÇO ───────────────────────────── */}
          {wizardStep === 1 && (
            <Animated.View style={{ opacity: stepOpacity }}>
            <View style={styles.stepSection}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepEyebrow}>PASSO 1 DE 4</Text>
                <Text style={styles.stepTitle}>Qual serviço você deseja agendar?</Text>
                <Text style={styles.stepSubtitle}>Selecione uma das opções abaixo para prosseguir.</Text>
              </View>

              <View style={styles.servicesGrid}>
                {services.map((srv) => {
                  const isSelected = selectedService === srv.id;
                  return (
                    <Pressable
                      key={srv.id}
                      style={[styles.serviceCard, isSelected && selectedSurface(theme)]}
                      onPress={() => {
                        tapLight();
                        setSelectedService(srv.id);
                        if (selectedBarber && !getServicePriceAndDuration(srv.id, selectedBarber).isActive) {
                          setSelectedBarber(null);
                          setSelectedDate(null);
                        }
                        setSelectedTime(null);
                        // Auto advance to Step 2
                        animateStep(2);
                      }}
                    >
                      <View style={[styles.serviceIconBox, isSelected && iconSoftBackground(theme)]}>
                        <Scissors size={16} color={isSelected ? theme.primary : colors.textMuted} />
                      </View>

                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.serviceName}>{srv.name}</Text>
                        <Text style={styles.serviceMeta}>
                          <Clock size={11} color={colors.textMuted} /> {srv.durationMinutes} min
                        </Text>
                      </View>

                      <View style={[styles.priceTag, outlineSurface(theme)]}>
                        <Text style={[styles.priceTagText, accentText(theme)]}>R$ {Number(srv.price).toFixed(2)}</Text>
                      </View>

                      <ChevronRight size={16} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
            </Animated.View>
          )}

          {/* ─── PASSO 2: ESCOLHA O PROFISSIONAL ────────────────────── */}
          {wizardStep === 2 && (
            <Animated.View style={{ opacity: stepOpacity }}>
            <View style={styles.stepSection}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepEyebrow}>PASSO 2 DE 4</Text>
                <Text style={styles.stepTitle}>Com qual especialista prefere ser atendido?</Text>
                <Text style={styles.stepSubtitle}>
                  Serviço selecionado: <Text style={{ fontFamily: typography.bodyStrong, ...accentText(theme) }}>{activeServiceObj?.name}</Text>
                </Text>
              </View>

              <View style={styles.barbersGrid}>
                {filteredBarbers.length === 0 ? (
                  <View style={styles.emptyNotice}>
                    <Text style={styles.emptyNoticeText}>
                      Sem profissionais cadastrados especificamente para este serviço.
                    </Text>
                  </View>
                ) : (
                  <>
                    {filteredBarbers.length > 1 ? (
                      <Pressable
                        testID="client-booking-professional-any"
                        style={[styles.barberCard, isAnyProfessional && selectedSurface(theme)]}
                        onPress={() => {
                          tapLight();
                          setSelectedBarber(ANY_PROFESSIONAL);
                          setSelectedTime(null);
                          animateStep(3);
                        }}
                      >
                        <View style={[styles.barberAvatar, iconSoftBackground(theme)]}>
                          <UsersRound size={18} color={theme.primary} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.barberName}>Qualquer profissional</Text>
                          <Text style={styles.barberRole}>
                            Primeiro horário disponível
                            {anyFromPrice != null ? ` • a partir de R$ ${anyFromPrice.toFixed(2)}` : ''}
                          </Text>
                        </View>
                        <ChevronRight size={16} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                    {filteredBarbers.map((barber) => {
                      const isSelected = selectedBarber === barber.id;
                      const { price: customPrice } = getServicePriceAndDuration(selectedService, barber.id);

                      return (
                        <Pressable
                          key={barber.id}
                          style={[styles.barberCard, isSelected && selectedSurface(theme)]}
                          onPress={() => {
                            tapLight();
                            setSelectedBarber(barber.id);
                            setSelectedTime(null);
                            // Auto advance to Step 3
                            animateStep(3);
                          }}
                        >
                          <View style={[styles.barberAvatar, iconSoftBackground(theme)]}>
                            {barber.avatarUrl ? (
                              <Image source={{ uri: barber.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                            ) : (
                              <UserRound size={18} color={theme.primary} />
                            )}
                          </View>

                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={styles.barberName}>{barber.name}</Text>
                            <Text style={styles.barberRole}>
                              {barber.tituloProfissional || 'Especialista'}
                              {selectedService && customPrice > 0 ? ` • R$ ${customPrice}` : ''}
                            </Text>
                          </View>

                          <ChevronRight size={16} color={colors.textMuted} />
                        </Pressable>
                      );
                    })}
                  </>
                )}
              </View>

              <View style={styles.navRow}>
                <AppButton
                  label="← Voltar aos Serviços"
                  variant="ghost"
                  onPress={() => animateStep(1)}
                />
              </View>
            </View>
            </Animated.View>
          )}

          {/* ─── PASSO 3: ESCOLHA A DATA E HORÁRIO ──────────────────── */}
          {wizardStep === 3 && (
            <Animated.View style={{ opacity: stepOpacity }}>
            <View style={styles.stepSection}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepEyebrow}>PASSO 3 DE 4</Text>
                <Text style={styles.stepTitle}>Escolha a Data e o Horário</Text>
                <Text style={styles.stepSubtitle}>
                  Atendimento com{' '}
                  <Text style={{ fontFamily: typography.bodyStrong, ...accentText(theme) }}>
                    {isAnyProfessional ? 'Qualquer profissional' : (activeBarberObj?.name || 'Profissional')}
                  </Text>
                </Text>
              </View>

              {isMobileWeb ? (
                <View style={styles.quickDatesSection}>
                  <Text style={styles.quickDatesTitle}>Próximos dias</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickDatesRow}>
                    {quickDates.map((option) => {
                      const selected = selectedDate?.toISOString().slice(0, 10) === option.localDate;
                      return (
                        <Pressable
                          key={option.localDate}
                          accessibilityRole="radio"
                          accessibilityState={{ selected }}
                          accessibilityLabel={`${option.isToday ? 'Hoje, ' : ''}${option.weekdayLabel}, dia ${option.dayLabel} de ${option.monthLabel}`}
                          onPress={() => {
                            tapLight();
                            setSelectedDate(new Date(`${option.localDate}T12:00:00`));
                            setSelectedTime(null);
                          }}
                          style={[styles.quickDate, selected && selectedChip(theme)]}
                        >
                          <Text style={[styles.quickDateWeekday, selected && selectedChipText(theme)]}>{option.isToday ? 'Hoje' : option.weekdayLabel}</Text>
                          <Text style={[styles.quickDateDay, selected && selectedChipText(theme)]}>{option.dayLabel}</Text>
                          <Text style={[styles.quickDateMonth, selected && selectedChipText(theme)]}>{option.monthLabel}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <AppButton
                    label={showFullCalendar ? 'Ocultar calendário completo' : 'Ver calendário completo'}
                    variant="ghost"
                    size="sm"
                    onPress={() => setShowFullCalendar((current) => !current)}
                  />
                </View>
              ) : null}

              {/* Calendário mensal no desktop e sob demanda no mobile Web. */}
              {(!isMobileWeb || showFullCalendar) ? <View style={styles.calendarCard}>
                <View style={styles.calendarTitleRow}>
                  <Text style={styles.calendarMonthTitle}>{formattedMonthYearLabel}</Text>
                  <View style={styles.monthNav}>
                    <Pressable accessibilityLabel="Mês anterior" disabled={previousMonthDisabled} onPress={handlePrevMonth} style={[styles.monthNavBtn, previousMonthDisabled && styles.monthNavBtnDisabled]}>
                      <ChevronLeft size={16} color={colors.text} />
                    </Pressable>
                    <Pressable accessibilityLabel="Próximo mês" onPress={handleNextMonth} style={styles.monthNavBtn}>
                      <ChevronRight size={16} color={colors.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.weekHeaderRow}>
                  {CALENDAR_WEEKDAYS.map((day, idx) => (
                    <Text key={idx} style={styles.weekHeaderDay}>
                      {day}
                    </Text>
                  ))}
                </View>

                <View style={styles.daysGrid}>
                  {monthWeeks.map((week, weekIndex) => (
                    <View key={`week-${weekIndex}`} style={styles.weekRow}>
                      {week.map((date, dayIndex) => {
                        if (!date) return <View key={`empty-${dayIndex}`} style={styles.emptyDayCell} />;

                        const selectable = isDateSelectable(date);
                        const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();

                        return (
                          <Pressable
                            key={date.toISOString()}
                            disabled={!selectable}
                            style={[
                              styles.dayCell,
                              !selectable && styles.dayCellDisabled,
                              isSelected && selectedChip(theme),
                            ]}
                            onPress={() => {
                              tapLight();
                              setSelectedDate(date);
                              setSelectedTime(null);
                            }}
                          >
                            <Text
                              style={[
                                styles.dayCellText,
                                !selectable && styles.dayCellTextDisabled,
                                isSelected && selectedChipText(theme),
                              ]}
                            >
                              {date.getDate()}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View> : null}

              {/* Time Slots */}
              {selectedDate && (
                <View style={styles.timeSlotsBox}>
                  <Text style={styles.slotsTitle}>
                    Horários disponíveis para{' '}
                    {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}:
                  </Text>

                  {availabilityLoading ? (
                    <ActivityIndicator color={theme.primary} style={{ marginVertical: 20 }} />
                  ) : availabilityError ? (
                    <InlineNotice tone="danger" message={availabilityError} />
                  ) : availableSlots.length === 0 ? (
                    <InlineNotice tone="info" message={emptyMessage || 'Nenhum horário livre nesta data.'} />
                  ) : (
                    <View style={styles.timeSlotsContainer}>
                      {groupedSlots.morning.length > 0 && (
                        <View style={styles.periodGroup}>
                          <Text style={[styles.periodLabel, accentText(theme)]}>🌅 Manhã</Text>
                          <View style={styles.timeGrid}>
                            {groupedSlots.morning.map((slot) => {
                              const isSelected = selectedTime === slot.localTime;
                              return (
                                <Pressable
                                  key={slot.startsAt}
                                  style={[styles.timeChip, isSelected && selectedChip(theme)]}
                                  onPress={() => {
                                    tapLight();
                                    setSelectedTime(slot.localTime);
                                  }}
                                >
                                  <Text style={[styles.timeChipText, isSelected && selectedChipText(theme)]}>
                                    {slot.localTime}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {groupedSlots.afternoon.length > 0 && (
                        <View style={styles.periodGroup}>
                          <Text style={[styles.periodLabel, accentText(theme)]}>☀️ Tarde</Text>
                          <View style={styles.timeGrid}>
                            {groupedSlots.afternoon.map((slot) => {
                              const isSelected = selectedTime === slot.localTime;
                              return (
                                <Pressable
                                  key={slot.startsAt}
                                  style={[styles.timeChip, isSelected && selectedChip(theme)]}
                                  onPress={() => {
                                    tapLight();
                                    setSelectedTime(slot.localTime);
                                  }}
                                >
                                  <Text style={[styles.timeChipText, isSelected && selectedChipText(theme)]}>
                                    {slot.localTime}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {groupedSlots.evening.length > 0 && (
                        <View style={styles.periodGroup}>
                          <Text style={[styles.periodLabel, accentText(theme)]}>🌙 Noite</Text>
                          <View style={styles.timeGrid}>
                            {groupedSlots.evening.map((slot) => {
                              const isSelected = selectedTime === slot.localTime;
                              return (
                                <Pressable
                                  key={slot.startsAt}
                                  style={[styles.timeChip, isSelected && selectedChip(theme)]}
                                  onPress={() => {
                                    tapLight();
                                    setSelectedTime(slot.localTime);
                                  }}
                                >
                                  <Text style={[styles.timeChipText, isSelected && selectedChipText(theme)]}>
                                    {slot.localTime}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.navRowBetween}>
                <AppButton label="← Voltar ao Profissional" variant="ghost" onPress={() => animateStep(2)} />

                <AppButton
                  label="Avançar para Revisão →"
                  disabled={!selectedDate || !selectedTime}
                  style={primaryButton(theme)}
                  foregroundColor={theme.onPrimary}
                  onPress={() => animateStep(4)}
                />
              </View>
              {!selectedDate || !selectedTime ? <Text accessibilityLiveRegion="polite" style={styles.selectionHint}>Selecione uma data e um horário para continuar.</Text> : null}
            </View>
            </Animated.View>
          )}

          {/* ─── PASSO 4: REVISÃO E CONFIRMAÇÃO ─────────────────────── */}
          {wizardStep === 4 && (
            <Animated.View style={{ opacity: stepOpacity }}>
            <View style={styles.stepSection}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepEyebrow}>PASSO 4 DE 4</Text>
                <Text style={styles.stepTitle}>Revise e Confirme seu Agendamento</Text>
                <Text style={styles.stepSubtitle}>Confira todos os dados antes de finalizar a reserva.</Text>
              </View>

              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Estabelecimento:</Text>
                  <Text style={styles.summaryValue}>{barbershop?.name}</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Serviço:</Text>
                  <Text style={styles.summaryValue}>{activeServiceObj?.name}</Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Profissional:</Text>
                  <Text style={styles.summaryValue}>{isAnyProfessional ? 'Qualquer disponível' : (activeBarberObj?.name || '—')}</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Data:</Text>
                  <Text style={styles.summaryValue}>
                    {selectedDate?.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                  </Text>
                </View>

                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Horário:</Text>
                  <Text style={styles.summaryValue}>{selectedTime}</Text>
                </View>

                <View style={styles.summaryDivider} />

                <View style={styles.summaryTotalRow}>
                  <Text style={styles.summaryTotalLabel}>Valor Total:</Text>
                  <Text style={[styles.summaryTotalValue, accentText(theme)]}>R$ {summaryPrice.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.navRowBetween}>
                <AppButton label="← Alterar Data/Horário" variant="ghost" onPress={() => animateStep(3)} />

                <AppButton
                  label={bookingLoading ? 'Confirmando...' : user ? 'Confirmar Agendamento' : 'Entrar e Confirmar'}
                  style={[styles.confirmBtn, primaryButton(theme)]}
                  foregroundColor={theme.onPrimary}
                  disabled={bookingLoading}
                  onPress={handleConfirmBooking}
                />
              </View>
            </View>
            </Animated.View>
          )}

          {!!bookingError && <InlineNotice tone="danger" message={bookingError} />}
        </View>
      </ScrollView>

      {/* ─── PUBLIC BOOKING AUTH MODAL ─────────────────────────────── */}
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
        foregroundColor={primaryForeground}
        onEmailChange={setAuthEmail}
        onNameChange={setAuthName}
        onPasswordChange={setAuthPassword}
        onPasswordConfirmationChange={setAuthPasswordConfirmation}
        onModeChange={setIsRegisterMode}
        onMagicLinkDismiss={() => {
          setMagicLinkSent(false);
          setIsAuthModalVisible(false);
        }}
        onMagicLinkSubmit={handleSendMagicLink}
        onAuthSubmit={handleAuthSubmit}
        onClose={() => setIsAuthModalVisible(false)}
      />
      </EstablishmentThemeScope>
    </EstablishmentThemeProvider>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
   STYLES — Off-White Premium Design System
   ──────────────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: typography.body,
    color: colors.textSecondary,
  },
  topbar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E5DF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    zIndex: 10,
  },
  topbarInner: {
    maxWidth: layout.formMax,
    alignSelf: 'center',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backBtnText: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: colors.text,
  },
  topbarTitle: {
    fontSize: 15,
    fontFamily: typography.display,
  },
  scroll: {
    paddingBottom: 80,
  },
  mainWrapper: {
    maxWidth: layout.formMax,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 20,
  },

  /* Hero Card */
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    overflow: 'hidden',
  },
  heroImg: {
    height: 110,
    width: '100%',
  },
  heroFallback: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInfoRow: {
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroLogoCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: {
    width: '100%',
    height: '100%',
  },
  salonName: {
    fontSize: 15,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  salonAddress: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: '#E4E5DF',
  },
  ratingText: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },

  /* Interactive Step Tracker */
  stepTracker: {
    flexDirection: 'row',
    gap: 6,
  },
  stepPill: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.sm,
    alignItems: 'center',
  },
  stepPillActive: {
    borderWidth: 1.5,
  },
  stepPillDone: {
    borderColor: '#3F7A4C',
    backgroundColor: '#E9F2EA',
  },
  stepPillText: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  stepPillTextActive: {
    fontFamily: typography.bodyStrong,
  },

  /* Step Section */
  stepSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 20,
    gap: 16,
  },
  stepHeader: {
    gap: 4,
  },
  stepEyebrow: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: '#F5A524',
    letterSpacing: 1.4,
  },
  stepTitle: {
    fontSize: 18,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  stepSubtitle: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textSecondary,
  },

  /* Services Grid */
  servicesGrid: {
    gap: 8,
  },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 14,
  },
  serviceIconBox: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceName: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  serviceMeta: {
    fontSize: 11,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  priceTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  priceTagText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
  },

  /* Barbers Grid */
  barbersGrid: {
    gap: 8,
  },
  barberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 12,
  },
  barberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  barberName: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  barberRole: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  emptyNotice: {
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
  },
  emptyNoticeText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },

  /* Calendar Card */
  calendarCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 14,
    gap: 10,
  },
  quickDatesSection: { gap: 10 },
  quickDatesTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  quickDatesRow: { gap: 8, paddingBottom: 4 },
  quickDate: {
    width: 72,
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickDateWeekday: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'capitalize' },
  quickDateDay: { color: colors.text, fontFamily: typography.display, fontSize: 20, marginVertical: 2 },
  quickDateMonth: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, textTransform: 'capitalize' },
  calendarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMonthTitle: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
    textTransform: 'capitalize',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthNavBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnDisabled: { opacity: 0.35 },
  weekHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E5DF',
    paddingBottom: 6,
  },
  weekHeaderDay: {
    flex: 1,
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.textMuted,
    textAlign: 'center',
  },
  daysGrid: {
    rowGap: 4,
  },
  weekRow: {
    flexDirection: 'row',
  },
  emptyDayCell: {
    flex: 1,
    height: 48,
  },
  dayCell: {
    flex: 1,
    height: 48,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayCellText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  dayCellTextDisabled: {
    color: colors.textMuted,
  },

  /* Time Slots */
  timeSlotsBox: {
    gap: 10,
    marginTop: 4,
  },
  slotsTitle: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  timeSlotsContainer: {
    gap: 12,
  },
  periodGroup: {
    gap: 6,
  },
  periodLabel: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    minHeight: 48,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.sm,
  },
  selectionHint: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, textAlign: 'right' },
  timeChipText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },

  /* Nav Buttons Row */
  navRow: {
    flexDirection: 'row',
    marginTop: 8,
  },
  navRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },

  /* Summary Card */
  summaryCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: '#E4E5DF',
    padding: 16,
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: typography.body,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#E4E5DF',
    marginVertical: 2,
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  summaryTotalLabel: {
    fontSize: 14,
    fontFamily: typography.display,
    color: '#1A1A1E',
  },
  summaryTotalValue: {
    fontSize: 18,
    fontFamily: typography.display,
  },
  confirmBtn: {
    paddingHorizontal: 24,
  },
});
