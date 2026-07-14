import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Platform, TextInput, ScrollView, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../database';
import { Service, Profile, Barbershop, BarberService } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { AdminShell } from '../../components/layout/AdminShell';

export default function ManageServicesScreen() {
  const { t } = useTranslation();
  const { profile, signOut } = useAuth();
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
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);

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
    if (!profile?.establishment_id) {
      setLoading(false);
      return;
    }

    const bSub = database.collections
      .get<Barbershop>('barbershops')
      .findAndObserve(profile.establishment_id)
      .subscribe((data) => setBarbershop(data));

    // Carregar apenas serviços ativos (is_active = true) para permitir a deleção lógica limpa
    const sSub = database.collections
      .get<Service>('services')
      .query(Q.where('establishment_id', profile.establishment_id), Q.where('is_active', true))
      .observe()
      .subscribe((data) => {
        setServices(data);
        setLoading(false);
      });

    const teamSub = database.collections
      .get<Profile>('profiles')
      .query(
        Q.where('establishment_id', profile.establishment_id),
        Q.where('role', Q.oneOf(['barber', 'admin']))
      )
      .observe()
      .subscribe((data) => setBarbers(data));

    const bsSub = database.collections
      .get<BarberService>('barber_services')
      .query(Q.where('establishment_id', profile.establishment_id))
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
    if (!name.trim() || !price || !duration) {
      displayAlert(t('common.error'), t('register.error_fill'));
      return;
    }

    const parsedPrice = parseFloat(price);
    const parsedDuration = parseInt(duration);

    if (isNaN(parsedPrice) || parsedPrice <= 0 || isNaN(parsedDuration) || parsedDuration <= 0) {
      displayAlert(t('common.error'), 'Por favor, informe preço e duração em formato numérico válido.');
      return;
    }

    if (!profile?.establishment_id) return;

    setIsSubmitting(true);
    try {
      await database.write(async () => {
        if (editingServiceId) {
          const service = await database.collections.get<Service>('services').find(editingServiceId);
          await service.update((record) => {
            record.name = name.trim();
            record.price = parsedPrice;
            record.durationMinutes = parsedDuration;
          });
        } else {
          await database.collections.get('services').create((record: any) => {
            record.establishmentId = profile.establishment_id;
            record.name = name.trim();
            record.price = parsedPrice;
            record.durationMinutes = parsedDuration;
            record.isActive = true;
          });
        }
      });

      setName('');
      setPrice('');
      setDuration('');
      setEditingServiceId(null);

      displayAlert(t('common.success'), editingServiceId ? 'Serviço atualizado com sucesso!' : 'Serviço global adicionado com sucesso!');
      sync();
    } catch (err) {
      displayAlert(t('common.error'), 'Não foi possível salvar o serviço.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditingService = (service: Service) => {
    setEditingServiceId(service.id);
    setName(service.name);
    setPrice(service.price.toString());
    setDuration(service.durationMinutes.toString());
  };

  const handleRemoveService = async (serviceId: string) => {
    const confirm = Platform.OS === 'web' 
      ? window.confirm('Deseja realmente arquivar/remover este serviço?')
      : true;

    if (!confirm) return;

    try {
      await database.write(async () => {
        const service = await database.collections.get<Service>('services').find(serviceId);
        await service.update((record) => {
          record.isActive = false;
        });
      });
      displayAlert('Sucesso', 'Serviço removido com sucesso!');
      sync();
    } catch {
      displayAlert('Erro', 'Não foi possível remover o serviço.');
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
      displayAlert(t('common.error'), 'Não foi possível alterar o status do serviço.');
    }
  };

  const openPricesConfig = (service: Service) => {
    setSelectedServiceForPrices(service);
    const formInitial: Record<string, { price: string; duration: string; isActive: boolean }> = {};

    barbers.forEach(b => {
      const customRate = barberServices.find(bs => bs.professionalId === b.id && bs.serviceId === service.id);
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
          bs => bs.professionalId === barberId && bs.serviceId === selectedServiceForPrices.id
        );

        if (existing) {
          await existing.update((record) => {
            record.price = parsedPrice;
            record.durationMinutes = parsedDuration;
            record.isActive = form.isActive;
          });
        } else {
          await database.collections.get<BarberService>('barber_services').create((record) => {
            record.establishmentId = profile!.establishment_id!;
            record.professionalId = barberId;
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
        bs => bs.professionalId === barberId && bs.serviceId === selectedServiceForPrices.id
      );

      if (existing) {
        await database.write(async () => {
          await existing.destroyPermanently();
        });

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
      displayAlert('Erro', 'Não foi possível redefinir a comissão.');
    }
  };

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: barbershop?.currency || 'BRL',
    }).format(value);
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
    <AdminShell
      testID="admin-services-screen"
      activeRoute="services"
      shopName={barbershop?.name || 'Sua barbearia'}
      userName={profile?.name}
      onSignOut={signOut}
    >
      <View style={styles.container}>
      <Text style={styles.headerTitle}>{t('services.title')}</Text>
      <Text style={[styles.barbershopName, { color: primaryColor }]}>{barbershop?.name}</Text>

      {/* Formulário de Adicionar/Editar Serviço */}
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{editingServiceId ? 'Editar Serviço' : t('services.new_service')}</Text>

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

        <View style={styles.formButtonsRow}>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: primaryColor, flex: 1 }]}
            onPress={handleAddService}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#121212" />
            ) : (
              <Text style={styles.addButtonText}>{editingServiceId ? 'Atualizar Serviço' : t('services.save_button')}</Text>
            )}
          </TouchableOpacity>
          {!!editingServiceId && (
            <TouchableOpacity 
              style={styles.cancelEditBtn}
              onPress={() => {
                setEditingServiceId(null);
                setName('');
                setPrice('');
                setDuration('');
              }}
            >
              <Text style={styles.cancelEditBtnText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
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
                  <View style={styles.serviceHeaderRow}>
                    <Text style={styles.serviceName}>{item.name}</Text>
                    <View style={styles.crudActions}>
                      <TouchableOpacity onPress={() => startEditingService(item)} style={styles.crudBtn}>
                        <Text style={[styles.crudBtnText, { color: primaryColor }]}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRemoveService(item.id)} style={styles.crudBtn}>
                        <Text style={[styles.crudBtnText, { color: '#ff453a' }]}>Excluir</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
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
              </View>
            )}
          />
        )}
      </View>

      {/* Modal: Tarifas por Barbeiro */}
      {isPricesModalOpen && selectedServiceForPrices && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Configurar Tarifas</Text>
            <Text style={styles.modalSubtitle}>
              Defina preços e durações específicos para cada barbeiro para o serviço: {selectedServiceForPrices.name}
            </Text>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {barbers.map((barber) => {
                const form = customRatesForm[barber.id] || { price: '', duration: '', isActive: true };
                const hasCustomRate = barberServices.some(
                  bs => bs.professionalId === barber.id && bs.serviceId === selectedServiceForPrices.id
                );

                return (
                  <View key={barber.id} style={styles.barberRateCard}>
                    <View style={styles.barberRateHeader}>
                      <Text style={styles.barberRateName}>{barber.name}</Text>
                      <Switch
                        value={form.isActive}
                        onValueChange={(val) => handleUpdateFormValue(barber.id, 'isActive', val)}
                        trackColor={{ false: '#3a3a3c', true: primaryColor + '44' }}
                        thumbColor={form.isActive ? primaryColor : '#8e8e93'}
                      />
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
      )}
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 12,
    color: '#a0a0a0',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  barbershopName: {
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: 'Montserrat_700Bold',
    marginTop: 4,
    marginBottom: 20,
  },
  formCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  formButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addButton: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#121212',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelEditBtn: {
    flex: 0.4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    backgroundColor: '#121212',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  emptyText: {
    color: '#a0a0a0',
    fontSize: 14,
    textAlign: 'center',
  },
  serviceCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    marginBottom: 10,
  },
  serviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 16,
    color: '#fff',
    fontWeight: 'bold',
  },
  crudActions: {
    flexDirection: 'row',
    gap: 12,
  },
  crudBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#2c2c2e',
    borderWidth: 1,
    borderColor: '#3a3a3c',
  },
  crudBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  serviceDetails: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 4,
  },
  ratesConfigLink: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  ratesConfigLinkText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2c2c2e',
    borderRadius: 8,
    backgroundColor: '#1c1c1e',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 10,
  },
  modalCard: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#a0a0a0',
    marginBottom: 16,
    lineHeight: 18,
  },
  modalList: {
    flex: 1,
    marginBottom: 16,
  },
  barberRateCard: {
    backgroundColor: '#2c2c2e',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    marginBottom: 10,
  },
  barberRateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barberRateName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  barberFormInputs: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  fieldLabel: {
    fontSize: 11,
    color: '#a0a0a0',
    marginBottom: 4,
  },
  miniInput: {
    backgroundColor: '#1c1c1e',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  saveBtn: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#121212',
    fontSize: 12,
    fontWeight: 'bold',
  },
  resetBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ff453a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  resetBtnText: {
    color: '#ff453a',
    fontSize: 12,
    fontWeight: 'bold',
  },
  closeBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#2c2c2e',
  },
  closeBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  switchLabel: {
    color: '#fff',
    fontSize: 13,
  },
});
