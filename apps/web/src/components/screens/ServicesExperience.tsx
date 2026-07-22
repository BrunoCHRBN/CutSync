import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowDown, ArrowUp, Clock3, Copy, Pencil, Plus, Power, Scissors, WalletCards, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { supabase } from '../../services/supabase';
import { ServiceRecord } from '@cutsync/database';
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
  const { establishment: barbershop } = useEstablishment(profile?.establishment_id);
  const { services, loading, refresh } = useServices(profile?.establishment_id);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setDuration('');
  };

  const saveService = async () => {
    const numericPrice = Number(price.replace(',', '.'));
    const numericDuration = Number(duration);
    setNotice(null);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isInteger(numericDuration) || numericDuration < 5) {
      setNotice({ tone: 'danger', message: 'Informe nome, preço positivo e duração mínima de 5 minutos.' });
      return;
    }
    if (!profile?.establishment_id) return;
    setSubmitting(true);
    try {
      const maxSortOrder = services.reduce((maximum, service) => Math.max(maximum, service.sortOrder), 0);
      const query = editingId
        ? supabase.from('services').update({ name: name.trim(), price: numericPrice, duration_minutes: numericDuration }).eq('id', editingId).eq('establishment_id', profile.establishment_id)
        : supabase.from('services').insert({
          establishment_id: profile.establishment_id, name: name.trim(), price: numericPrice,
          duration_minutes: numericDuration, is_active: true, sort_order: maxSortOrder + 10,
        });
      const { error } = await query;
      if (error) throw error;
      const message = editingId ? 'Serviço atualizado.' : 'Serviço adicionado ao catálogo.';
      resetForm();
      await refresh();
      setNotice({ tone: 'success', message });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar o serviço.' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (service: ServiceRecord) => {
    setEditingId(service.id);
    setName(service.name);
    setPrice(String(service.price).replace('.', ','));
    setDuration(String(service.durationMinutes));
    setNotice(null);
  };

  const duplicateService = async (service: ServiceRecord) => {
    if (!profile?.establishment_id) return;
    setActionLoadingId(service.id);
    try {
      const maxSortOrder = services.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0);
      const { error } = await supabase.from('services').insert({
        establishment_id: profile.establishment_id,
        name: `${service.name} (cópia)`,
        price: service.price,
        duration_minutes: service.durationMinutes,
        is_active: false,
        sort_order: maxSortOrder + 10,
      });
      if (error) throw error;
      await refresh();
      setNotice({ tone: 'success', message: 'Cópia criada como serviço pausado.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível duplicar o serviço.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const reorderService = async (service: ServiceRecord, direction: 'up' | 'down') => {
    if (!profile?.establishment_id) return;
    setActionLoadingId(service.id);
    try {
      const { error } = await supabase.rpc('reorder_service', {
        target_establishment_id: profile.establishment_id,
        target_service_id: service.id,
        direction,
      });
      if (error) throw error;
      await refresh();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível reordenar o catálogo.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const toggleService = async (service: ServiceRecord) => {
    setActionLoadingId(service.id);
    try {
      const nextStatus = !service.isActive;
      if (!nextStatus) {
        const { count, error: countError } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', service.id)
          .in('status', ['pending', 'confirmed'])
          .gte('date_time', new Date().toISOString());
        if (countError) throw countError;
        if ((count || 0) > 0) {
          const message = `${count} agendamento${count === 1 ? '' : 's'} futuro${count === 1 ? '' : 's'} usa${count === 1 ? '' : 'm'} este serviço. Eles serão mantidos, mas o serviço deixará de aceitar novos horários. Deseja continuar?`;
          const confirmed = Platform.OS === 'web'
            ? window.confirm(message)
            : await new Promise<boolean>((resolve) => Alert.alert('Pausar serviço', message, [
              { text: 'Voltar', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Pausar', style: 'destructive', onPress: () => resolve(true) },
            ], { cancelable: true, onDismiss: () => resolve(false) }));
          if (!confirmed) return;
        }
      }
      const { error } = await supabase.from('services').update({ is_active: nextStatus }).eq('id', service.id);
      if (error) throw error;
      await refresh();
      setNotice({ tone: 'success', message: `${service.name} foi ${nextStatus ? 'ativado' : 'pausado'}.` });
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <SectionHeading testID="services-heading" eyebrow="Catálogo" title="Serviços e preços" description="Defina o que sua equipe oferece e controle o que aparece para os clientes." />
      {!!notice && <InlineNotice testID="services-action-notice" tone={notice.tone} message={notice.message} />}

      <View style={[styles.workspace, isWide && styles.workspaceWide]}>
        <FormSection testID="services-create-form" title={editingId ? 'Editar serviço' : 'Novo serviço'} description={editingId ? 'Atualize nome, preço ou duração. Os agendamentos existentes serão preservados.' : 'Cadastre uma opção com preço e tempo suficientes para bloquear a agenda corretamente.'} style={styles.formSection}>
          <AppInput label="Nome do serviço" testID="services-name-input" icon={<Scissors color={colors.textMuted} size={17} />} placeholder="Ex.: Corte clássico" value={name} onChangeText={setName} />
          <View style={styles.formRow}>
            <AppInput containerStyle={styles.halfField} label="Preço" testID="services-price-input" icon={<WalletCards color={colors.textMuted} size={17} />} placeholder="45,00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
            <AppInput containerStyle={styles.halfField} label="Duração (min)" testID="services-duration-input" icon={<Clock3 color={colors.textMuted} size={17} />} placeholder="30" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
          </View>
          <View style={styles.formActions}>
            <AppButton label={editingId ? 'Salvar alterações' : 'Adicionar serviço'} testID="services-add-button" onPress={saveService} loading={submitting} fullWidth variant="admin" icon={editingId ? <Pencil color={colors.white} size={17} /> : <Plus color={colors.white} size={17} />} style={styles.primaryFormAction} />
            {editingId ? <AppButton label="Cancelar" testID="services-edit-cancel" onPress={resetForm} variant="secondary" icon={<X color={colors.text} size={16} />} /> : null}
          </View>
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
            <ActivityIndicator testID="services-loading" color={colors.accent} style={styles.loader} />
          ) : services.length === 0 ? (
            <EmptyState testID="services-empty-state" title="Monte seu catálogo" description="Adicione o primeiro serviço para liberar o fluxo de agendamento." icon={<Scissors color={colors.textSecondary} size={22} />} />
          ) : (
            <View style={styles.serviceList}>
              {services.map((service, index) => (
                <AppCard key={service.id} testID={`service-card-${service.id}`} style={[styles.serviceCard, !isWide && styles.serviceCardMobile, !service.isActive && styles.serviceCardInactive]}>
                  <View style={styles.serviceHeader}>
                    <View style={[styles.serviceIcon, !service.isActive && styles.serviceIconInactive]}><Scissors color={service.isActive ? colors.text : colors.textMuted} size={18} /></View>
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
                  </View>
                  <View style={[styles.serviceActions, !isWide && styles.serviceActionsMobile]}>
                    <Pressable testID={`service-card-${service.id}-edit-button`} accessibilityRole="button" accessibilityLabel={`Editar ${service.name}`} disabled={!!actionLoadingId} onPress={() => startEditing(service)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Pencil color={colors.textSecondary} size={16} /></Pressable>
                    <Pressable testID={`service-card-${service.id}-duplicate-button`} accessibilityRole="button" accessibilityLabel={`Duplicar ${service.name}`} disabled={!!actionLoadingId} onPress={() => { void duplicateService(service); }} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Copy color={colors.textSecondary} size={16} /></Pressable>
                    <Pressable testID={`service-card-${service.id}-move-up-button`} accessibilityRole="button" accessibilityLabel={`Mover ${service.name} para cima`} disabled={!!actionLoadingId || index === 0} onPress={() => { void reorderService(service, 'up'); }} style={({ pressed }) => [styles.iconButton, index === 0 && styles.disabledAction, pressed && styles.pressed]}><ArrowUp color={colors.textSecondary} size={16} /></Pressable>
                    <Pressable testID={`service-card-${service.id}-move-down-button`} accessibilityRole="button" accessibilityLabel={`Mover ${service.name} para baixo`} disabled={!!actionLoadingId || index === services.length - 1} onPress={() => { void reorderService(service, 'down'); }} style={({ pressed }) => [styles.iconButton, index === services.length - 1 && styles.disabledAction, pressed && styles.pressed]}><ArrowDown color={colors.textSecondary} size={16} /></Pressable>
                    <Pressable
                      testID={`service-card-${service.id}-toggle-button`}
                      accessibilityRole="button"
                      accessibilityLabel={service.isActive ? `Pausar ${service.name}` : `Ativar ${service.name}`}
                      disabled={!!actionLoadingId}
                      onPress={() => { void toggleService(service); }}
                      style={({ pressed }) => [styles.toggleButton, service.isActive && styles.toggleButtonActive, pressed && styles.pressed]}
                    >
                      {actionLoadingId === service.id ? <ActivityIndicator color={colors.text} size="small" /> : <Power color={service.isActive ? colors.success : colors.textMuted} size={17} />}
                    </Pressable>
                  </View>
                </AppCard>
              ))}
            </View>
          )}
        </View>
      </View>
      </ScrollView>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingTop: 30, paddingBottom: 110, gap: 20 },
  workspace: { gap: 18, marginTop: 28 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formSection: { flex: 0.8, minWidth: 300 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  halfField: { flex: 1, minWidth: 135 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryFormAction: { flex: 1 },
  listColumn: { flex: 1.3 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 },
  listTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.5 },
  listSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  loader: { margin: 50 },
  serviceList: { gap: 9 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  serviceCardMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  serviceCardInactive: { opacity: 0.64 },
  serviceIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  serviceIconInactive: { backgroundColor: colors.surfacePressed },
  serviceCopy: { flex: 1, minWidth: 0 },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  servicePrice: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  metaDivider: { color: colors.textMuted },
  serviceDuration: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  serviceActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  serviceActionsMobile: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10, marginTop: 4, width: '100%' },
  iconButton: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.borderSubtle },
  disabledAction: { opacity: 0.3 },
  toggleButton: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border },
  toggleButtonActive: { backgroundColor: colors.successSoft, borderColor: '#34D39944' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
});
