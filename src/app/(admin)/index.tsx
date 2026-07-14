import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { database } from '../../database';
import { Barbershop, Appointment, Profile, Service } from '../../database/models';
import { AdminDashboardExperience } from '../../components/screens/AdminDashboardExperience';

export default AdminDashboardExperience;

interface RichAppointment {
  id: string;
  dateTime: Date;
  status: string;
  clientName: string;
  serviceName: string;
  price: number;
  professionalId: string;
}

function LegacyAdminDashboard() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [appointments, setAppointments] = useState<RichAppointment[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Estado de Período do Dashboard Analítico
  const [period, setPeriod] = useState<'today' | '7days' | '30days'>('today');
  
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const router = useRouter();

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
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

  // 1. Ouvir dados principais
  useEffect(() => {
    if (!profile?.establishment_id) {
      setLoading(false);
      return;
    }

    const barbershopSub = database.collections
      .get<Barbershop>('barbershops')
      .findAndObserve(profile.establishment_id)
      .subscribe({
        next: (data) => setBarbershop(data),
        error: () => console.log('Barbershop not found locally yet'),
      });

    const barbersSub = database.collections
      .get<Profile>('profiles')
      .query(
        Q.where('establishment_id', profile.establishment_id),
        Q.where('role', Q.oneOf(['professional', 'admin']))
      )
      .observe()
      .subscribe((data) => setBarbers(data));

    const servicesSub = database.collections
      .get<Service>('services')
      .query(Q.where('establishment_id', profile.establishment_id))
      .observe()
      .subscribe((data) => setServices(data));

    return () => {
      barbershopSub.unsubscribe();
      barbersSub.unsubscribe();
      servicesSub.unsubscribe();
    };
  }, [profile]);

  // 2. Ouvir agendamentos com base no Período Selecionado
  useEffect(() => {
    if (!profile?.establishment_id) return;

    const startPeriod = new Date(selectedDate);
    if (period === 'today') {
      startPeriod.setHours(0, 0, 0, 0);
    } else if (period === '7days') {
      startPeriod.setDate(startPeriod.getDate() - 6);
      startPeriod.setHours(0, 0, 0, 0);
    } else if (period === '30days') {
      startPeriod.setDate(startPeriod.getDate() - 29);
      startPeriod.setHours(0, 0, 0, 0);
    }

    const endPeriod = new Date(selectedDate);
    endPeriod.setHours(23, 59, 59, 999);

    const appointmentsSub = database.collections
      .get<Appointment>('appointments')
      .query(
        Q.where('establishment_id', profile.establishment_id),
        Q.where('date_time', Q.between(startPeriod.getTime(), endPeriod.getTime()))
      )
      .observe()
      .subscribe(async (list) => {
        try {
          const richList: RichAppointment[] = [];
          for (const apt of list) {
            let clientName = apt.clientName || 'Cliente Walk-in';
            if (apt.clientId) {
              try {
                const cl = await database.collections.get<Profile>('profiles').find(apt.clientId);
                clientName = cl.name;
              } catch (e) {}
            }

            let serviceName = 'Serviço Removido';
            let price = 0;
            try {
              const sv = await database.collections.get<Service>('services').find(apt.serviceId);
              serviceName = sv.name;
              price = sv.price;
            } catch (e) {}

            richList.push({
              id: apt.id,
              dateTime: apt.dateTime,
              status: apt.status,
              clientName,
              serviceName,
              price,
              professionalId: apt.professionalId,
            });
          }
          richList.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
          setAppointments(richList);
          setLoading(false);
        } catch (err) {
          console.error('Erro ao buscar agenda reativa:', err);
        }
      });

    return () => appointmentsSub.unsubscribe();
  }, [profile, selectedDate, period]);

  const handleUpdateStatus = async (appointmentId: string, newStatus: 'confirmed' | 'cancelled' | 'completed') => {
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
      displayAlert(t('common.error'), 'Could not update status.');
    } finally {
      setActionLoadingId(null);
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

  // KPIs Calculados dinamicamente com base no período
  const activeAppointments = appointments.filter(a => a.status !== 'cancelled');
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  
  const dailyRevenue = completedAppointments.reduce((acc, curr) => acc + curr.price, 0);
  const totalCuts = completedAppointments.length;
  
  const daysCount = period === 'today' ? 1 : (period === '7days' ? 7 : 30);
  const totalSlotsPeriod = 12 * Math.max(1, barbers.length) * daysCount;
  const occupancyRate = Math.min(100, Math.round((activeAppointments.length / totalSlotsPeriod) * 100));

  const getBarberCommissionStatement = (barber: Profile) => {
    const barberCuts = appointments.filter(a => a.professionalId === barber.id && a.status === 'completed');
    const faturamento = barberCuts.reduce((acc, curr) => acc + curr.price, 0);
    const taxaComissao = barber.commissionRate !== undefined && barber.commissionRate !== null ? barber.commissionRate : 0.50;
    const valorComissao = faturamento * taxaComissao;
    return {
      faturamento,
      taxaComissao: taxaComissao * 100,
      valorComissao,
    };
  };

  const primaryColor = barbershop?.primaryColor || '#D4AF37';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View>
          <Text style={styles.barberName}>Painel Administrativo</Text>
          <Text style={[styles.barbershopName, { color: primaryColor }]}>
            {loading ? '...' : barbershop?.name || 'My Barbershop'}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>{t('common.logout')}</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Status Panel */}
      <View style={styles.syncPanel}>
        <View style={styles.syncStatusContainer}>
          <Text style={styles.syncStatusText}>
            {isSyncing ? t('common.syncing') : t('common.offline_active')}
          </Text>
          {syncError && <Text style={styles.syncErrorText}>{t('common.sync_error')}</Text>}
        </View>
        <TouchableOpacity 
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled, { backgroundColor: primaryColor }]} 
          onPress={sync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#121212" />
          ) : (
            <Text style={styles.syncButtonText}>{t('common.sync_button')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Atalhos */}
      <View style={styles.shortcuts}>
        <TouchableOpacity 
          style={styles.shortcutButton}
          onPress={() => router.push('/(admin)/services')}
        >
          <Text style={[styles.shortcutButtonText, { color: primaryColor }]}>{t('admin.manage_services')}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.shortcutButton}
          onPress={() => router.push('/(admin)/barbers')}
        >
          <Text style={[styles.shortcutButtonText, { color: primaryColor }]}>Equipe</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.shortcutButton}
          onPress={() => router.push('/(admin)/settings')}
        >
          <Text style={[styles.shortcutButtonText, { color: primaryColor }]}>Configurações</Text>
        </TouchableOpacity>
      </View>

      {/* Seletor de Período do Dashboard Analítico */}
      <View style={styles.periodSelector}>
        <TouchableOpacity 
          style={[styles.periodButton, period === 'today' && [styles.periodButtonActive, { backgroundColor: primaryColor }]]}
          onPress={() => setPeriod('today')}
        >
          <Text style={[styles.periodButtonText, period === 'today' && { color: '#121212' }]}>Hoje</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.periodButton, period === '7days' && [styles.periodButtonActive, { backgroundColor: primaryColor }]]}
          onPress={() => setPeriod('7days')}
        >
          <Text style={[styles.periodButtonText, period === '7days' && { color: '#121212' }]}>7 Dias</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.periodButton, period === '30days' && [styles.periodButtonActive, { backgroundColor: primaryColor }]]}
          onPress={() => setPeriod('30days')}
        >
          <Text style={[styles.periodButtonText, period === '30days' && { color: '#121212' }]}>30 Dias</Text>
        </TouchableOpacity>
      </View>

      {/* KPIs Financeiros */}
      <View style={styles.kpiContainer}>
        <Text style={styles.sectionTitle}>
          {period === 'today' ? 'Fechamento de Caixa do Dia' : (period === '7days' ? 'Caixa Acumulado de 7 Dias' : 'Caixa Acumulado de 30 Dias')}
        </Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Faturamento Total</Text>
            <Text style={[styles.kpiValue, { color: '#30d158' }]}>{formatPrice(dailyRevenue)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Cortes Concluídos</Text>
            <Text style={[styles.kpiValue, { color: primaryColor }]}>{totalCuts}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Taxa de Ocupação</Text>
            <Text style={[styles.kpiValue, { color: '#0a84ff' }]}>{occupancyRate}%</Text>
          </View>
        </View>

        {/* Divisão por Barbeiro */}
        <View style={styles.earningsTable}>
          <Text style={styles.tableTitle}>Extrato por Profissional</Text>
          {barbers.map(barber => {
            const statement = getBarberCommissionStatement(barber);
            return (
              <View key={barber.id} style={styles.tableRow}>
                <View>
                  <Text style={styles.tableBarberName}>{barber.name}</Text>
                  <Text style={styles.tableBarberRate}>Comissão: {statement.taxaComissao}%</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.tableFaturamento}>{formatPrice(statement.faturamento)} bruto</Text>
                  <Text style={[styles.tableComissao, { color: primaryColor }]}>
                    Repasse: {formatPrice(statement.valorComissao)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Gráficos Analíticos */}
      {period !== 'today' && (
        <View style={styles.chartsContainer}>
          <Text style={styles.sectionTitle}>
            Análise do Período ({period === '7days' ? 'Últimos 7 dias' : 'Últimos 30 dias'})
          </Text>
          
          {/* Gráfico 1: Evolução do Faturamento Diário (Barras Verticais) */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Evolução do Faturamento</Text>
            {(() => {
              const daysList = [];
              const totalDays = period === '7days' ? 7 : 30;

              for (let i = totalDays - 1; i >= 0; i--) {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - i);
                daysList.push({
                  dateStr: d.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'pt-BR', { day: '2-digit', month: '2-digit' }),
                  dateKey: d.toDateString(),
                  revenue: 0,
                });
              }

              // Agrupar faturamento concluído por data
              daysList.forEach(day => {
                const dayApts = appointments.filter(
                  a => a.status === 'completed' && new Date(a.dateTime).toDateString() === day.dateKey
                );
                day.revenue = dayApts.reduce((acc, curr) => acc + curr.price, 0);
              });

              const maxRevenue = Math.max(...daysList.map(d => d.revenue), 1);

              return (
                <View style={styles.verticalChartWrapper}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barGrid}>
                    {daysList.map((day, idx) => {
                      const percentage = (day.revenue / maxRevenue) * 100;
                      return (
                        <View key={idx} style={styles.verticalBarCol}>
                          <Text style={styles.barValueText}>{day.revenue > 0 ? formatPrice(day.revenue) : ''}</Text>
                          <View style={styles.barTrack}>
                            <View 
                              style={[
                                styles.barFill, 
                                { height: `${percentage}%`, backgroundColor: primaryColor }
                              ]} 
                            />
                          </View>
                          <Text style={styles.barLabelText}>{day.dateStr}</Text>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })()}
          </View>

          {/* Gráfico 2: Desempenho e Ranking por Barbeiro (Barras Horizontais) */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Ranking de Contribuição da Equipe</Text>
            {(() => {
              const totalRevenue = appointments
                .filter(a => a.status === 'completed')
                .reduce((acc, curr) => acc + curr.price, 0);

              return (
                <View style={{ gap: 14 }}>
                  {barbers.map(barber => {
                    const barberRevenue = appointments
                      .filter(a => a.professionalId === barber.id && a.status === 'completed')
                      .reduce((acc, curr) => acc + curr.price, 0);

                    const percentage = totalRevenue > 0 ? Math.round((barberRevenue / totalRevenue) * 100) : 0;

                    return (
                      <View key={barber.id} style={styles.horizontalBarRow}>
                        <View style={styles.horizontalBarMeta}>
                          <Text style={styles.horizontalBarName}>{barber.name}</Text>
                          <Text style={styles.horizontalBarValue}>
                            {formatPrice(barberRevenue)} ({percentage}%)
                          </Text>
                        </View>
                        <View style={styles.horizontalBarTrack}>
                          <View 
                            style={[
                              styles.horizontalBarFill, 
                              { width: `${percentage}%`, backgroundColor: primaryColor }
                            ]} 
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        </View>
      )}

      {/* Seletor de Data Rápido */}
      <View style={styles.dateSection}>
        <Text style={styles.sectionTitle}>Selecionar Dia da Agenda</Text>
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

      {/* Grade Panorâmica (Agenda Coletiva) */}
      <View style={styles.agendaSection}>
        <Text style={styles.sectionTitle}>Grade Panorâmica (Agenda Coletiva)</Text>
        {barbers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Sem profissionais na equipe cadastrados.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.panoramicScroll}>
            {barbers.map(barber => {
              const barberAppointments = appointments.filter(a => a.professionalId === barber.id);
              
              return (
                <View key={barber.id} style={styles.barberColumn}>
                  {/* Cabeçalho da coluna do profissional */}
                  <View style={[styles.columnHeader, { borderBottomColor: primaryColor }]}>
                    <Text style={styles.columnBarberName} numberOfLines={1}>{barber.name}</Text>
                    <Text style={styles.columnBarberRole}>
                      {barber.role === 'admin' ? 'PROPRIETÁRIO' : 'COLABORADOR'}
                    </Text>
                  </View>

                  {/* Lista de agendamentos da coluna */}
                  <ScrollView style={styles.columnList}>
                    {barberAppointments.length === 0 ? (
                      <Text style={styles.columnEmptyText}>Sem agendamentos</Text>
                    ) : (
                      barberAppointments.map(item => (
                        <View key={item.id} style={styles.miniAppointmentCard}>
                          <View style={styles.miniHeader}>
                            <Text style={[styles.miniTime, { color: primaryColor }]}>{formatDate(item.dateTime)}</Text>
                            <View style={[
                              styles.miniBadge,
                              item.status === 'completed' && styles.badgeCompleted,
                              item.status === 'cancelled' && styles.badgeCancelled,
                              item.status === 'confirmed' && styles.badgeConfirmed,
                              item.status === 'pending' && styles.badgePending,
                            ]}>
                              <Text style={styles.miniBadgeText}>{item.status.substring(0, 4).toUpperCase()}</Text>
                            </View>
                          </View>

                          <Text style={styles.miniClient} numberOfLines={1}>{item.clientName}</Text>
                          <Text style={styles.miniService} numberOfLines={1}>
                            {item.serviceName} • {formatPrice(item.price)}
                          </Text>

                          {/* Ações rápidas da State Machine */}
                          {item.status === 'pending' && (
                            <View style={styles.miniActions}>
                              <TouchableOpacity 
                                style={[styles.miniBtn, styles.miniBtnCancel]} 
                                onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                              >
                                <Text style={styles.miniBtnCancelText}>✕</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={[styles.miniBtn, { backgroundColor: primaryColor }]} 
                                onPress={() => handleUpdateStatus(item.id, 'confirmed')}
                              >
                                <Text style={styles.miniBtnConfirmText}>✓</Text>
                              </TouchableOpacity>
                            </View>
                          )}

                          {item.status === 'confirmed' && (
                            <View style={styles.miniActions}>
                              <TouchableOpacity 
                                style={[styles.miniBtn, styles.miniBtnCancel]} 
                                onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                              >
                                <Text style={styles.miniBtnCancelText}>✕</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={[styles.miniBtn, { backgroundColor: '#30d158' }]} 
                                onPress={() => handleUpdateStatus(item.id, 'completed')}
                              >
                                <Text style={styles.miniBtnConfirmText}>✓</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      ))
                    )}
                  </ScrollView>
                </View>
              );
            })}
          </ScrollView>
        )}
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
    padding: 24,
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  barberName: {
    fontSize: 12,
    color: '#a0a0a0',
    textTransform: 'uppercase',
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  logoutButton: {
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  logoutText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  syncPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 24,
  },
  syncStatusContainer: {
    flex: 1,
  },
  syncStatusText: {
    color: '#a0a0a0',
    fontSize: 13,
  },
  syncErrorText: {
    color: '#ff453a',
    fontSize: 11,
    marginTop: 2,
  },
  syncButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  syncButtonDisabled: {
    backgroundColor: '#3a3a3c',
  },
  syncButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 13,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  shortcutButton: {
    flex: 1,
    backgroundColor: '#1c1c1e',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shortcutButtonText: {
    fontWeight: 'bold',
    fontSize: 13,
  },
  // Períodos
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    gap: 4,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
  },
  periodButtonActive: {},
  periodButtonText: {
    color: '#a0a0a0',
    fontWeight: 'bold',
    fontSize: 13,
  },
  // KPIs
  kpiContainer: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  kpiGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    alignItems: 'center',
  },
  kpiLabel: {
    color: '#a0a0a0',
    fontSize: 10,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 6,
    fontFamily: 'Montserrat_700Bold',
  },
  earningsTable: {
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    paddingTop: 16,
  },
  tableTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2c2c2e',
  },
  tableBarberName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tableBarberRate: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  tableFaturamento: {
    color: '#fff',
    fontSize: 13,
  },
  tableComissao: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // Gráficos
  chartsContainer: {
    marginBottom: 24,
    width: '100%',
  },
  chartCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 16,
  },
  chartTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  verticalChartWrapper: {
    height: 160,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
  },
  barGrid: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingHorizontal: 8,
  },
  verticalBarCol: {
    alignItems: 'center',
    width: 42,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValueText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  barTrack: {
    flex: 1,
    width: 14,
    backgroundColor: '#2c2c2e',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barLabelText: {
    color: '#666',
    fontSize: 8,
    marginTop: 6,
    fontWeight: 'bold',
  },
  horizontalBarRow: {
    marginBottom: 12,
  },
  horizontalBarMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  horizontalBarName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  horizontalBarValue: {
    color: '#a0a0a0',
    fontSize: 12,
  },
  horizontalBarTrack: {
    height: 8,
    backgroundColor: '#2c2c2e',
    borderRadius: 4,
    overflow: 'hidden',
  },
  horizontalBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  // Dias rápidos
  dateSection: {
    marginBottom: 24,
  },
  dateCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2c2c2e',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 8,
    alignItems: 'center',
    minWidth: 64,
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
  agendaSection: {
    marginBottom: 24,
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#666',
  },
  panoramicScroll: {
    marginTop: 8,
  },
  barberColumn: {
    width: 200,
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 12,
    marginRight: 12,
    height: 420,
  },
  columnHeader: {
    borderBottomWidth: 3,
    paddingBottom: 8,
    marginBottom: 12,
  },
  columnBarberName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  columnBarberRole: {
    color: '#a0a0a0',
    fontSize: 9,
    marginTop: 2,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  columnList: {
    flex: 1,
  },
  columnEmptyText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  miniAppointmentCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  miniHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  miniTime: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  miniBadge: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  miniBadgeText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#fff',
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
  miniClient: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  miniService: {
    color: '#a0a0a0',
    fontSize: 11,
    marginTop: 2,
  },
  miniActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  miniBtn: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBtnCancel: {
    backgroundColor: '#ff453a15',
    borderWidth: 1,
    borderColor: '#ff453a55',
  },
  miniBtnCancelText: {
    color: '#ff453a',
    fontSize: 11,
    fontWeight: 'bold',
  },
  miniBtnConfirmText: {
    color: '#121212',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
