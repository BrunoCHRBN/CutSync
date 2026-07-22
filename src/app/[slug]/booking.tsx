import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  Scissors,
  Star,
  UserRound,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { useAvailableSlots } from '../../hooks/useAvailableSlots';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { supabase } from '../../services/supabase';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { tapLight, tapSuccess } from '../../utils/haptics';
import { PublicBookingAuthModal } from '../../components/booking/PublicBookingAuthModal';
import { isStrongPassword, passwordPolicyMessage } from '../../utils/passwordPolicy';
import { formatCalendarDate, getTodayInTimeZone } from '../../utils/dateTime';
import { InlineNotice } from '../../components/ui/InlineNotice';
import { AppButton } from '../../components/ui/AppButton';

export default function BookingSlugScreen() {
  const { slug, reschedule_id } = useLocalSearchParams<{ slug: string; reschedule_id?: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const { establishment: barbershop, loading: shopLoading } = useEstablishment(slug, 'slug');
  const { services, loading: servicesLoading } = useServices(barbershop?.id, true);
  const { team: barbers, loading: teamLoading } = usePublicTeam(barbershop?.id);
  const [barberServices, setBarberServices] = useState<
    { professionalId: string; serviceId: string; price: number; durationMinutes: number; isActive: boolean }[]
  >([]);

  // ── WIZARD STEP STATE (1: Serviço, 2: Profissional, 3: Data & Horário, 4: Confirmação) ──
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);

  // Reschedule listener
  useEffect(() => {
    if (reschedule_id) {
      void (async () => {
        const { data, error } = await supabase
          .from('appointments')
          .select('service_id,professional_id')
          .eq('id', reschedule_id)
          .single();
        if (error) throw error;
        setSelectedService(data.service_id);
        setSelectedBarber(data.professional_id);
        setWizardStep(3);
      })().catch((err: unknown) => {
        console.warn('Erro ao carregar dados de reagendamento:', err);
      });
    }
  }, [reschedule_id]);

  // Calendar State
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);

  const loading = shopLoading || servicesLoading || teamLoading;
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const {
    availableSlots,
    loading: availabilityLoading,
    error: availabilityError,
    emptyMessage,
  } = useAvailableSlots({
    establishmentId: barbershop?.id,
    professionalId: selectedBarber,
    serviceId: selectedService,
    date: selectedDate,
    appointmentId: user ? reschedule_id : null,
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

  const { price: summaryPrice } = getServicePriceAndDuration(selectedService, selectedBarber);

  // Month navigation
  const handlePrevMonth = () => {
    const prev = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const today = getTodayInTimeZone(barbershop?.time_zone || 'America/Sao_Paulo');
    if (prev.getFullYear() < today.getFullYear() || (prev.getFullYear() === today.getFullYear() && prev.getMonth() < today.getMonth())) {
      return;
    }
    setViewDate(prev);
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // Month Grid computation
  const monthGrid = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const grid: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      grid.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      grid.push(new Date(year, month, d));
    }
    return grid;
  }, [viewDate]);

  const isDateSelectable = (date: Date) => {
    const today = getTodayInTimeZone(barbershop?.time_zone || 'America/Sao_Paulo');
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    return target >= today;
  };

  const formattedMonthYearLabel = useMemo(() => {
    return viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }, [viewDate]);

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

  const primaryColor = barbershop?.primary_color || '#113939';

  // Booking Execution
  const executeBooking = async (userId: string) => {
    setBookingLoading(true);
    setBookingError('');

    try {
      if (!selectedService || !selectedBarber || !selectedDate || !selectedTime || !barbershop) {
        throw new Error('Preencha todas as etapas antes de confirmar.');
      }

      const dateStr = formatCalendarDate(selectedDate);
      const chosenSlot = availableSlots.find((s) => s.localTime === selectedTime);
      if (!chosenSlot) {
        throw new Error('O horário selecionado não está mais disponível.');
      }

      if (reschedule_id) {
        const { error: updateError } = await supabase
          .from('appointments')
          .update({
            service_id: selectedService,
            professional_id: selectedBarber,
            appointment_date: dateStr,
            start_time: selectedTime,
            end_time: chosenSlot.endTime,
            price: summaryPrice,
            status: 'confirmed',
          })
          .eq('id', reschedule_id);

        if (updateError) throw updateError;
        tapSuccess();
        displayAlert('Sucesso', 'Reagendamento realizado com sucesso!');
        router.replace('/appointments' as any);
        return;
      }

      const { error: insertError } = await supabase
        .from('appointments')
        .insert({
          client_id: userId,
          establishment_id: barbershop.id,
          service_id: selectedService,
          professional_id: selectedBarber,
          appointment_date: dateStr,
          start_time: selectedTime,
          end_time: chosenSlot.endTime,
          price: summaryPrice,
          status: 'confirmed',
        });

      if (insertError) throw insertError;

      tapSuccess();
      void scheduleAppointmentNotification(
        dateStr,
        selectedTime,
        activeServiceObj?.name || 'Serviço',
        barbershop.name
      );

      displayAlert('Agendamento Confirmado!', 'Seu horário foi reservado com sucesso.');
      router.replace('/appointments' as any);
    } catch (err: any) {
      console.error('Booking execution error:', err);
      setBookingError(err.message || 'Erro ao processar agendamento.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleConfirmBooking = () => {
    if (user) {
      void executeBooking(user.id);
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
          void executeBooking(data.user.id);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        if (data.user) {
          setIsAuthModalVisible(false);
          void executeBooking(data.user.id);
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
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#113939" />
        <Text style={styles.loadingText}>Carregando informações do agendamento...</Text>
      </View>
    );
  }

  return (
    <View testID="booking-screen" style={styles.root}>
      {/* ─── TOPBAR NAV ─────────────────────────────────────────────── */}
      <View style={styles.topbar}>
        <View style={styles.topbarInner}>
          <Pressable style={styles.backBtn} onPress={() => router.push(`/${slug}` as any)}>
            <ArrowLeft size={16} color={colors.text} />
            <Text style={styles.backBtnText}>Voltar ao Salão</Text>
          </Pressable>

          <Text style={styles.topbarTitle} numberOfLines={1}>
            {barbershop?.name || 'Agendamento Online'}
          </Text>

          <View style={{ width: 100 }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.mainWrapper}>
          {/* ─── SALON HERO CARD ────────────────────────────────────── */}
          <View style={styles.heroCard}>
            {barbershop?.banner_url ? (
              <Image source={{ uri: barbershop.banner_url }} style={styles.heroImg} contentFit="cover" />
            ) : (
              <View style={styles.heroFallback}>
                <Scissors size={28} color="#113939" />
              </View>
            )}

            <View style={styles.heroInfoRow}>
              <View style={styles.heroLogoCircle}>
                {barbershop?.logo_url ? (
                  <Image source={{ uri: barbershop.logo_url }} style={styles.logoImg} contentFit="cover" />
                ) : (
                  <Scissors size={20} color="#113939" />
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
                  {barbershop?.average_rating ? Number(barbershop.average_rating).toFixed(1) : '4.9'}
                </Text>
              </View>
            </View>
          </View>

          {/* ─── INTERACTIVE 4-STEP WIZARD TRACKER ──────────────────── */}
          <View style={styles.stepTracker}>
            {[
              { step: 1 as const, label: '1. Serviço', done: Boolean(selectedService) },
              { step: 2 as const, label: '2. Profissional', done: Boolean(selectedBarber) },
              { step: 3 as const, label: '3. Data & Horário', done: Boolean(selectedDate && selectedTime) },
              { step: 4 as const, label: '4. Confirmação', done: wizardStep === 4 },
            ].map((st) => (
              <Pressable
                key={st.step}
                disabled={st.step > wizardStep && !st.done}
                style={[
                  styles.stepPill,
                  wizardStep === st.step && styles.stepPillActive,
                  st.done && styles.stepPillDone,
                ]}
                onPress={() => {
                  tapLight();
                  setWizardStep(st.step);
                }}
              >
                <Text
                  style={[
                    styles.stepPillText,
                    (wizardStep === st.step || st.done) && styles.stepPillTextActive,
                  ]}
                >
                  {st.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ─── PASSO 1: ESCOLHA O SERVIÇO ───────────────────────────── */}
          {wizardStep === 1 && (
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
                      style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
                      onPress={() => {
                        tapLight();
                        setSelectedService(srv.id);
                        setSelectedTime(null);
                        // Auto advance to Step 2
                        setWizardStep(2);
                      }}
                    >
                      <View style={styles.serviceIconBox}>
                        <Scissors size={16} color={isSelected ? '#113939' : colors.textMuted} />
                      </View>

                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.serviceName}>{srv.name}</Text>
                        <Text style={styles.serviceMeta}>
                          <Clock size={11} color={colors.textMuted} /> {srv.durationMinutes} min
                        </Text>
                      </View>

                      <View style={styles.priceTag}>
                        <Text style={styles.priceTagText}>R$ {Number(srv.price).toFixed(2)}</Text>
                      </View>

                      <ChevronRight size={16} color={colors.textMuted} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ─── PASSO 2: ESCOLHA O PROFISSIONAL ────────────────────── */}
          {wizardStep === 2 && (
            <View style={styles.stepSection}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepEyebrow}>PASSO 2 DE 4</Text>
                <Text style={styles.stepTitle}>Com qual especialista prefere ser atendido?</Text>
                <Text style={styles.stepSubtitle}>
                  Serviço selecionado: <Text style={{ fontFamily: typography.bodyStrong, color: '#113939' }}>{activeServiceObj?.name}</Text>
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
                  filteredBarbers.map((barber) => {
                    const isSelected = selectedBarber === barber.id;
                    const { price: customPrice } = getServicePriceAndDuration(selectedService, barber.id);

                    return (
                      <Pressable
                        key={barber.id}
                        style={[styles.barberCard, isSelected && styles.barberCardSelected]}
                        onPress={() => {
                          tapLight();
                          setSelectedBarber(barber.id);
                          setSelectedTime(null);
                          // Auto advance to Step 3
                          setWizardStep(3);
                        }}
                      >
                        <View style={styles.barberAvatar}>
                          {barber.fotoUrl ? (
                            <Image source={{ uri: barber.fotoUrl }} style={styles.avatarImg} contentFit="cover" />
                          ) : (
                            <UserRound size={18} color="#113939" />
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
                  })
                )}
              </View>

              <View style={styles.navRow}>
                <AppButton
                  label="← Voltar aos Serviços"
                  variant="ghost"
                  onPress={() => setWizardStep(1)}
                />
              </View>
            </View>
          )}

          {/* ─── PASSO 3: ESCOLHA A DATA E HORÁRIO ──────────────────── */}
          {wizardStep === 3 && (
            <View style={styles.stepSection}>
              <View style={styles.stepHeader}>
                <Text style={styles.stepEyebrow}>PASSO 3 DE 4</Text>
                <Text style={styles.stepTitle}>Escolha a Data e o Horário</Text>
                <Text style={styles.stepSubtitle}>
                  Atendimento com{' '}
                  <Text style={{ fontFamily: typography.bodyStrong, color: '#113939' }}>
                    {activeBarberObj?.name || 'Profissional'}
                  </Text>
                </Text>
              </View>

              {/* Calendário Grid */}
              <View style={styles.calendarCard}>
                <View style={styles.calendarTitleRow}>
                  <Text style={styles.calendarMonthTitle}>{formattedMonthYearLabel}</Text>
                  <View style={styles.monthNav}>
                    <Pressable onPress={handlePrevMonth} style={styles.monthNavBtn}>
                      <ChevronLeft size={16} color={colors.text} />
                    </Pressable>
                    <Pressable onPress={handleNextMonth} style={styles.monthNavBtn}>
                      <ChevronRight size={16} color={colors.text} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.weekHeaderRow}>
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, idx) => (
                    <Text key={idx} style={styles.weekHeaderDay}>
                      {day}
                    </Text>
                  ))}
                </View>

                <View style={styles.daysGrid}>
                  {monthGrid.map((date, idx) => {
                    if (!date) return <View key={`empty-${idx}`} style={styles.emptyDayCell} />;

                    const selectable = isDateSelectable(date);
                    const isSelected = selectedDate && selectedDate.toDateString() === date.toDateString();

                    return (
                      <Pressable
                        key={date.toISOString()}
                        disabled={!selectable}
                        style={[
                          styles.dayCell,
                          !selectable && styles.dayCellDisabled,
                          isSelected && styles.dayCellSelected,
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
                            isSelected && styles.dayCellTextSelected,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Time Slots */}
              {selectedDate && (
                <View style={styles.timeSlotsBox}>
                  <Text style={styles.slotsTitle}>
                    Horários disponíveis para{' '}
                    {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}:
                  </Text>

                  {availabilityLoading ? (
                    <ActivityIndicator color="#113939" style={{ marginVertical: 20 }} />
                  ) : availabilityError ? (
                    <InlineNotice tone="danger" message={availabilityError} />
                  ) : availableSlots.length === 0 ? (
                    <InlineNotice tone="info" message={emptyMessage || 'Nenhum horário livre nesta data.'} />
                  ) : (
                    <View style={styles.timeSlotsContainer}>
                      {groupedSlots.morning.length > 0 && (
                        <View style={styles.periodGroup}>
                          <Text style={styles.periodLabel}>🌅 Manhã</Text>
                          <View style={styles.timeGrid}>
                            {groupedSlots.morning.map((slot) => {
                              const isSelected = selectedTime === slot.localTime;
                              return (
                                <Pressable
                                  key={slot.startsAt}
                                  style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                                  onPress={() => {
                                    tapLight();
                                    setSelectedTime(slot.localTime);
                                  }}
                                >
                                  <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
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
                          <Text style={styles.periodLabel}>☀️ Tarde</Text>
                          <View style={styles.timeGrid}>
                            {groupedSlots.afternoon.map((slot) => {
                              const isSelected = selectedTime === slot.localTime;
                              return (
                                <Pressable
                                  key={slot.startsAt}
                                  style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                                  onPress={() => {
                                    tapLight();
                                    setSelectedTime(slot.localTime);
                                  }}
                                >
                                  <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
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
                          <Text style={styles.periodLabel}>🌙 Noite</Text>
                          <View style={styles.timeGrid}>
                            {groupedSlots.evening.map((slot) => {
                              const isSelected = selectedTime === slot.localTime;
                              return (
                                <Pressable
                                  key={slot.startsAt}
                                  style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                                  onPress={() => {
                                    tapLight();
                                    setSelectedTime(slot.localTime);
                                  }}
                                >
                                  <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
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
                <AppButton label="← Voltar ao Profissional" variant="ghost" onPress={() => setWizardStep(2)} />

                <AppButton
                  label="Avançar para Revisão →"
                  disabled={!selectedDate || !selectedTime}
                  onPress={() => setWizardStep(4)}
                />
              </View>
            </View>
          )}

          {/* ─── PASSO 4: REVISÃO E CONFIRMAÇÃO ─────────────────────── */}
          {wizardStep === 4 && (
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
                  <Text style={styles.summaryValue}>{activeBarberObj?.name}</Text>
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
                  <Text style={styles.summaryTotalValue}>R$ {summaryPrice.toFixed(2)}</Text>
                </View>
              </View>

              <View style={styles.navRowBetween}>
                <AppButton label="← Alterar Data/Horário" variant="ghost" onPress={() => setWizardStep(3)} />

                <AppButton
                  label={bookingLoading ? 'Confirmando...' : user ? 'Confirmar Agendamento' : 'Entrar e Confirmar'}
                  style={styles.confirmBtn}
                  disabled={bookingLoading}
                  onPress={handleConfirmBooking}
                />
              </View>
            </View>
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
        foregroundColor="#FFFFFF"
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
    </View>
  );
}

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
    color: '#113939',
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
    backgroundColor: '#F0ECE0',
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
    backgroundColor: '#F0ECE0',
    borderWidth: 1,
    borderColor: '#E4E5DF',
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
    borderColor: '#113939',
    backgroundColor: '#F4F7F5',
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
    color: '#113939',
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
  serviceCardSelected: {
    borderColor: '#113939',
    borderWidth: 2,
    backgroundColor: '#F4F7F5',
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
    backgroundColor: '#F0ECE0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  priceTagText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#113939',
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
  barberCardSelected: {
    borderColor: '#113939',
    borderWidth: 2,
    backgroundColor: '#F4F7F5',
  },
  barberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0ECE0',
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
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#E4E5DF',
    paddingBottom: 6,
  },
  weekHeaderDay: {
    fontSize: 11,
    fontFamily: typography.bodyStrong,
    color: colors.textMuted,
    textAlign: 'center',
    width: 34,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 6,
  },
  emptyDayCell: {
    width: 34,
    height: 34,
  },
  dayCell: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  dayCellDisabled: {
    opacity: 0.3,
  },
  dayCellSelected: {
    backgroundColor: '#113939',
  },
  dayCellText: {
    fontSize: 12,
    fontFamily: typography.body,
    color: '#1A1A1E',
  },
  dayCellTextDisabled: {
    color: colors.textMuted,
  },
  dayCellTextSelected: {
    fontFamily: typography.bodyStrong,
    color: '#FFFFFF',
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
    color: '#113939',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E5DF',
    borderRadius: radii.sm,
  },
  timeChipSelected: {
    backgroundColor: '#113939',
    borderColor: '#113939',
  },
  timeChipText: {
    fontSize: 12,
    fontFamily: typography.bodyStrong,
    color: '#1A1A1E',
  },
  timeChipTextSelected: {
    color: '#FFFFFF',
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
    color: '#113939',
  },
  confirmBtn: {
    backgroundColor: '#113939',
    paddingHorizontal: 24,
  },
});
