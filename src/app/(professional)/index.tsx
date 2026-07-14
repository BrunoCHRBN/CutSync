import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Platform, ScrollView, Modal, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Appointment, Service, Profile, Barbershop, BarberService } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { BarberDashboardExperience } from '../../components/screens/BarberDashboardExperience';

export default BarberDashboardExperience;

interface AppointmentDetail {
  id: string;
  dateTime: Date;
  status: string;
  clientName: string;
  serviceName: string;
  price: number;
  professionalId: string;
}

function LegacyBarberDashboardScreen() {
  const { t, i18n } = useTranslation();
  const { user, profile, signOut } = useAuth();
  const { isSyncing, sync, isOffline } = useSync();
  const router = useRouter();

  // Estados principais
  const [activeTab, setActiveTab] = useState<'my_day' | 'team'>('my_day');
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [allAppointments, setAllAppointments] = useState<AppointmentDetail[]>([]);
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [barberServices, setBarberServices] = useState<BarberService[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Estados para o Encaixe Rápido (Walk-in) e Cross-Booking
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [selectedWalkInService, setSelectedWalkInService] = useState<string | null>(null);
  const [selectedWalkInTime, setSelectedWalkInTime] = useState<string | null>(null);
  const [selectedWalkInBarber, setSelectedWalkInBarber] = useState<string | null>(null);

  // Segmentos ocupados por barbeiro para detecção de conflitos
  const [bookedSegmentsMap, setBookedSegmentsMap] = useState<Record<string, { start: number; end: number }[]>>({});

  const displayAlert = (title: string, message: string) => {
    console.warn(`${title}: ${message}`);
  };

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

  const getNext7Days = () => {
    const days = [];
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      days.push({
        id: d.toISOString().split('T')[0],
        date: d,
        label: i === 0 ? (i18n.language === 'en' ? 'Today' : 'Hoje') : d.toLocaleDateString(locale, { weekday: 'short' }),
        dayStr: d.getDate().toString(),
      });
    }
    return days;
  };

  const next7Days = getNext7Days();
  const availableTimes = [
    '08:00', '09:00', '10:00', '11:00', 
    '13:00', '14:00', '15:00', '16:00', 
    '17:00', '18:00', '19:00', '20:00'
  ];

  // 1. Carregar barbearia, equipe, serviços e tarifas diferenciadas
  useEffect(() => {
    if (!profile?.establishment_id) return;

    const bSub = database.collections
      .get<Barbershop>('establishments')
      .findAndObserve(profile.establishment_id)
      .subscribe((data) => setBarbershop(data));

    // Carregar colegas de equipe
    const teamSub = database.collections
      .get<Profile>('profiles')
      .query(
        Q.where('establishment_id', profile.establishment_id),
        Q.where('role', Q.oneOf(['professional', 'admin']))
      )
      .observe()
      .subscribe((data) => {
        setTeamMembers(data.filter(p => p.id !== user?.id));
      });

    const sSub = database.collections
      .get<Service>('services')
      .query(Q.where('establishment_id', profile.establishment_id), Q.where('is_active', true))
      .observe()
      .subscribe((data) => setServices(data));

    const bsSub = database.collections
      .get<BarberService>('professional_services')
      .query(Q.where('establishment_id', profile.establishment_id))
      .observe()
      .subscribe((data) => setBarberServices(data));

    return () => {
      bSub.unsubscribe();
      teamSub.unsubscribe();
      sSub.unsubscribe();
      bsSub.unsubscribe();
    };
  }, [profile, user]);

  // 2. Carregar agendamentos do dia de toda a barbearia para calcular colisões e censura
  useEffect(() => {
    if (!profile?.establishment_id) {
      setLoading(false);
      return;
    }

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const appointmentsQuery = database.collections
      .get<Appointment>('appointments')
      .query(
        Q.where('establishment_id', profile.establishment_id),
        Q.where('status', Q.notEq('cancelled')),
        Q.where('date_time', Q.between(startOfDay.getTime(), endOfDay.getTime()))
      );

    const subscription = appointmentsQuery.observe().subscribe(async (list) => {
      try {
        const details: AppointmentDetail[] = [];
        const segmentMap: Record<string, { start: number; end: number }[]> = {};

        const isUserAdmin = profile.role === 'admin';
        const currentUserId = user?.id;

        for (const apt of list) {
          const isOwnAppointment = apt.professionalId === currentUserId;
          const shouldCensor = !isUserAdmin && !isOwnAppointment;

          // Obter nome do cliente com censura para outros barbeiros
          let clientName = 'Cliente Walk-in';
          if (shouldCensor) {
            clientName = 'Ocupado';
          } else {
            clientName = apt.clientName || 'Cliente Walk-in';
            if (apt.clientId) {
              try {
                const cl = await database.collections.get<Profile>('profiles').find(apt.clientId);
                clientName = cl.name;
              } catch (e) {
                // mantém padrão
              }
            }
          }

          // Obter dados do serviço e preço com censura
          const { price, duration } = getServicePriceAndDuration(apt.serviceId, apt.professionalId);
          let serviceName = 'Serviço Removido';
          if (shouldCensor) {
            serviceName = 'Reservado';
          } else {
            try {
              const sv = await database.collections.get<Service>('services').find(apt.serviceId);
              serviceName = sv.name;
            } catch (e) {
              // mantém padrão
            }
          }

          details.push({
            id: apt.id,
            dateTime: apt.dateTime,
            status: apt.status,
            clientName,
            serviceName,
            price: shouldCensor ? 0 : price,
            professionalId: apt.professionalId,
          });

          // Preencher mapa de segmentos de colisão do barbeiro
          if (!segmentMap[apt.professionalId]) {
            segmentMap[apt.professionalId] = [];
          }
          const startTime = new Date(apt.dateTime).getTime();
          const endTime = startTime + duration * 60 * 1000;
          segmentMap[apt.professionalId].push({ start: startTime, end: endTime });
        }

        details.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        setAllAppointments(details);
        setBookedSegmentsMap(segmentMap);
      } catch (err) {
        console.error('Erro ao processar agendamentos do dia:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [profile, selectedDate, services, barberServices]);

  const handleUpdateStatus = async (appointmentId: string, newStatus: 'confirmed' | 'completed' | 'cancelled') => {
    setActionLoadingId(appointmentId);
    try {
      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(appointmentId);
        await appointment.update((record) => {
          record.status = newStatus;
        });
      });
      sync();
    } catch (err) {
      displayAlert('Erro', 'Não foi possível atualizar o status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAddWalkIn = async () => {
    if (!walkInName.trim()) {
      displayAlert('Erro', 'Por favor, informe o nome do cliente.');
      return;
    }
    if (!selectedWalkInService) {
      displayAlert('Erro', 'Por favor, selecione um serviço.');
      return;
    }
    if (!selectedWalkInTime) {
      displayAlert('Erro', 'Por favor, selecione um horário.');
      return;
    }

    const targetBarber = selectedWalkInBarber || user?.id;
    if (!targetBarber) return;

    try {
      const slotDate = new Date(selectedDate);
      const [hours, minutes] = selectedWalkInTime.split(':');
      slotDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      await database.write(async () => {
        await database.collections.get('appointments').create((record: any) => {
          record.establishmentId = profile?.establishment_id;
          record.clientId = null; // Walk-in
          record.clientName = walkInName;
          record.professionalId = targetBarber;
          record.serviceId = selectedWalkInService;
          record.dateTime = slotDate;
          record.status = 'confirmed';
        });
      });

      displayAlert('Sucesso', 'Encaixe realizado com sucesso!');
      setIsModalOpen(false);
      setWalkInName('');
      setSelectedWalkInService(null);
      setSelectedWalkInTime(null);
      setSelectedWalkInBarber(null);
      sync();
    } catch (err) {
      displayAlert('Erro', 'Não foi possível criar o encaixe.');
    }
  };

  const openCrossBookingModal = (professionalId: string, time: string) => {
    setSelectedWalkInBarber(professionalId);
    setSelectedWalkInTime(time);
    setIsModalOpen(true);
  };

  const formatPrice = (price: number) => {
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    const currencyCode = barbershop?.currency || 'BRL';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  };

  const formatDate = (date: Date) => {
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    const tz = barbershop?.timezone || 'America/Sao_Paulo';
    try {
      const formatted = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      }).format(date);
      return i18n.language === 'en' ? formatted : `${formatted}h`;
    } catch (e) {
      const formatted = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return i18n.language === 'en' ? formatted : `${formatted}h`;
    }
  };

  const getWalkInAvailableTimes = (professionalId: string) => {
    const { duration } = getServicePriceAndDuration(selectedWalkInService, professionalId);
    const barberSegments = bookedSegmentsMap[professionalId] || [];

    return availableTimes.filter((time) => {
      const slotDate = new Date(selectedDate);
      const [hours, minutes] = time.split(':');
      slotDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      const slotStart = slotDate.getTime();
      const slotEnd = slotStart + duration * 60 * 1000;

      return !barberSegments.some(
        (seg) => slotStart < seg.end && slotEnd > seg.start
      );
    });
  };

  // Filtrar apenas os serviços que o profissional selecionado de fato realiza
  const getEligibleServicesForWalkIn = () => {
    const targetBarber = selectedWalkInBarber || user?.id;
    if (!targetBarber) return services;
    return services.filter(s => {
      const { isActive } = getServicePriceAndDuration(s.id, targetBarber);
      return isActive;
    });
  };

  const eligibleServices = getEligibleServicesForWalkIn();

  // Filtrar apenas a agenda do próprio barbeiro
  const myAppointments = allAppointments.filter(a => a.professionalId === user?.id);

  // Faturamento apenas do barbeiro logado
  const myEarnings = myAppointments
    .filter((a) => a.status === 'completed')
    .reduce((acc, curr) => acc + curr.price, 0);

  const primaryColor = barbershop?.primaryColor || '#D4AF37';

  // Toggle de visibilidade compartilhado pelo dono
  const shareAgendasEnabled = barbershop?.shareAgendas !== false; // default true se nulo

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Painel do Profissional</Text>
          <Text style={[styles.barberName, { color: primaryColor }]}>{profile?.name}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs Selector */}
      <View style={styles.tabSelector}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'my_day' && [styles.tabButtonActive, { borderBottomColor: primaryColor }]]}
          onPress={() => setActiveTab('my_day')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'my_day' && { color: primaryColor }]}>Meu Dia</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'team' && [styles.tabButtonActive, { borderBottomColor: primaryColor }]]}
          onPress={() => setActiveTab('team')}
        >
          <Text style={[styles.tabButtonText, activeTab === 'team' && { color: primaryColor }]}>A Loja / Equipe</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Banner de Sincronismo */}
        <View style={styles.syncBanner}>
          <Text style={styles.syncText}>
            {isOffline ? 'Modo Offline Ativo' : 'Conectado à Nuvem'}
          </Text>
          <TouchableOpacity 
            style={[styles.syncButton, { borderColor: primaryColor }]} 
            onPress={sync}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Text style={[styles.syncButtonText, { color: primaryColor }]}>Sincronizar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* -------------------- TAB 1: MEU DIA -------------------- */}
        {activeTab === 'my_day' && (
          <View style={styles.fullWidth}>
            {/* Resumo Financeiro Pessoal */}
            <View style={styles.earningsCard}>
              <Text style={styles.earningsLabel}>Meu Faturamento Hoje</Text>
              <Text style={[styles.earningsValue, { color: primaryColor }]}>{formatPrice(myEarnings)}</Text>
              <Text style={styles.earningsSubText}>
                Soma dos seus agendamentos concluídos.
              </Text>
            </View>

            {/* Seletor de Data Rápido */}
            <View style={styles.dateSection}>
              <View style={styles.dateHeader}>
                <Text style={styles.sectionTitle}>Selecionar Dia</Text>
                <TouchableOpacity 
                  style={[styles.walkInBtn, { backgroundColor: primaryColor }]}
                  onPress={() => {
                    setSelectedWalkInBarber(user?.id || null);
                    setIsModalOpen(true);
                  }}
                >
                  <Text style={styles.walkInBtnText}>+ Meu Encaixe</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={next7Days}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => {
                  const isSelected = selectedDate.toDateString() === item.date.toDateString();
                  return (
                    <TouchableOpacity
                      style={[
                        styles.dateCard,
                        isSelected && [styles.dateCardActive, { borderColor: primaryColor }]
                      ]}
                      onPress={() => setSelectedDate(item.date)}
                    >
                      <Text style={styles.dateLabel}>{item.label}</Text>
                      <Text style={styles.dateDayStr}>{item.dayStr}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            </View>

            {/* Agenda do Barbeiro */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Meus Atendimentos</Text>

              {loading ? (
                <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 20 }} />
              ) : myAppointments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>Você não tem agendamentos para este dia.</Text>
                </View>
              ) : (
                <FlatList
                  data={myAppointments}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <View style={styles.appointmentCard}>
                      <View style={styles.appointmentHeader}>
                        <Text style={[styles.timeText, { color: primaryColor }]}>{formatDate(item.dateTime)}</Text>
                        <View style={[
                          styles.statusBadge,
                          item.status === 'completed' && styles.badgeCompleted,
                          item.status === 'cancelled' && styles.badgeCancelled,
                          item.status === 'confirmed' && styles.badgeConfirmed,
                          item.status === 'pending' && styles.badgePending,
                        ]}>
                          <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
                        </View>
                      </View>

                      <View style={styles.appointmentBody}>
                        <Text style={styles.clientLabel}>CLIENTE</Text>
                        <Text style={styles.clientName}>{item.clientName}</Text>

                        <Text style={styles.serviceLabel}>SERVIÇO</Text>
                        <Text style={styles.serviceText}>
                          {item.serviceName} • <Text style={{ color: primaryColor }}>{formatPrice(item.price)}</Text>
                        </Text>
                      </View>

                      {/* Transição de Status da State Machine */}
                      {item.status === 'pending' && (
                        <View style={styles.actionsRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnCancel]}
                            onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                            disabled={actionLoadingId !== null}
                          >
                            <Text style={styles.btnTextCancel}>Recusar</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: primaryColor }]}
                            onPress={() => handleUpdateStatus(item.id, 'confirmed')}
                            disabled={actionLoadingId !== null}
                          >
                            {actionLoadingId === item.id ? (
                              <ActivityIndicator size="small" color="#121212" />
                            ) : (
                              <Text style={styles.btnTextComplete}>Confirmar</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}

                      {item.status === 'confirmed' && (
                        <View style={styles.actionsRow}>
                          <TouchableOpacity
                            style={[styles.actionBtn, styles.btnCancel]}
                            onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                            disabled={actionLoadingId !== null}
                          >
                            <Text style={styles.btnTextCancel}>Faltou</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: '#30d158' }]}
                            onPress={() => handleUpdateStatus(item.id, 'completed')}
                            disabled={actionLoadingId !== null}
                          >
                            {actionLoadingId === item.id ? (
                              <ActivityIndicator size="small" color="#121212" />
                            ) : (
                              <Text style={styles.btnTextComplete}>Finalizar</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        )}

        {/* -------------------- TAB 2: A LOJA / EQUIPE -------------------- */}
        {activeTab === 'team' && (
          <View style={styles.fullWidth}>
            {!shareAgendasEnabled ? (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>Agenda Compartilhada Desativada</Text>
                <Text style={styles.warningText}>
                  A visualização de agendas de outros profissionais está desabilitada para este estabelecimento. Caso precise desta funcionalidade, solicite ao administrador para ativá-la nas configurações.
                </Text>
              </View>
            ) : teamMembers.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Sem outros profissionais na equipe cadastrados.</Text>
              </View>
            ) : (
              <View style={{ gap: 20 }}>
                {/* Seletor de Data para visão de equipe */}
                <View style={styles.dateSection}>
                  <Text style={styles.sectionTitle}>Selecionar Dia (Visão Equipe)</Text>
                  <FlatList
                    data={next7Days}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => {
                      const isSelected = selectedDate.toDateString() === item.date.toDateString();
                      return (
                        <TouchableOpacity
                          style={[
                            styles.dateCard,
                            isSelected && [styles.dateCardActive, { borderColor: primaryColor }]
                          ]}
                          onPress={() => setSelectedDate(item.date)}
                        >
                          <Text style={styles.dateLabel}>{item.label}</Text>
                          <Text style={styles.dateDayStr}>{item.dayStr}</Text>
                        </TouchableOpacity>
                      );
                    }}
                  />
                </View>

                {/* Lista de Colegas com grade censurada (Disponibilidade) */}
                {teamMembers.map(barber => {
                  const barberSegments = bookedSegmentsMap[barber.id] || [];
                  return (
                    <View key={barber.id} style={styles.teamBarberSection}>
                      <View style={[styles.teamBarberHeader, { borderLeftColor: primaryColor }]}>
                        <Text style={styles.teamBarberName}>{barber.name}</Text>
                        <Text style={styles.teamBarberRole}>
                          {barber.role === 'admin' ? 'Proprietário' : 'Colaborador'}
                        </Text>
                      </View>

                      {/* Grade de horários com censura e cross-booking */}
                      <View style={styles.availabilityGrid}>
                        {availableTimes.map((time) => {
                          const slotDate = new Date(selectedDate);
                          const [hours, minutes] = time.split(':');
                          slotDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                          
                          const slotStart = slotDate.getTime();
                          const slotEnd = slotStart + 30 * 60 * 1000; // assume slot padrão de 30m no grid visual

                          // Verifica colisão
                          const isBooked = barberSegments.some(
                            (seg) => slotStart < seg.end && slotEnd > seg.start
                          );

                          return (
                            <View 
                              key={time} 
                              style={[
                                styles.availSlotCard,
                                isBooked ? styles.availSlotOcupado : styles.availSlotLivre
                              ]}
                            >
                              <Text style={styles.availSlotTime}>{time}</Text>
                              {isBooked ? (
                                <Text style={styles.availSlotStatus}>Ocupado</Text>
                              ) : (
                                <TouchableOpacity 
                                  style={[styles.availSlotBookBtn, { backgroundColor: primaryColor }]}
                                  onPress={() => openCrossBookingModal(barber.id, time)}
                                >
                                  <Text style={styles.availSlotBookBtnText}>Encaixar</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modal de Encaixe Rápido (Walk-in & Cross-booking) */}
      <Modal visible={isModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: primaryColor }]}>
              {selectedWalkInBarber && selectedWalkInBarber !== user?.id ? 'Encaixe Cruzado (Colega)' : 'Meu Encaixe Rápido'}
            </Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Nome do Cliente</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: Carlos Walk-in"
                placeholderTextColor="#666"
                value={walkInName}
                onChangeText={setWalkInName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Selecione o Serviço</Text>
              {eligibleServices.length === 0 ? (
                <Text style={styles.emptyText}>Sem serviços ativos para este profissional.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                  {eligibleServices.map(s => {
                    const { price: customPrice, duration: customDuration } = getServicePriceAndDuration(s.id, selectedWalkInBarber || user?.id || null);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[
                          styles.modalOptionCard,
                          selectedWalkInService === s.id && [styles.modalOptionCardActive, { borderColor: primaryColor }]
                        ]}
                        onPress={() => {
                          setSelectedWalkInService(s.id);
                          setSelectedWalkInTime(null);
                        }}
                      >
                        <Text style={styles.modalOptionText}>{s.name}</Text>
                        <Text style={[styles.modalOptionSubText, { color: primaryColor }]}>{formatPrice(customPrice)}</Text>
                        <Text style={styles.modalOptionSubText}>{customDuration} min</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            {selectedWalkInService && (
              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Horários Disponíveis (Sem Conflito)</Text>
                <View style={styles.modalTimeGrid}>
                  {getWalkInAvailableTimes(selectedWalkInBarber || user?.id || '').length === 0 ? (
                    <Text style={styles.emptyText}>Sem slots de tempo livres para a duração do serviço.</Text>
                  ) : (
                    getWalkInAvailableTimes(selectedWalkInBarber || user?.id || '').map(time => (
                      <TouchableOpacity
                        key={time}
                        style={[
                          styles.modalTimeCard,
                          selectedWalkInTime === time && [styles.modalTimeCardActive, { backgroundColor: primaryColor }]
                        ]}
                        onPress={() => setSelectedWalkInTime(time)}
                      >
                        <Text style={[
                          styles.modalTimeText,
                          selectedWalkInTime === time && { color: '#121212' }
                        ]}>{time}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsModalOpen(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.modalConfirmBtn, { backgroundColor: primaryColor }]} 
                onPress={handleAddWalkIn}
              >
                <Text style={styles.modalConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  inputGroup: {
    marginBottom: 16,
  },
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
    backgroundColor: '#1c1c1e',
  },
  welcomeText: {
    fontSize: 12,
    color: '#a0a0a0',
    textTransform: 'uppercase',
  },
  barberName: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  logoutButton: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tabSelector: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderBottomWidth: 1.5,
    borderBottomColor: '#2c2c2e',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomWidth: 3,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#a0a0a0',
  },
  fullWidth: {
    width: '100%',
    maxWidth: 600,
  },
  syncBanner: {
    width: '100%',
    maxWidth: 600,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 20,
  },
  syncText: {
    color: '#fff',
    fontSize: 14,
  },
  syncButton: {
    borderWidth: 1.5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  syncButtonText: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  earningsCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    alignItems: 'center',
    marginBottom: 24,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#a0a0a0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  earningsValue: {
    fontSize: 32,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginVertical: 8,
  },
  earningsSubText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  dateSection: {
    marginBottom: 24,
  },
  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  walkInBtn: {
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  walkInBtnText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 12,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  dateCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2c2c2e',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  dateCardActive: {
    borderWidth: 2,
    backgroundColor: '#1c1c1e',
  },
  dateLabel: {
    color: '#a0a0a0',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  dateDayStr: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginTop: 8,
  },
  emptyText: {
    color: '#666',
  },
  warningCard: {
    backgroundColor: '#ff453a15',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#ff453a44',
    marginBottom: 24,
  },
  warningTitle: {
    color: '#ff453a',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  warningText: {
    color: '#a0a0a0',
    fontSize: 13,
    lineHeight: 18,
  },
  appointmentCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 12,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
    paddingBottom: 10,
    marginBottom: 10,
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Inter_600SemiBold',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgePending: {
    backgroundColor: '#ffb30033',
  },
  badgeConfirmed: {
    backgroundColor: '#0a84ff33',
  },
  badgeCompleted: {
    backgroundColor: '#30d15833',
  },
  badgeCancelled: {
    backgroundColor: '#ff453a33',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#fff',
  },
  appointmentBody: {
    gap: 4,
    marginBottom: 14,
  },
  clientLabel: {
    fontSize: 9,
    color: '#666',
    fontWeight: 'bold',
  },
  clientName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  serviceLabel: {
    fontSize: 9,
    color: '#666',
    fontWeight: 'bold',
    marginTop: 8,
  },
  serviceText: {
    color: '#a0a0a0',
    fontSize: 14,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: '#ff453a15',
    borderWidth: 1,
    borderColor: '#ff453a55',
  },
  btnTextCancel: {
    color: '#ff453a',
    fontWeight: 'bold',
  },
  btnTextComplete: {
    color: '#121212',
    fontWeight: 'bold',
  },
  // Equipe / A Loja
  teamBarberSection: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 16,
    marginBottom: 16,
  },
  teamBarberHeader: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 14,
  },
  teamBarberName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  teamBarberRole: {
    color: '#a0a0a0',
    fontSize: 10,
    textTransform: 'uppercase',
    marginTop: 2,
    fontWeight: 'bold',
  },
  availabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  availSlotCard: {
    width: '48%',
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
  },
  availSlotLivre: {
    backgroundColor: '#2c2c2e',
    borderColor: '#3a3a3c',
  },
  availSlotOcupado: {
    backgroundColor: '#ff453a0a',
    borderColor: '#ff453a22',
  },
  availSlotTime: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  availSlotStatus: {
    color: '#666',
    fontSize: 12,
    fontWeight: 'bold',
  },
  availSlotBookBtn: {
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  availSlotBookBtnText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 10,
  },
  // Modal de Encaixe
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000aa',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 11,
    color: '#a0a0a0',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  modalOptionCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#3a3a3c',
    padding: 12,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 90,
  },
  modalOptionCardActive: {
    borderWidth: 2,
    backgroundColor: '#1c1c1e',
  },
  modalOptionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalOptionSubText: {
    fontSize: 10,
    marginTop: 2,
    color: '#a0a0a0',
  },
  modalTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  modalTimeCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#3a3a3c',
    paddingVertical: 8,
    width: '22%',
    alignItems: 'center',
  },
  modalTimeCardActive: {
    borderWidth: 0,
  },
  modalTimeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
