import { colors } from '../../theme/tokens';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Profile, Barbershop } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { TeamExperience } from '../../components/screens/TeamExperience';

export default TeamExperience;

function LegacyManageBarbersScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const displayAlert = (title: string, message: string) => {
    console.warn(`${title}: ${message}`);
  };

  useEffect(() => {
    if (!profile?.establishment_id) {
      setLoading(false);
      return;
    }

    // 1. Carregar a barbearia
    const bSub = database.collections
      .get<Barbershop>('establishments')
      .findAndObserve(profile.establishment_id)
      .subscribe((data) => setBarbershop(data));

    // 2. Carregar barbeiros da equipe (role = 'barber' vinculados a essa barbearia)
    const barbersQuery = database.collections
      .get<Profile>('profiles')
      .query(
        Q.where('establishment_id', profile.establishment_id),
        Q.where('role', Q.oneOf(['professional', 'barber', 'admin']))
      );

    const bListSub = barbersQuery.observe().subscribe({
      next: (list) => {
        setBarbers(list);
        setLoading(false);
      },
      error: () => setLoading(false)
    });

    return () => {
      bSub.unsubscribe();
      bListSub.unsubscribe();
    };
  }, [profile]);

  const handleRemoveBarber = async (barberId: string) => {
    const confirmText = 'Você tem certeza que deseja remover este profissional da sua equipe? Ele não aparecerá mais para agendamentos de clientes.';
    
    console.warn(confirmText);
    return;

    setActionLoadingId(barberId);
    try {
      await database.write(async () => {
        const pRecord = await database.collections.get<Profile>('profiles').find(barberId);
        await pRecord.update((record) => {
          record.establishmentId = null; // desvincula do estabelecimento
        });
      });
      
      displayAlert('Sucesso', 'Profissional removido da equipe com sucesso!');
      sync();
    } catch (err) {
      displayAlert('Erro', 'Não foi possível desvincular o profissional.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUpdateCommission = async (barberId: string, currentRate?: number) => {
    const currentPercent = currentRate !== undefined && currentRate !== null ? currentRate * 100 : 50;
    
    const inputVal: string | null = null;

    if (inputVal === null) return;
    const parsedPercent = parseFloat(inputVal);
    if (isNaN(parsedPercent) || parsedPercent < 0 || parsedPercent > 100) {
      displayAlert('Erro', 'Por favor, digite um valor percentual válido entre 0 e 100.');
      return;
    }

    const newRate = parsedPercent / 100;
    setActionLoadingId(barberId);
    try {
      await database.write(async () => {
        const barberRecord = await database.collections.get<Profile>('profiles').find(barberId);
        await barberRecord.update((record) => {
          record.commissionRate = newRate;
        });
      });
      displayAlert('Sucesso', 'Comissão do profissional atualizada!');
      sync();
    } catch (err) {
      displayAlert('Erro', 'Não foi possível atualizar a comissão.');
    } finally {
      setActionLoadingId(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  const primaryColor = barbershop?.primaryColor || '#D4AF37';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>GERENCIAR EQUIPE</Text>
        <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>
      </View>

      <FlatList
        data={barbers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          /* Instruções de convite (Como o barbeiro se cadastra e entra na equipe) */
          <View style={styles.instructionCard}>
            <Text style={[styles.instructionTitle, { color: primaryColor }]}>Como Adicionar Profissionais</Text>
            <Text style={styles.instructionText}>
              Para adicionar profissionais à sua equipe contratada, instrua-os a fazer o cadastro no Cutsync escolhendo a opção de perfil <Text style={{ fontWeight: 'bold', color: colors.text }}>Profissional</Text> e informando o seguinte código do estabelecimento:
            </Text>
            <View style={styles.slugContainer}>
              <Text style={[styles.slugText, { color: primaryColor }]}>{barbershop?.slug}</Text>
            </View>
            <Text style={styles.instructionNote}>
              Eles serão vinculados de forma automática e aparecerão no painel de agendamento do cliente.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Nenhum profissional cadastrado na equipe ainda.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.barberCard}>
            <View style={styles.barberInfo}>
              <View style={[styles.avatarCircle, { backgroundColor: primaryColor + '22' }]}>
                <Text style={[styles.avatarText, { color: primaryColor }]}>
                  {item.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.barberName}>{item.name}</Text>
                <Text style={{ fontSize: 10, color: colors.brand, fontWeight: 'bold', marginVertical: 2 }}>{item.tituloProfissional || 'Especialista'}</Text>
                <Text style={styles.barberEmail}>{item.email}</Text>
                <Text style={styles.barberPhone}>{item.phone || 'Sem telefone cadastrado'}</Text>
                <TouchableOpacity 
                  style={{ marginTop: 6, alignSelf: 'flex-start' }}
                  onPress={() => handleUpdateCommission(item.id, item.commissionRate)}
                >
                  <Text style={{ fontSize: 12, color: primaryColor, fontWeight: 'bold' }}>
                    Comissão: {item.commissionRate !== undefined && item.commissionRate !== null ? item.commissionRate * 100 : 50}% (Editar)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity 
              style={styles.removeButton}
              onPress={() => handleRemoveBarber(item.id)}
              disabled={actionLoadingId !== null}
            >
              {actionLoadingId === item.id ? (
                <ActivityIndicator size="small" color="#ff453a" />
              ) : (
                <Text style={styles.removeButtonText}>Remover</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(admin)');
          }
        }}
      >
        <Text style={styles.backButtonText}>{t('common.back')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    padding: 24,
    paddingTop: 48,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 24,
  },
  instructionCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 8,
  },
  instructionText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  slugContainer: {
    backgroundColor: colors.surfacePressed,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slugText: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  instructionNote: {
    color: colors.textMuted,
    fontSize: 11,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
  barberCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  barberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  barberName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: 'bold',
  },
  barberEmail: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  barberPhone: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  removeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#ff453a15',
    borderWidth: 1,
    borderColor: '#ff453a44',
  },
  removeButtonText: {
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: 12,
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  backButtonText: {
    color: colors.danger,
    fontWeight: 'bold',
    fontSize: 14,
  },
});
