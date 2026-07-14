import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, ActivityIndicator, Modal, ScrollView, Platform, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Barbershop, Profile, BarberService } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { ServicesExperience } from '../../components/screens/ServicesExperience';

export default ServicesExperience;

function LegacyServicesScreen() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { sync } = useSync();
  const router = useRouter();

  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Profile[]>([]);
  const [barberServices, setBarberServices] = useState<BarberService[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states do serviço global
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');

  // Estados para tarifas customizadas de barbeiro (Modal)
  const [selectedServiceForPrices, setSelectedServiceForPrices] = useState<Service | null>(null);
  const [isPricesModalOpen, setIsPricesModalOpen] = useState(false);
  const [customRatesForm, setCustomRatesForm] = useState<Record<string, { price: string; duration: string; isActive: boolean }>>({});

  const displayAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      window.alert(`${title}: ${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    if (!profile?.barbershop_id) {
      setLoading(false);
      return;
    }

    // 1. Carregar barbearia
    const bSub = database.collections
      .get<Barbershop>('barbershops')
      .findAndObserve(profile.barbershop_id)
      .subscribe((data) => setBarbershop(data));

    // 2. Carregar serviços globais
    const sSub = database.collections
      .get<Service>('services')
      .query(Q.where('barbershop_id', profile.barbershop_id))
      .observe()
      .subscribe((data) => {
        setServices(data);
        setLoading(false);
      });

    // 3. Carregar profissionais da equipe
    const teamSub = database.collections
      .get<Profile>('profiles')
      .query(
        Q.where('barbershop_id', profile.barbershop_id),
        Q.where('role', Q.oneOf(['barber', 'admin']))
      )
      .observe()
      .subscribe((data) => setBarbers(data));

    // 4. Carregar tarifas diferenciadas
    const bsSub = database.collections
      .get<BarberService>('barber_services')
      .query(Q.where('barbershop_id', profile.barbershop_id))
      .observe()
      .subscribe((data) => setBarberServices(data));

    return () => {
      bSub.unsubscribe();
      sSub.unsubscribe();
      teamSub.unsubscribe();
      bsSub.unsubscribe();
    };
  }, [profile]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(admin)');
    }
  };

  const handleAddService = async () => {
    if (!name || !price || !duration) {
<<<<<<< HEAD
      displayAlert(t('common.error'), t('register.error_fill'));
=======
      console.warn(t('common.error'), t('register.error_fill'));
>>>>>>> 1334427b593b0c0b505d4e242b793a3f1aca9733
      return;
    }

    if (!profile?.barbershop_id) return;

    setIsSubmitting(true);
    try {
      await database.write(async () => {
        await database.collections.get('services').create((record: any) => {
          record.barbershopId = profile.barbershop_id;
          record.name = name;
          record.price = parseFloat(price);
          record.durationMinutes = parseInt(duration);
          record.isActive = true;
        });
      });

      setName('');
      setPrice('');
      setDuration('');

<<<<<<< HEAD
      displayAlert(t('common.success'), 'Serviço global adicionado com sucesso!');
      sync();
    } catch (err) {
      displayAlert(t('common.error'), 'Não foi possível salvar o serviço.');
=======
      console.warn(t('common.success'), 'Service saved locally!');
      sync();
    } catch (err) {
      console.warn(t('common.error'), 'Could not save service.');
>>>>>>> 1334427b593b0c0b505d4e242b793a3f1aca9733
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (serviceId: string, currentStatus: boolean) => {
    try {
      await database.write(async () => {
        const service = await database.collections.get<Service>('services').find(serviceId);
        await service.update((record) => {
          record.isActive = !currentStatus;
        });
      });
      sync();
    } catch (err) {
<<<<<<< HEAD
      displayAlert(t('common.error'), 'Não foi possível alterar o status do serviço.');
    }
  };

  const openPricesConfig = (service: Service) => {
    setSelectedServiceForPrices(service);
    const formInitial: Record<string, { price: string; duration: string; isActive: boolean }> = {};

    barbers.forEach(b => {
      const customRate = barberServices.find(bs => bs.barberId === b.id && bs.serviceId === service.id);
      formInitial[b.id] = {
        price: customRate ? customRate.price.toString() : service.price.toString(),
        duration: customRate ? customRate.durationMinutes.toString() : service.durationMinutes.toString(),
        isActive: customRate ? customRate.isActive : true,
      };
    });

    setCustomRatesForm(formInitial);
    setIsPricesModalOpen(true);
  };

  const handleUpdateFormValue = (barberId: string, field: 'price' | 'duration' | 'isActive', value: any) => {
    setCustomRatesForm(prev => ({
      ...prev,
      [barberId]: {
        ...prev[barberId],
        [field]: value,
      }
    }));
  };

  const handleSaveCustomPrice = async (barberId: string) => {
    if (!selectedServiceForPrices) return;
    const form = customRatesForm[barberId];
    const parsedPrice = parseFloat(form.price);
    const parsedDuration = parseInt(form.duration);

    if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedDuration) || parsedDuration <= 0) {
      displayAlert('Erro', 'Por favor, informe preço e duração válidos.');
      return;
    }

    try {
      await database.write(async () => {
        const existing = barberServices.find(
          bs => bs.barberId === barberId && bs.serviceId === selectedServiceForPrices.id
        );

        if (existing) {
          await existing.update((record) => {
            record.price = parsedPrice;
            record.durationMinutes = parsedDuration;
            record.isActive = form.isActive;
          });
        } else {
          await database.collections.get<BarberService>('barber_services').create((record) => {
            record.barbershopId = profile!.barbershop_id!;
            record.barberId = barberId;
            record.serviceId = selectedServiceForPrices.id;
            record.price = parsedPrice;
            record.durationMinutes = parsedDuration;
            record.isActive = form.isActive;
          });
        }
      });

      displayAlert('Sucesso', 'Tarifa customizada do profissional salva com sucesso!');
      sync();
    } catch (err) {
      displayAlert('Erro', 'Não foi possível salvar a tarifa do barbeiro.');
    }
  };

  const handleResetCustomPrice = async (barberId: string) => {
    if (!selectedServiceForPrices) return;

    try {
      const existing = barberServices.find(
        bs => bs.barberId === barberId && bs.serviceId === selectedServiceForPrices.id
      );

      if (existing) {
        await database.write(async () => {
          await existing.destroyPermanently();
        });

        // Reseta formulário local para o padrão global
        setCustomRatesForm(prev => ({
          ...prev,
          [barberId]: {
            price: selectedServiceForPrices.price.toString(),
            duration: selectedServiceForPrices.durationMinutes.toString(),
            isActive: true,
          }
        }));

        displayAlert('Sucesso', 'Tarifa do profissional redefinida para o padrão!');
        sync();
      }
    } catch (err) {
      displayAlert('Erro', 'Não foi possível redefinir a tarifa.');
=======
      console.warn(t('common.error'), 'Could not toggle service status.');
>>>>>>> 1334427b593b0c0b505d4e242b793a3f1aca9733
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
      <Text style={styles.headerTitle}>{t('services.title')}</Text>
      <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>

      {/* Formulário de Adicionar Serviço */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{t('services.new_service')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('services.name_label')}
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
        />

        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1, marginRight: 8 }]}
            placeholder={t('services.price_label') + " (ex: 35.00)"}
            placeholderTextColor="#666"
            value={price}
            onChangeText={setPrice}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder={t('services.duration_label')}
            placeholderTextColor="#666"
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
          />
        </View>

        <TouchableOpacity 
          style={[styles.addButton, { backgroundColor: primaryColor }]}
          onPress={handleAddService}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#121212" />
          ) : (
            <Text style={styles.addButtonText}>{t('services.save_button')}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Lista de Serviços */}
      <View style={{ flex: 1, marginTop: 16 }}>
        <Text style={styles.sectionTitle}>{t('services.registered_title')}</Text>

        {services.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('services.no_services')}</Text>
          </View>
        ) : (
          <FlatList
            data={services}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.serviceCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.serviceName}>{item.name}</Text>
                  <Text style={styles.serviceDetails}>
                    {formatPrice(item.price)} | {item.durationMinutes} min
                  </Text>
                  <TouchableOpacity 
                    style={styles.ratesConfigLink}
                    onPress={() => openPricesConfig(item)}
                  >
                    <Text style={[styles.ratesConfigLinkText, { color: primaryColor }]}>
                      ⚙️ Configurar Tarifas por Barbeiro
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity 
                  style={[
                    styles.statusButton, 
                    { backgroundColor: item.isActive ? '#30d158' : '#ff453a' }
                  ]}
                  onPress={() => handleToggleActive(item.id, item.isActive)}
                >
                  <Text style={styles.statusButtonText}>
                    {item.isActive ? t('services.active') : t('services.inactive')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          />
        )}
      </View>

      <TouchableOpacity style={styles.backButton} onPress={handleBack}>
        <Text style={styles.backButtonText}>{t('common.back')}</Text>
      </TouchableOpacity>

      {/* Modal: Tarifas por Barbeiro */}
      <Modal visible={isPricesModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: primaryColor }]}>Preço/Tempo por Barbeiro</Text>
            <Text style={styles.modalSubTitle}>{selectedServiceForPrices?.name}</Text>

            <ScrollView contentContainerStyle={{ paddingBottom: 20 }} style={{ maxHeight: 400 }}>
              {barbers.map(barber => {
                const form = customRatesForm[barber.id] || { price: '', duration: '', isActive: true };
                const hasCustomRate = barberServices.some(
                  bs => bs.barberId === barber.id && bs.serviceId === selectedServiceForPrices?.id
                );

                return (
                  <View key={barber.id} style={styles.barberRateRow}>
                    <View style={styles.barberRowHeader}>
                      <Text style={styles.barberRowName}>{barber.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.activeLabel}>Realiza?</Text>
                        <Switch
                          value={form.isActive}
                          onValueChange={(val) => handleUpdateFormValue(barber.id, 'isActive', val)}
                          trackColor={{ false: '#3a3a3c', true: primaryColor + '44' }}
                          thumbColor={form.isActive ? primaryColor : '#8e8e93'}
                        />
                      </View>
                    </View>

                    {form.isActive && (
                      <View style={styles.barberFormInputs}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Preço (Tarifa)</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={form.price}
                            onChangeText={(val) => handleUpdateFormValue(barber.id, 'price', val)}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fieldLabel}>Tempo (Minutos)</Text>
                          <TextInput
                            style={styles.miniInput}
                            keyboardType="numeric"
                            value={form.duration}
                            onChangeText={(val) => handleUpdateFormValue(barber.id, 'duration', val)}
                          />
                        </View>
                      </View>
                    )}

                    <View style={styles.rowActions}>
                      {hasCustomRate && (
                        <TouchableOpacity 
                          style={styles.resetBtn}
                          onPress={() => handleResetCustomPrice(barber.id)}
                        >
                          <Text style={styles.resetBtnText}>Padrão</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity 
                        style={[styles.saveBtn, { backgroundColor: primaryColor }]}
                        onPress={() => handleSaveCustomPrice(barber.id)}
                      >
                        <Text style={styles.saveBtnText}>Salvar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity 
              style={styles.closeBtn} 
              onPress={() => setIsPricesModalOpen(false)}
            >
              <Text style={styles.closeBtnText}>Fechar Janela</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 12,
    color: '#a0a0a0',
    textTransform: 'uppercase',
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 20,
  },
  formCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  formTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'Montserrat_700Bold',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#2c2c2e',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 12,
  },
  addButton: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    fontFamily: 'Montserrat_700Bold',
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
  serviceCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  serviceName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  serviceDetails: {
    color: '#a0a0a0',
    fontSize: 13,
    marginTop: 4,
  },
  ratesConfigLink: {
    marginTop: 8,
  },
  ratesConfigLinkText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusButton: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  statusButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
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
  // Modal de tarifas
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
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
  },
  modalSubTitle: {
    fontSize: 13,
    color: '#a0a0a0',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  barberRateRow: {
    backgroundColor: '#2c2c2e',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    padding: 12,
    marginBottom: 12,
  },
  barberRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  barberRowName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  activeLabel: {
    fontSize: 11,
    color: '#a0a0a0',
  },
  barberFormInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 10,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  miniInput: {
    backgroundColor: '#1c1c1e',
    color: '#fff',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  saveBtn: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  saveBtnText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 11,
  },
  resetBtn: {
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#3a3a3c',
  },
  resetBtnText: {
    color: '#ff453a',
    fontWeight: 'bold',
    fontSize: 11,
  },
  closeBtn: {
    paddingVertical: 12,
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
