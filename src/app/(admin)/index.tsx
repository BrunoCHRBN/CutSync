import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { database } from '../../database';
import { Barbershop, Appointment, Profile, Service } from '../../database/models';

interface RichAppointment {
  id: string;
  dateTime: Date;
  status: string;
  clientName: string;
  serviceName: string;
  price: number;
  barberId: string;
}

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [appointments, setAppointments] = useState<RichAppointment[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
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

  useEffect(() => {
    if (!profile?.barbershop_id) {
      setLoading(false);
      return;
    }

    // 1. Ouvir barbearia
    const barbershopSub = database.collections
      .get<Barbershop>('barbershops')
      .findAndObserve(profile.barbershop_id)
      .subscribe({
        next: (data) => setBarbershop(data),
        error: () => console.log('Barbershop not found locally yet'),
      });

    // 2. Ouvir barbeiros da equipe
    const barbersSub = database.collections
      .get<Profile>('profiles')
      .query(
        Q.where('barbershop_id', profile.barbershop_id),
        Q.where('role', Q.oneOf(['barber', 'admin']))
      )
      .observe()
      .subscribe((data) => setBarbers(data));

    // 3. Ouvir serviços do salão
    const servicesSub = database.collections
      .get<Service>('services')
      .query(Q.where('barbershop_id', profile.barbershop_id))
      .observe()
      .subscribe((data) => setServices(data));

    return () => {
      barbershopSub.unsubscribe();
      barbersSub.unsubscribe();
      servicesSub.unsubscribe();
    };
  }, [profile]);

  // 4. Ouvir agendamentos da data selecionada
  useEffect(() => {
    if (!profile?.barbershop_id) return;

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const appointmentsSub = database.collections
      .get<Appointment>('appointments')
      .query(
        Q.where('barbershop_id', profile.barbershop_id),
        Q.where('date_time', Q.between(startOfDay.getTime(), endOfDay.getTime()))
      )
      .observe()
      .subscribe(async (list) => {
        try {
          const richList: RichAppointment[] = [];
          for (const apt of list) {
            // Obter nome do cliente
            let clientName = apt.clientName || 'Cliente Walk-in';
            if (apt.clientId) {
              try {
                const cl = await database.collections.get<Profile>('profiles').find(apt.clientId);
                clientName = cl.name;
              } catch (e) {
                // mantém padrão
              }
            }

            // Obter nome e preço do serviço
            let serviceName = 'Serviço Removido';
            let price = 0;
            try {
              const sv = await database.collections.get<Service>('services').find(apt.serviceId);
              serviceName = sv.name;
              price = sv.price;
            } catch (e) {
              // mantém padrão
            }

            richList.push({
              id: apt.id,
              dateTime: apt.dateTime,
              status: apt.status,
              clientName,
              serviceName,
              price,
              barberId: apt.barberId,
            });
          }
          // Ordenar por hora
          richList.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
          setAppointments(richList);
          setLoading(false);
        } catch (err) {
          console.error('Erro ao buscar agenda reativa:', err);
        }
      });

    return () => appointmentsSub.unsubscribe();
  }, [profile, selectedDate]);

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

  // KPIs Financeiros
  const activeAppointments = appointments.filter(a => a.status !== 'cancelled');
  const completedAppointments = appointments.filter(a => a.status === 'completed');
  
  const dailyRevenue = completedAppointments.reduce((acc, curr) => acc + curr.price, 0);
  const totalCuts = completedAppointments.length;
  
  // Taxa de ocupação (12 slots por barbeiro)
  const totalSlots = 12 * Math.max(1, barbers.length);
  const occupancyRate = Math.min(100, Math.round((activeAppointments.length / totalSlots) * 100));

  // Extrato de Comissões por Barbeiro
  const getBarberCommissionStatement = (barber: Profile) => {
    const barberCuts = appointments.filter(a => a.barberId === barber.id && a.status === 'completed');
    const faturamento = barberCuts.reduce((acc, curr) => acc + curr.price, 0);
    const taxaComissao = barber.commissionRate !== undefined && barber.commissionRate !== null ? barber.commissionRate : 0.50; // 50% padrão
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

      {/* KPIs Financeiros (Fechamento de Caixa) */}
      <View style={styles.kpiContainer}>
        <Text style={styles.sectionTitle}>Fechamento de Caixa do Dia</Text>
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
              // Filtrar agendamentos deste profissional
              const barberAppointments = appointments.filter(a => a.barberId === barber.id);
              
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
                                <Text style={styles.miniBtnCancelText}>Falta</Text>
                              </TouchableOpacity>
                              <TouchableOpacity 
                                style={[styles.miniBtn, { backgroundColor: '#30d158' }]} 
                                onPress={() => handleUpdateStatus(item.id, 'completed')}
                              >
                                <Text style={styles.miniBtnConfirmText}>Fim</Text>
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
    paddingBottom: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
  // KPIs
  kpiContainer: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 12,
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  kpiLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginTop: 6,
  },
  // Tabela de Repasse
  earningsTable: {
    borderTopWidth: 1,
    borderTopColor: '#2c2c2e',
    paddingTop: 16,
  },
  tableTitle: {
    color: '#a0a0a0',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
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
    color: '#a0a0a0',
    fontSize: 12,
  },
  tableComissao: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 2,
  },
  // Data Section
  dateSection: {
    marginBottom: 24,
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
  // Agenda Section (Grade Panorâmica)
  agendaSection: {
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  emptyText: {
    color: '#666',
  },
  panoramicScroll: {
    paddingVertical: 8,
  },
  barberColumn: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2c2c2e',
    width: 200,
    marginRight: 12,
    height: 400,
    padding: 12,
  },
  columnHeader: {
    borderBottomWidth: 1.5,
    paddingBottom: 8,
    marginBottom: 12,
  },
  columnBarberName: {
    color: '#fff',
    fontSize: 14,
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
  // Mini cards na grade
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
