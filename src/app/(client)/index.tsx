import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { database } from '../../database';
import { Barbershop, Appointment } from '../../database/models';
import { ExploreExperience } from '../../components/screens/ExploreExperience';

export default ExploreExperience;

function LegacyClientDashboard() {
  const { t, i18n } = useTranslation();
  const { profile, signOut } = useAuth();
  const { isSyncing, syncError, sync } = useSync();
  const [barbershops, setBarbershops] = useState<Barbershop[]>([]);
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // 1. Ouvir as barbearias ativas localmente no WatermelonDB
    const barbershopsSub = database.collections
      .get<Barbershop>('barbershops')
      .query()
      .observe()
      .subscribe((data) => {
        setBarbershops(data);
        setLoading(false);
      });

    // 2. Ouvir os agendamentos do cliente logado no WatermelonDB
    const appointmentsSub = database.collections
      .get<Appointment>('appointments')
      .query()
      .observe()
      .subscribe((data) => {
        const sorted = [...data].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        setMyAppointments(sorted);
      });

    // Sincronização inicial gerenciada pelo hook useSync automaticamente

    return () => {
      barbershopsSub.unsubscribe();
      appointmentsSub.unsubscribe();
    };
  }, []);

  const formatDate = (date: Date, timezone: string = 'America/Sao_Paulo') => {
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    try {
      const formatted = new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      }).format(date);
      return i18n.language === 'en' ? formatted : `${formatted}h`;
    } catch (e) {
      const formatted = date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      return i18n.language === 'en' ? formatted : `${formatted}h`;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>{t('common.welcome')}</Text>
          <Text style={styles.userName}>{profile?.name || 'Client'}</Text>
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
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]} 
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

      {/* Próximos Agendamentos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('client.appointments_title')}</Text>
        {myAppointments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('client.no_appointments')}</Text>
          </View>
        ) : (
          <FlatList
            data={myAppointments.slice(0, 3)}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              // Encontra a barbearia do agendamento para pegar a timezone correta
              const bshop = barbershops.find((b) => b.id === item.barbershopId);
              return (
                <View style={styles.appointmentCard}>
                  <View>
                    <Text style={styles.appointmentDate}>
                      {formatDate(item.dateTime, bshop?.timezone)}
                    </Text>
                    <Text style={styles.appointmentStatus}>
                      Status: {t(`admin.status_${item.status}`)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* Catálogo de Barbearias */}
      <View style={[styles.section, { flex: 1 }]}>
        <Text style={styles.sectionTitle}>{t('client.partners_title')}</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#D4AF37" style={{ marginTop: 24 }} />
        ) : barbershops.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('client.no_barbershops')}</Text>
          </View>
        ) : (
          <FlatList
            data={barbershops}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.barbershopCard, { borderLeftColor: item.primaryColor || '#D4AF37' }]}
                onPress={() => router.push({ pathname: '/(client)/barbershop', params: { barbershopId: item.id } })}
              >
                <View style={styles.barbershopInfo}>
                  <Text style={styles.barbershopName}>{item.name}</Text>
                  <Text style={styles.barbershopSlug}>cutsync.com/{item.slug}</Text>
                </View>
                <TouchableOpacity 
                  style={[styles.bookButton, { backgroundColor: item.primaryColor || '#D4AF37' }]}
                  onPress={() => router.push({ pathname: '/(client)/barbershop', params: { barbershopId: item.id } })}
                >
                  <Text style={styles.bookButtonText}>Ver</Text>
                </TouchableOpacity>
              </TouchableOpacity>
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
  welcomeText: {
    fontSize: 16,
    color: '#a0a0a0',
    fontFamily: 'Inter_400Regular',
  },
  userName: {
    fontSize: 24,
    color: '#fff',
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
    marginBottom: 24,
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
    backgroundColor: '#D4AF37',
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'Montserrat_700Bold',
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#666',
    textAlign: 'center',
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
  appointmentDate: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  appointmentStatus: {
    fontSize: 12,
    color: '#D4AF37',
    marginTop: 4,
    fontWeight: '600',
  },
  barbershopCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  barbershopInfo: {
    flex: 1,
  },
  barbershopName: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  barbershopSlug: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  bookButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bookButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
