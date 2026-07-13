import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { database } from '../../database';
import { Barbershop, Appointment } from '../../database/models';

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!profile?.barbershop_id) {
      setLoading(false);
      return;
    }

    // 1. Ouvir a barbearia correspondente localmente
    const barbershopSub = database.collections
      .get<Barbershop>('barbershops')
      .findAndObserve(profile.barbershop_id)
      .subscribe({
        next: (data) => setBarbershop(data),
        error: () => console.log('Barbearia ainda não sincronizada localmente'),
      });

    // 2. Ouvir os agendamentos da barbearia
    const appointmentsSub = database.collections
      .get<Appointment>('appointments')
      .query()
      .observe()
      .subscribe((data) => {
        // Filtra os agendamentos pertencentes a esta barbearia e ordena por data
        const filtered = data
          .filter((app) => app.barbershopId === profile.barbershop_id)
          .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        setAppointments(filtered);
        setLoading(false);
      });

    // Disparar sincronização inicial ao entrar no painel
    sync();

    return () => {
      barbershopSub.unsubscribe();
      appointmentsSub.unsubscribe();
    };
  }, [profile]);

  const handleUpdateStatus = async (appointmentId: string, newStatus: 'confirmed' | 'cancelled' | 'completed') => {
    try {
      // Atualiza o agendamento localmente no WatermelonDB
      await database.write(async () => {
        const appointment = await database.collections.get<Appointment>('appointments').find(appointmentId);
        await appointment.update((record) => {
          record.status = newStatus;
        });
      });
      
      Alert.alert('Sucesso', 'Status do agendamento atualizado localmente!');
      // Dispara sincronização em background
      sync();
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível atualizar o status.');
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }) + 'h';
  };

  const primaryColor = barbershop?.primaryColor || '#D4AF37';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.barberName}>Painel do Barbeiro</Text>
          <Text style={[styles.barbershopName, { color: primaryColor }]}>
            {loading ? 'Carregando...' : barbershop?.name || 'Sua Barbearia'}
          </Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutText}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Status Panel */}
      <View style={styles.syncPanel}>
        <View style={styles.syncStatusContainer}>
          <Text style={styles.syncStatusText}>
            {isSyncing ? 'Sincronizando com nuvem...' : 'Banco Local Sincronizado'}
          </Text>
          {syncError && <Text style={styles.syncErrorText}>Erro de rede na sincronização</Text>}
        </View>
        <TouchableOpacity 
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled, { backgroundColor: primaryColor }]} 
          onPress={sync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator size="small" color="#121212" />
          ) : (
            <Text style={styles.syncButtonText}>Sincronizar</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Atalhos */}
      <View style={styles.shortcuts}>
        <TouchableOpacity 
          style={styles.shortcutButton}
          onPress={() => router.push('/(admin)/services')}
        >
          <Text style={[styles.shortcutButtonText, { color: primaryColor }]}>Gerenciar Serviços</Text>
        </TouchableOpacity>
      </View>

      {/* Lista da Agenda */}
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>Agenda de Hoje</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color={primaryColor} style={{ marginTop: 32 }} />
        ) : appointments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Sem agendamentos registrados localmente.</Text>
          </View>
        ) : (
          <FlatList
            data={appointments}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <Text style={styles.appointmentDate}>{formatDate(item.dateTime)}</Text>
                  <Text style={[styles.statusBadge, { 
                    color: item.status === 'completed' ? '#30d158' : item.status === 'cancelled' ? '#ff453a' : primaryColor 
                  }]}>
                    {item.status.toUpperCase()}
                  </Text>
                </View>
                
                <Text style={styles.clientLabel}>Cliente ID: <Text style={styles.clientValue}>{item.clientId}</Text></Text>
                
                {item.status === 'pending' && (
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.confirmButton]}
                      onPress={() => handleUpdateStatus(item.id, 'confirmed')}
                    >
                      <Text style={styles.actionButtonText}>Confirmar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.cancelButton]}
                      onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                    >
                      <Text style={styles.actionButtonText}>Recusar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {item.status === 'confirmed' && (
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.completeButton]}
                      onPress={() => handleUpdateStatus(item.id, 'completed')}
                    >
                      <Text style={styles.actionButtonText}>Concluir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.cancelButton]}
                      onPress={() => handleUpdateStatus(item.id, 'cancelled')}
                    >
                      <Text style={styles.actionButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
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
    fontSize: 14,
    color: '#a0a0a0',
  },
  barbershopName: {
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2c2c2e',
  },
  logoutText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 14,
  },
  syncPanel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
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
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
  },
  appointmentCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  appointmentDate: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  clientLabel: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 14,
  },
  clientValue: {
    color: '#fff',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  confirmButton: {
    backgroundColor: '#30d158',
  },
  cancelButton: {
    backgroundColor: '#ff453a',
  },
  completeButton: {
    backgroundColor: '#0a84ff',
  },
});
