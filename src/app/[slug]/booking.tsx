import { colors } from '../../theme/tokens';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, ScrollView, Platform, Modal, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Profile, Barbershop, Appointment, BarberService } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { scheduleAppointmentNotification } from '../../services/notifications';
import { supabase } from '../../services/supabase';

export default function BookingSlugScreen() {
  const { t, i18n } = useTranslation();
  const { slug, reschedule_id } = useLocalSearchParams<{ slug: string; reschedule_id?: string }>();
  const { user } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [barberServices, setBarberServices] = useState<BarberService[]>([]);
  
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);

  useEffect(() => {
    if (reschedule_id) {
      database.collections.get<Appointment>('appointments').find(reschedule_id).then((apt) => {
        setSelectedService(apt.serviceId);
        setSelectedBarber(apt.professionalId);
      }).catch(err => {
        console.warn('Erro ao carregar dados de reagendamento:', err);
      });
    }
  }, [reschedule_id]);
  
  // Calendário em Grade Mensal (Grid)
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedSegments, setBookedSegments] = useState<{ start: number; end: number }[]>([]);

  // Estados de Autenticação Atrito Zero (Modal)
  const [isAuthModalVisible, setIsAuthModalVisible] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPassword, setAuthPassword] = useState('');
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
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };

  // 2. Carregar informações iniciais da barbearia por Slug
  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const shops = await database.collections.get<Barbershop>('establishments')
          .query(Q.where('slug', slug))
          .fetch();

        if (shops.length > 0) {
          const shop = shops[0];
          setBarbershop(shop);

          const sList = await database.collections
            .get<Service>('services')
            .query(Q.where('establishment_id', shop.id), Q.where('is_active', true))
            .fetch();
          setServices(sList);

          const bList = await database.collections
            .get<Profile>('profiles')
            .query(
              Q.where('establishment_id', shop.id),
              Q.where('role', Q.oneOf(['professional', 'barber', 'admin']))
            )
            .fetch();
          setBarbers(bList);

          const bsList = await database.collections
            .get<BarberService>('professional_services')
            .query(Q.where('establishment_id', shop.id))
            .fetch();
          setBarberServices(bsList);

          const today = new Date();
          setSelectedDate(today);
        }
      } catch (err) {
        console.error('Erro ao buscar dados locais para agendamento:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [slug]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/${slug}`);
    }
  };

  const executeBooking = async (clientId: string) => {
    setBookingLoading(true);
    try {
      const appointmentDate = new Date(selectedDate!);
      const [hours, minutes] = selectedTime!.split(':');
      appointmentDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      let targetAppointmentId = '';
      await database.write(async () => {
        if (reschedule_id) {
          const appointment = await database.collections.get<Appointment>('appointments').find(reschedule_id);
          await appointment.update((record) => {
            record.originalDateTime = record.originalDateTime || record.dateTime;
            record.dateTime = appointmentDate;
            record.status = 'pending';
            record.rescheduleCount = (record.rescheduleCount || 0) + 1;
            record.professionalId = selectedBarber!;
            record.serviceId = selectedService!;
          });
          targetAppointmentId = appointment.id;
        } else {
          const created = await database.collections.get<Appointment>('appointments').create((record) => {
            record.establishmentId = barbershop!.id;
            record.clientId = clientId;
            record.professionalId = selectedBarber!;
            record.serviceId = selectedService!;
            record.dateTime = appointmentDate;
            record.status = 'pending';
            record.rescheduleCount = 0;
          });
          targetAppointmentId = created.id;
        }
      });

      if (barbershop?.name) {
        await scheduleAppointmentNotification(targetAppointmentId, barbershop.name, appointmentDate);
      }

      displayAlert(t('common.success'), t('booking.success_message'));
      sync();
      router.replace(`/${slug}`);
    } catch (error) {
      displayAlert(t('common.error'), 'Não foi possível salvar o agendamento.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedBarber || !selectedDate || !selectedTime) {
      displayAlert(t('common.attention'), 'Por favor, selecione serviço, profissional, data e horário.');
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
      displayAlert('E-mail requerido', 'Por favor, digite seu e-mail.');
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
      displayAlert('Link Enviado', 'Verifique sua caixa de entrada para o acesso rápido!');
    } catch (err: any) {
      displayAlert('Erro de Conexão', err.message || 'Erro ao enviar link.');
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
              role: 'client',
              establishment_id: barbershop?.id || null,
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
    } catch (err: any) {
      displayAlert('Erro', err.message || 'Ocorreu um erro na autenticação.');
    } finally {
      setAuthLoading(false);
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

  const localeStr = i18n.language === 'en' ? 'en-US' : 'pt-BR';
  const monthYearLabel = viewDate.toLocaleDateString(localeStr, { month: 'long', year: 'numeric' });
  const formattedMonthYearLabel = monthYearLabel.charAt(0).toUpperCase() + monthYearLabel.slice(1);

  const weekDays = i18n.language === 'en' 
    ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] 
    : ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const primaryColor = barbershop?.primaryColor || '#D4AF37';

  // Filtrar barbeiros que realizam o serviço selecionado
  const filteredBarbers = barbers.filter(b => {
    if (!selectedService) return true;
    const { isActive } = getServicePriceAndDuration(selectedService, b.id);
    return isActive;
  });

  return (
    <View style={styles.container}>
      <View style={styles.innerContainer}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('booking.title')}</Text>
          <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* 1. Escolha do Serviço */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('booking.service_label')}</Text>
            <FlatList
              data={services}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.card,
                    selectedService === item.id && [styles.cardActive, { borderColor: primaryColor }]
                  ]}
                  onPress={() => {
                    setSelectedService(item.id);
                    if (selectedBarber) {
                      const { isActive } = getServicePriceAndDuration(item.id, selectedBarber);
                      if (!isActive) setSelectedBarber(null);
                    }
                    setSelectedTime(null);
                  }}
                >
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardSubText}>
                    {formatPrice(item.price)} • {item.durationMinutes} min
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>

          {/* 2. Escolha do Barbeiro */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('booking.professional_label')}</Text>
            {filteredBarbers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{t('booking.no_professionals')}</Text>
              </View>
            ) : (
              <FlatList
                data={filteredBarbers}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => {
                  const { price: customPrice } = getServicePriceAndDuration(selectedService, item.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.card,
                        selectedBarber === item.id && [styles.cardActive, { borderColor: primaryColor }]
                      ]}
                      onPress={() => {
                        setSelectedBarber(item.id);
                        setSelectedTime(null);
                      }}
                    >
                      <Text style={styles.cardName}>{item.name}</Text>
                      <Text style={styles.cardSubText}>
                        {item.tituloProfissional ? item.tituloProfissional.toUpperCase() : 'ESPECIALISTA'}
                        {selectedService && customPrice > 0 && ` • ${formatPrice(customPrice)}`}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>

          {/* 3. Escolha de Dia (Grade Grid) */}
          <View style={styles.section}>
            <View style={styles.calendarHeader}>
              <Text style={styles.sectionTitle}>{t('booking.step_date', 'Escolha o Dia')}</Text>
              <View style={styles.monthSelector}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavButton}>
                  <Text style={styles.monthNavText}>‹</Text>
                </TouchableOpacity>
                <Text style={[styles.monthLabel, { color: primaryColor }]}>{formattedMonthYearLabel}</Text>
                <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavButton}>
                  <Text style={styles.monthNavText}>›</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.calendarGrid}>
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

                  return (
                    <TouchableOpacity
                      key={date.toISOString()}
                      style={[
                        styles.dayCell,
                        isSelected && [styles.dayCellActive, { backgroundColor: primaryColor }],
                        !selectable && styles.dayCellDisabled
                      ]}
                      onPress={() => selectable && setSelectedDate(date)}
                      disabled={!selectable}
                    >
                      <Text style={[
                        styles.dayCellText,
                        isSelected && styles.dayCellTextActive,
                        !selectable && styles.dayCellTextDisabled
                      ]}>
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* 4. Escolha do Horário */}
          {selectedBarber && selectedService && selectedDate && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('booking.step_time', 'Escolha o Horário')}</Text>
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
                    <TouchableOpacity
                      key={time}
                      style={[
                        styles.timeCard,
                        isSelected && [styles.timeCardActive, { backgroundColor: primaryColor }],
                        isBooked && styles.timeCardDisabled
                      ]}
                      onPress={() => !isBooked && setSelectedTime(time)}
                      disabled={isBooked}
                    >
                      <Text style={[
                        styles.timeText,
                        isSelected && { color: '#121212' },
                        isBooked && styles.timeTextDisabled
                      ]}>
                        {time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Confirmar Agendamento */}
          {selectedTime && (
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: primaryColor }]}
              onPress={handleConfirmBooking}
              disabled={bookingLoading}
            >
              {bookingLoading ? (
                <ActivityIndicator color="#121212" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  {user ? t('booking.button') : t('booking.login_confirm', 'Logar e Confirmar')}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Modal: Autenticação Rápida de Atrito Zero (Magic Link e Cadastro Rápido) */}
      <Modal visible={isAuthModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: primaryColor }]}>{t('login.identify', 'Identifique-se')}</Text>
            <Text style={styles.modalDesc}>{t('login.identify_desc', 'Você precisa de uma conta rápida para concluir seu agendamento.')}</Text>

            {magicLinkSent ? (
              <View style={styles.magicLinkState}>
                <Text style={styles.magicSuccessTitle}>📬 {t('login.email_sent', 'E-mail Enviado!')}</Text>
                <Text style={styles.magicSuccessDesc}>
                  {t('login.email_sent_desc', 'Enviamos um link de login rápido para')} **{authEmail}**. {t('login.email_sent_return', 'Abra o link e retorne aqui para finalizar o agendamento!')}
                </Text>
                <TouchableOpacity 
                  style={[styles.modalBtn, { backgroundColor: primaryColor, marginTop: 16 }]}
                  onPress={() => {
                    setMagicLinkSent(false);
                    setIsAuthModalVisible(false);
                  }}
                >
                  <Text style={styles.modalBtnText}>Entendi</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {/* Abas */}
                <View style={styles.authTabs}>
                  <TouchableOpacity 
                    style={[styles.authTab, !isRegisterMode && styles.authTabActive]}
                    onPress={() => setIsRegisterMode(false)}
                  >
                    <Text style={[styles.authTabText, !isRegisterMode && { color: primaryColor }]}>{t('login.magic_link_tab', 'Sem Senha')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.authTab, isRegisterMode && styles.authTabActive]}
                    onPress={() => setIsRegisterMode(true)}
                  >
                    <Text style={[styles.authTabText, isRegisterMode && { color: primaryColor }]}>{t('register.title')}</Text>
                  </TouchableOpacity>
                </View>

                {/* Formulário */}
                {isRegisterMode ? (
                  <>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Seu Nome Completo"
                      placeholderTextColor="#666"
                      value={authName}
                      onChangeText={setAuthName}
                    />
                    <TextInput
                      style={styles.modalInput}
                      placeholder="E-mail"
                      placeholderTextColor="#666"
                      keyboardType="email-address"
                      value={authEmail}
                      onChangeText={setAuthEmail}
                    />
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Senha (mínimo 6 dígitos)"
                      placeholderTextColor="#666"
                      secureTextEntry
                      value={authPassword}
                      onChangeText={setAuthPassword}
                    />
                    <TouchableOpacity 
                      style={[styles.modalBtn, { backgroundColor: primaryColor }]}
                      onPress={handleAuthSubmit}
                      disabled={authLoading}
                    >
                      {authLoading ? <ActivityIndicator color="#121212" /> : <Text style={styles.modalBtnText}>Criar e Reservar</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.magicLinkInfo}>
                      Digite seu e-mail abaixo. Você receberá um link de login imediato sem senhas.
                    </Text>
                    <TextInput
                      style={styles.modalInput}
                      placeholder="Seu melhor e-mail"
                      placeholderTextColor="#666"
                      keyboardType="email-address"
                      value={authEmail}
                      onChangeText={setAuthEmail}
                    />
                    <TouchableOpacity 
                      style={[styles.modalBtn, { backgroundColor: primaryColor }]}
                      onPress={handleSendMagicLink}
                      disabled={authLoading}
                    >
                      {authLoading ? <ActivityIndicator color="#121212" /> : <Text style={styles.modalBtnText}>Enviar Link de Acesso</Text>}
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity 
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
    </View>
  );
}

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
    backgroundColor: colors.canvas,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: colors.text,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  cardActive: {
    backgroundColor: colors.surface,
  },
  cardName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  cardSubText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthNavButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surfacePressed,
    borderRadius: 6,
  },
  monthNavText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
  },
  monthLabel: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  calendarGrid: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
  },
  weekDayText: {
    color: colors.textMuted,
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 'bold',
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
    borderRadius: 8,
    marginVertical: 2,
  },
  dayCellActive: {
    borderRadius: 8,
  },
  dayCellDisabled: {
    opacity: 0.15,
  },
  dayCellEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  dayCellText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  dayCellTextActive: {
    color: '#121212',
  },
  dayCellTextDisabled: {
    color: colors.textMuted,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeCard: {
    width: '23%',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  timeCardActive: {
    borderWidth: 0,
  },
  timeCardDisabled: {
    backgroundColor: colors.surfacePressed,
    borderColor: 'transparent',
    opacity: 0.2,
  },
  timeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  timeTextDisabled: {
    color: colors.textMuted,
  },
  confirmButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  confirmButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  backButtonText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Modal de Autenticação Atrito Zero
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000bb',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  magicLinkState: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  magicSuccessTitle: {
    fontSize: 16,
    color: '#30d158',
    fontWeight: 'bold',
  },
  magicSuccessDesc: {
    color: colors.text,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
  },
  authTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  authTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  authTabActive: {
    borderBottomWidth: 2,
  },
  authTabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: 'bold',
  },
  magicLinkInfo: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: colors.surfacePressed,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 12,
  },
  modalBtn: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalBtnText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
