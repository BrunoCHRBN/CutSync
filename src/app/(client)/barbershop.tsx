import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Alert, ImageBackground } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Profile, Barbershop } from '../../database/models';

export default function BarbershopDetailsScreen() {
  const { t, i18n } = useTranslation();
  const { barbershopId } = useLocalSearchParams<{ barbershopId: string }>();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    if (!barbershopId) {
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        const b = await database.collections.get<Barbershop>('barbershops').find(barbershopId);
        setBarbershop(b);

        const sList = await database.collections
          .get<Service>('services')
          .query(Q.where('barbershop_id', barbershopId), Q.where('is_active', true))
          .fetch();
        setServices(sList);

        const bList = await database.collections
          .get<Profile>('profiles')
          .query(
            Q.where('barbershop_id', barbershopId),
            Q.where('role', Q.oneOf(['barber', 'admin']))
          )
          .fetch();
        setBarbers(bList);
      } catch (err) {
        console.error('Erro ao buscar detalhes da barbearia:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [barbershopId]);

  const formatPrice = (price: number) => {
    const locale = i18n.language === 'en' ? 'en-US' : 'pt-BR';
    const currencyCode = barbershop?.currency || 'BRL';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(price);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  if (!barbershop) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Barbearia não encontrada.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const primaryColor = barbershop.primaryColor || '#D4AF37';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.cardContainer}>
        
        {/* Header/Banner visual com degrade de fundo baseado na cor primária da barbearia */}
        <View style={[styles.bannerContainer, { backgroundColor: primaryColor + '22', borderColor: primaryColor }]}>
          <Text style={[styles.logoLetter, { color: primaryColor }]}>
            {barbershop.name.charAt(0).toUpperCase()}
          </Text>
        </View>

        <Text style={styles.barbershopName}>{barbershop.name}</Text>
        <Text style={[styles.tagline, { color: primaryColor }]}>
          {t('register.barber_section')} • Cutsync Partner
        </Text>

        {/* Sobre Nós / Descrição */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Sobre nós</Text>
          <Text style={styles.descriptionText}>
            {barbershop.description || 'Uma barbearia moderna com foco na experiência, combinando técnicas tradicionais e contemporâneas para oferecer o melhor visual aos clientes.'}
          </Text>
        </View>

        {/* Detalhes de Contato e Funcionamento */}
        <View style={styles.detailsGrid}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>📍 ENDEREÇO</Text>
            <Text style={styles.detailValue}>
              {barbershop.address || 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>📞 TELEFONE</Text>
            <Text style={styles.detailValue}>
              {barbershop.phone || '+55 (11) 99999-9999'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>⏰ FUNCIONAMENTO</Text>
            <Text style={styles.detailValue}>
              {barbershop.openingHours || 'Segunda a Sábado: 09:00 - 20:00'}
            </Text>
          </View>

          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>🌐 FUSO HORÁRIO & MOEDA</Text>
            <Text style={styles.detailValue}>
              {barbershop.timezone} ({barbershop.currency})
            </Text>
          </View>
        </View>

        {/* Serviços Oferecidos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('booking.step_service')}</Text>
          {services.length === 0 ? (
            <Text style={styles.emptyText}>{t('booking.no_services')}</Text>
          ) : (
            <FlatList
              data={services}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.serviceCard}>
                  <Text style={styles.serviceName}>{item.name}</Text>
                  <Text style={[styles.servicePrice, { color: primaryColor }]}>{formatPrice(item.price)}</Text>
                  <Text style={styles.serviceDuration}>{item.durationMinutes} min</Text>
                </View>
              )}
            />
          )}
        </View>

        {/* Profissionais / Barbeiros */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('booking.step_barber')}</Text>
          {barbers.length === 0 ? (
            <Text style={styles.emptyText}>{t('booking.no_barbers')}</Text>
          ) : (
            <FlatList
              data={barbers}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.barberCard}>
                  <View style={[styles.avatarCircle, { backgroundColor: primaryColor + '15' }]}>
                    <Text style={[styles.avatarLetter, { color: primaryColor }]}>
                      {item.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.barberName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.barberRole}>
                    {item.role === 'admin' ? 'PROPRIETÁRIO' : 'BARBEIRO'}
                  </Text>
                </View>
              )}
            />
          )}
        </View>

        {/* Botão de Agendamento */}
        <TouchableOpacity
          style={[styles.bookButton, { backgroundColor: primaryColor }]}
          onPress={() => router.push(`/(client)/booking?barbershopId=${barbershopId}`)}
        >
          <Text style={styles.bookButtonText}>Agendar Horário</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(client)');
            }
          }}
        >
          <Text style={styles.backButtonText}>{t('common.back')}</Text>
        </TouchableOpacity>

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
    padding: 16,
    paddingTop: 48,
    paddingBottom: 48,
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 600,
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#ff453a',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  backBtn: {
    backgroundColor: '#2c2c2e',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  bannerContainer: {
    height: 120,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  logoLetter: {
    fontSize: 48,
    fontFamily: 'Montserrat_700Bold',
    fontWeight: 'bold',
  },
  barbershopName: {
    fontSize: 26,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    color: '#fff',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  infoSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 8,
  },
  descriptionText: {
    color: '#a0a0a0',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Inter_400Regular',
  },
  detailsGrid: {
    backgroundColor: '#2c2c2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    gap: 16,
    marginBottom: 28,
  },
  detailItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a3c',
    paddingBottom: 10,
  },
  detailLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  section: {
    marginBottom: 28,
  },
  emptyText: {
    color: '#666',
    marginTop: 4,
  },
  serviceCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    padding: 16,
    marginRight: 10,
    minWidth: 110,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginTop: 6,
  },
  serviceName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  servicePrice: {
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 6,
  },
  serviceDuration: {
    color: '#a0a0a0',
    fontSize: 11,
    marginTop: 2,
  },
  barberCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    padding: 16,
    marginRight: 10,
    width: 110,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginTop: 6,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  barberName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  barberRole: {
    color: '#a0a0a0',
    fontSize: 9,
    marginTop: 2,
    fontWeight: 'bold',
  },
  bookButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  bookButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  backButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
