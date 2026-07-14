import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { Clock3, Plus, Power, Scissors, WalletCards } from 'lucide-react-native';
import { database } from '../../database';
import { Barbershop, Service } from '../../database/models';
import { useAuth } from '../../contexts/AuthContext';
import { useSync } from '../../hooks/useSync';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { EmptyState } from '../ui/EmptyState';
import { FormSection } from '../ui/FormSection';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const ServicesExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { sync } = useSync();
  const [barbershop, setBarbershop] = useState<Barbershop | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);

  useEffect(() => {
    if (!profile?.barbershop_id) { setLoading(false); return; }
    const shopSub = database.collections.get<Barbershop>('barbershops').findAndObserve(profile.barbershop_id).subscribe(setBarbershop);
    const serviceSub = database.collections.get<Service>('services').query(Q.where('barbershop_id', profile.barbershop_id)).observe()
      .subscribe((items) => { setServices(items); setLoading(false); });
    return () => { shopSub.unsubscribe(); serviceSub.unsubscribe(); };
  }, [profile]);

  const addService = async () => {
    const numericPrice = Number(price.replace(',', '.'));
    const numericDuration = Number(duration);
    setNotice(null);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isInteger(numericDuration) || numericDuration < 5) {
      setNotice({ tone: 'danger', message: 'Informe nome, preço positivo e duração mínima de 5 minutos.' });
      return;
    }
    if (!profile?.barbershop_id) return;
    setSubmitting(true);
    try {
      await database.write(async () => {
        await database.collections.get('services').create((record: any) => {
          record.barbershopId = profile.barbershop_id;
          record.name = name.trim();
          record.price = numericPrice;
          record.durationMinutes = numericDuration;
          record.isActive = true;
        });
      });
      setName(''); setPrice(''); setDuration('');
      setNotice({ tone: 'success', message: 'Serviço adicionado ao catálogo.' });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar o serviço.' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleService = async (service: Service) => {
    setActionLoadingId(service.id);
    try {
      await database.write(async () => {
        await service.update((record) => { record.isActive = !service.isActive; });
      });
      setNotice({ tone: 'success', message: `${service.name} foi ${service.isActive ? 'ativado' : 'pausado'}.` });
      sync();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível alterar o status do serviço.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);
  const activeCount = services.filter((service) => service.isActive).length;

  return (
    <AdminShell testID="services-screen" activeRoute="services" shopName={barbershop?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut}>
      <SectionHeading testID="services-heading" eyebrow="Catálogo" title="Serviços e preços" description="Defina o que sua equipe oferece e controle o que aparece para os clientes." />
      {!!notice && <InlineNotice testID="services-action-notice" tone={notice.tone} message={notice.message} />}

      <View style={[styles.workspace, isWide && styles.workspaceWide]}>
        <FormSection testID="services-create-form" title="Novo serviço" description="Cadastre uma opção com preço e tempo suficientes para bloquear a agenda corretamente." style={styles.formSection}>
          <AppInput label="Nome do serviço" testID="services-name-input" icon={<Scissors color={colors.textMuted} size={17} />} placeholder="Ex.: Corte clássico" value={name} onChangeText={setName} />
          <View style={styles.formRow}>
            <AppInput containerStyle={styles.halfField} label="Preço" testID="services-price-input" icon={<WalletCards color={colors.textMuted} size={17} />} placeholder="45,00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            <AppInput containerStyle={styles.halfField} label="Duração (min)" testID="services-duration-input" icon={<Clock3 color={colors.textMuted} size={17} />} placeholder="30" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
          </View>
          <AppButton label="Adicionar serviço" testID="services-add-button" onPress={addService} loading={submitting} fullWidth icon={<Plus color={colors.ink} size={17} />} />
        </FormSection>

        <View style={styles.listColumn}>
          <View style={styles.listHeader}>
            <View>
              <Text testID="services-list-title" style={styles.listTitle}>Catálogo atual</Text>
              <Text style={styles.listSubtitle}>{activeCount} ativos de {services.length} cadastrados</Text>
            </View>
            <StatusBadge testID="services-active-count" label={`${activeCount} ativos`} tone="success" />
          </View>

          {loading ? (
            <ActivityIndicator testID="services-loading" color={colors.brand} style={styles.loader} />
          ) : services.length === 0 ? (
            <EmptyState testID="services-empty-state" title="Monte seu catálogo" description="Adicione o primeiro serviço para liberar o fluxo de agendamento." icon={<Scissors color={colors.brand} size={22} />} />
          ) : (
            <View style={styles.serviceList}>
              {services.map((service) => (
                <AppCard key={service.id} testID={`service-card-${service.id}`} style={[styles.serviceCard, !service.isActive && styles.serviceCardInactive]}>
                  <View style={[styles.serviceIcon, !service.isActive && styles.serviceIconInactive]}><Scissors color={service.isActive ? colors.brand : colors.textMuted} size={18} /></View>
                  <View style={styles.serviceCopy}>
                    <Text testID={`service-card-${service.id}-name`} style={styles.serviceName}>{service.name}</Text>
                    <View style={styles.serviceMeta}>
                      <Text style={styles.servicePrice}>{currency(service.price)}</Text>
                      <Text style={styles.metaDivider}>·</Text>
                      <Clock3 color={colors.textMuted} size={12} />
                      <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                    </View>
                  </View>
                  <StatusBadge testID={`service-card-${service.id}-status`} label={service.isActive ? 'Ativo' : 'Pausado'} tone={service.isActive ? 'success' : 'neutral'} />
                  <Pressable
                    testID={`service-card-${service.id}-toggle-button`}
                    disabled={!!actionLoadingId}
                    onPress={() => toggleService(service)}
                    style={({ pressed }) => [styles.toggleButton, service.isActive && styles.toggleButtonActive, pressed && styles.pressed]}
                  >
                    {actionLoadingId === service.id ? <ActivityIndicator color={colors.text} size="small" /> : <Power color={service.isActive ? colors.success : colors.textMuted} size={17} />}
                  </Pressable>
                </AppCard>
              ))}
            </View>
          )}
        </View>
      </View>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  workspace: { gap: 18, marginTop: 28 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formSection: { flex: 0.8, minWidth: 300 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  halfField: { flex: 1, minWidth: 135 },
  listColumn: { flex: 1.3 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 },
  listTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.5 },
  listSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, marginTop: 3 },
  loader: { margin: 50 },
  serviceList: { gap: 9 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  serviceCardInactive: { opacity: 0.64 },
  serviceIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  serviceIconInactive: { backgroundColor: colors.surfacePressed },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  servicePrice: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10 },
  metaDivider: { color: colors.textMuted },
  serviceDuration: { color: colors.textMuted, fontFamily: typography.body, fontSize: 9 },
  toggleButton: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border },
  toggleButtonActive: { backgroundColor: colors.successSoft, borderColor: '#34D39944' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
});