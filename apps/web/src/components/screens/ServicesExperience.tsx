import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { ArrowDown, ArrowUp, Clock3, Copy, Pencil, Percent, Plus, Power, Scissors, Tags, WalletCards, X } from 'lucide-react-native';
import { comboDiscountPercent, comboMembersTotal } from '@cutsync/domain';
import { ServicePromotionRecord, ServiceRecord } from '@cutsync/database';
import { useAuth } from '../../contexts/AuthContext';
import { useOperationalContext } from '../../contexts/operational-context';
import { useServiceComboItems } from '../../features/services/use-service-combo-items';
import { useServicePromotions } from '../../features/services/use-service-promotions';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { supabase } from '../../services/supabase';
import { AdminShell } from '../layout/AdminShell';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { FormSection } from '../ui/FormSection';
import { InlineNotice } from '../ui/InlineNotice';
import { SectionHeading } from '../ui/SectionHeading';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, glassSurface, layout, radii, typography } from '../../theme/tokens';

type CatalogTab = 'services' | 'combos' | 'promotions';

const DAY_OPTIONS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
];

export const ServicesExperience = () => {
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const { activeEstablishmentId } = useOperationalContext();
  const { establishment: barbershop } = useEstablishment(activeEstablishmentId);
  const { services, loading, refresh } = useServices(activeEstablishmentId);
  const { items: comboItems, refresh: refreshComboItems } = useServiceComboItems(activeEstablishmentId);
  const { promotions, refresh: refreshPromotions } = useServicePromotions(activeEstablishmentId);

  const [tab, setTab] = useState<CatalogTab>('services');
  const [formOpen, setFormOpen] = useState(false);
  const [serviceQuery, setServiceQuery] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pauseConfirm, setPauseConfirm] = useState<{ service: ServiceRecord; message: string } | null>(null);

  const [promoServiceId, setPromoServiceId] = useState<string | 'all'>('all');
  const [promoDays, setPromoDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [promoType, setPromoType] = useState<'percent' | 'fixed_price'>('percent');
  const [promoValue, setPromoValue] = useState('');
  const [promoStartsAt, setPromoStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [promoEndsAt, setPromoEndsAt] = useState('');
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);

  const singles = useMemo(() => services.filter((service) => service.kind !== 'combo'), [services]);
  const combos = useMemo(() => services.filter((service) => service.kind === 'combo'), [services]);
  const listedAll = tab === 'combos' ? combos : singles;
  const listed = useMemo(() => {
    const query = serviceQuery.trim().toLowerCase();
    if (!query) return listedAll;
    return listedAll.filter((service) => service.name.toLowerCase().includes(query));
  }, [listedAll, serviceQuery]);

  const membersTotal = useMemo(() => {
    const prices = selectedMemberIds.map((id) => singles.find((service) => service.id === id)?.price || 0);
    return comboMembersTotal(prices);
  }, [selectedMemberIds, singles]);
  const suggestedDuration = useMemo(
    () => selectedMemberIds.reduce((sum, id) => sum + (singles.find((service) => service.id === id)?.durationMinutes || 0), 0),
    [selectedMemberIds, singles],
  );
  const numericPrice = Number(price.replace(',', '.'));
  const discountPreview = Number.isFinite(numericPrice) ? comboDiscountPercent(membersTotal, numericPrice) : 0;

  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: barbershop?.currency || 'BRL' }).format(value);

  const resetServiceForm = () => {
    setEditingId(null);
    setName('');
    setPrice('');
    setDuration('');
    setSelectedMemberIds([]);
    setFormOpen(false);
  };

  const resetPromoForm = () => {
    setEditingPromoId(null);
    setPromoServiceId('all');
    setPromoDays([1, 2, 3, 4, 5]);
    setPromoType('percent');
    setPromoValue('');
    setPromoStartsAt(new Date().toISOString().slice(0, 10));
    setPromoEndsAt('');
  };

  const refreshAll = async () => {
    await Promise.all([refresh(), refreshComboItems(), refreshPromotions()]);
  };

  const saveService = async () => {
    const durationValue = Number(duration || (tab === 'combos' ? suggestedDuration : 0));
    setNotice(null);
    if (!name.trim() || !Number.isFinite(numericPrice) || numericPrice <= 0 || !Number.isInteger(durationValue) || durationValue < 5) {
      setNotice({ tone: 'danger', message: 'Informe nome, preço positivo e duração mínima de 5 minutos.' });
      return;
    }
    if (tab === 'combos' && selectedMemberIds.length < 2) {
      setNotice({ tone: 'danger', message: 'Um combo precisa de pelo menos 2 serviços membros.' });
      return;
    }
    if (!activeEstablishmentId) return;
    setSubmitting(true);
    try {
      const maxSortOrder = services.reduce((maximum, service) => Math.max(maximum, service.sortOrder), 0);
      const payload = {
        name: name.trim(),
        price: numericPrice,
        duration_minutes: durationValue,
        kind: tab === 'combos' ? 'combo' : 'single',
      };
      let serviceId = editingId;
      if (editingId) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingId).eq('establishment_id', activeEstablishmentId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('services').insert({
          establishment_id: activeEstablishmentId,
          ...payload,
          is_active: true,
          sort_order: maxSortOrder + 10,
        }).select('id').single();
        if (error) throw error;
        serviceId = data.id;
      }
      if (tab === 'combos' && serviceId) {
        const { error } = await supabase.rpc('replace_service_combo_items', {
          target_combo_id: serviceId,
          target_member_service_ids: selectedMemberIds,
        });
        if (error) throw error;
      }
      resetServiceForm();
      await refreshAll();
      setNotice({ tone: 'success', message: tab === 'combos' ? 'Combo salvo.' : editingId ? 'Serviço atualizado.' : 'Serviço adicionado ao catálogo.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar no catálogo.' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEditing = (service: ServiceRecord) => {
    setEditingId(service.id);
    setName(service.name);
    setPrice(String(service.price).replace('.', ','));
    setDuration(String(service.durationMinutes));
    setSelectedMemberIds(
      comboItems.filter((item) => item.comboId === service.id).map((item) => item.serviceId),
    );
    setNotice(null);
    setTab(service.kind === 'combo' ? 'combos' : 'services');
    setFormOpen(true);
  };

  const toggleMember = (serviceId: string) => {
    setSelectedMemberIds((current) => {
      const next = current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId];
      const nextDuration = next.reduce(
        (sum, id) => sum + (singles.find((service) => service.id === id)?.durationMinutes || 0),
        0,
      );
      if (!duration.trim() || Number(duration) === suggestedDuration) {
        setDuration(nextDuration ? String(nextDuration) : '');
      }
      return next;
    });
  };

  const duplicateService = async (service: ServiceRecord) => {
    if (!activeEstablishmentId) return;
    setActionLoadingId(service.id);
    try {
      const maxSortOrder = services.reduce((maximum, item) => Math.max(maximum, item.sortOrder), 0);
      const { data, error } = await supabase.from('services').insert({
        establishment_id: activeEstablishmentId,
        name: `${service.name} (cópia)`,
        price: service.price,
        duration_minutes: service.durationMinutes,
        is_active: false,
        sort_order: maxSortOrder + 10,
        kind: service.kind,
      }).select('id').single();
      if (error) throw error;
      if (service.kind === 'combo') {
        const members = comboItems.filter((item) => item.comboId === service.id).map((item) => item.serviceId);
        if (members.length >= 2) {
          const { error: comboError } = await supabase.rpc('replace_service_combo_items', {
            target_combo_id: data.id,
            target_member_service_ids: members,
          });
          if (comboError) throw comboError;
        }
      }
      await refreshAll();
      setNotice({ tone: 'success', message: 'Cópia criada como item pausado.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível duplicar.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const reorderService = async (service: ServiceRecord, direction: 'up' | 'down') => {
    if (!activeEstablishmentId) return;
    setActionLoadingId(service.id);
    try {
      const { error } = await supabase.rpc('reorder_service', {
        target_establishment_id: activeEstablishmentId,
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

  const combosUsingService = (serviceId: string) =>
    combos.filter((combo) => comboItems.some((item) => item.comboId === combo.id && item.serviceId === serviceId));

  const applyServiceActive = async (service: ServiceRecord, nextStatus: boolean) => {
    setActionLoadingId(service.id);
    try {
      const { error } = await supabase.from('services').update({ is_active: nextStatus }).eq('id', service.id);
      if (error) throw error;
      await refresh();
      setNotice({ tone: 'success', message: `${service.name} foi ${nextStatus ? 'ativado' : 'pausado'}.` });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível alterar o status.' });
    } finally {
      setActionLoadingId(null);
      setPauseConfirm(null);
    }
  };

  const toggleService = async (service: ServiceRecord) => {
    setActionLoadingId(service.id);
    try {
      const nextStatus = !service.isActive;
      if (!nextStatus) {
        const affectedCombos = combosUsingService(service.id).filter((combo) => combo.isActive);
        const { count, error: countError } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('service_id', service.id)
          .in('status', ['pending', 'confirmed'])
          .gte('date_time', new Date().toISOString());
        if (countError) throw countError;
        const comboWarning = affectedCombos.length
          ? `\n\nCombos afetados: ${affectedCombos.map((combo) => combo.name).join(', ')}.`
          : '';
        if ((count || 0) > 0 || affectedCombos.length) {
          const message = `${count || 0} agendamento(s) futuro(s) usam este item.${comboWarning}\nDeseja pausar mesmo assim?`;
          setActionLoadingId(null);
          setPauseConfirm({ service, message });
          return;
        }
      }
      await applyServiceActive(service, nextStatus);
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível alterar o status.' });
      setActionLoadingId(null);
    }
  };

  const savePromotion = async () => {
    const value = Number(promoValue.replace(',', '.'));
    setNotice(null);
    if (!promoDays.length || !Number.isFinite(value) || value <= 0) {
      setNotice({ tone: 'danger', message: 'Informe dias da semana e um valor de desconto válido.' });
      return;
    }
    if (promoType === 'percent' && value > 100) {
      setNotice({ tone: 'danger', message: 'Percentual deve ser no máximo 100.' });
      return;
    }
    if (!activeEstablishmentId) return;
    setSubmitting(true);
    try {
      const payload = {
        establishment_id: activeEstablishmentId,
        service_id: promoServiceId === 'all' ? null : promoServiceId,
        days_of_week: promoDays,
        discount_type: promoType,
        value,
        starts_at: promoStartsAt,
        ends_at: promoEndsAt || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      };
      const query = editingPromoId
        ? supabase.from('service_promotions').update(payload).eq('id', editingPromoId)
        : supabase.from('service_promotions').insert(payload);
      const { error } = await query;
      if (error) throw error;
      resetPromoForm();
      await refreshPromotions();
      setNotice({ tone: 'success', message: editingPromoId ? 'Promoção atualizada.' : 'Promoção criada.' });
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível salvar a promoção.' });
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingPromo = (promotion: ServicePromotionRecord) => {
    setEditingPromoId(promotion.id);
    setPromoServiceId(promotion.serviceId || 'all');
    setPromoDays(promotion.daysOfWeek);
    setPromoType(promotion.discountType);
    setPromoValue(String(promotion.value).replace('.', ','));
    setPromoStartsAt(promotion.startsAt.slice(0, 10));
    setPromoEndsAt(promotion.endsAt ? promotion.endsAt.slice(0, 10) : '');
    setTab('promotions');
  };

  const togglePromotion = async (promotion: ServicePromotionRecord) => {
    setActionLoadingId(promotion.id);
    try {
      const { error } = await supabase
        .from('service_promotions')
        .update({ is_active: !promotion.isActive, updated_at: new Date().toISOString() })
        .eq('id', promotion.id);
      if (error) throw error;
      await refreshPromotions();
    } catch {
      setNotice({ tone: 'danger', message: 'Não foi possível alterar a promoção.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const activeCount = listedAll.filter((service) => service.isActive).length;

  return (
    <AdminShell testID="services-screen" activeRoute="services" shopName={barbershop?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading
          testID="services-heading"
          eyebrow="Catálogo"
          title="Serviços, combos e promoções"
          description="Monte o cardápio, empacote combos com preço único e programe descontos por dia da semana."
        />
        {!!notice && <InlineNotice testID="services-action-notice" tone={notice.tone} message={notice.message} />}

        <View style={styles.tabsWrap}>
          <SegmentedControl
            testID="services-tabs"
            value={tab}
            onChange={(next) => {
              setTab(next);
              resetServiceForm();
              resetPromoForm();
              setNotice(null);
            }}
            options={[
              { value: 'services', label: 'Serviços' },
              { value: 'combos', label: 'Combos' },
              { value: 'promotions', label: 'Promoções' },
            ]}
          />
        </View>

        {tab !== 'promotions' ? (
          <View style={styles.workspace}>
            <View style={styles.listColumn}>
              <View style={styles.listHeader}>
                <View>
                  <Text testID="services-list-title" style={styles.listTitle}>{tab === 'combos' ? 'Combos' : 'Catálogo atual'}</Text>
                  <Text style={styles.listSubtitle}>{activeCount} ativos de {listedAll.length} cadastrados</Text>
                </View>
                <View style={styles.listHeaderActions}>
                  <StatusBadge testID="services-active-count" label={`${activeCount} ativos`} tone="success" />
                  <AppButton
                    label={tab === 'combos' ? 'Novo combo' : 'Novo serviço'}
                    testID="services-open-form-button"
                    variant="admin"
                    size="sm"
                    icon={<Plus color={colors.white} size={15} />}
                    onPress={() => {
                      resetServiceForm();
                      setFormOpen(true);
                      setNotice(null);
                    }}
                  />
                </View>
              </View>

              {listedAll.length > 8 ? (
                <TextInput
                  testID="services-search-input"
                  value={serviceQuery}
                  onChangeText={setServiceQuery}
                  placeholder={tab === 'combos' ? 'Buscar combo' : 'Buscar serviço'}
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                />
              ) : null}

              {loading ? (
                <ActivityIndicator testID="services-loading" color={colors.accent} style={styles.loader} />
              ) : listedAll.length === 0 ? (
                <EmptyState
                  testID="services-empty-state"
                  title={tab === 'combos' ? 'Nenhum combo ainda' : 'Monte seu catálogo'}
                  description={tab === 'combos' ? 'Empacote dois ou mais serviços com um preço único.' : 'Adicione o primeiro serviço para liberar o fluxo de agendamento.'}
                  icon={<Scissors color={colors.textSecondary} size={22} />}
                />
              ) : listed.length === 0 ? (
                <EmptyState
                  testID="services-search-empty"
                  title="Nenhum resultado"
                  description="Ajuste a busca para encontrar itens do catálogo."
                  icon={<Scissors color={colors.textSecondary} size={22} />}
                />
              ) : (
                <View style={styles.serviceList}>
                  {listed.map((service, index) => {
                    const memberIds = comboItems.filter((item) => item.comboId === service.id).map((item) => item.serviceId);
                    const total = comboMembersTotal(memberIds.map((id) => singles.find((item) => item.id === id)?.price || 0));
                    const savings = comboDiscountPercent(total, service.price);
                    return (
                      <AppCard key={service.id} testID={`service-card-${service.id}`} style={[styles.serviceCard, !isWide && styles.serviceCardMobile, !service.isActive && styles.serviceCardInactive]}>
                        <View style={styles.serviceHeader}>
                          <View style={[styles.serviceIcon, !service.isActive && styles.serviceIconInactive]}>
                            {service.kind === 'combo' ? <Tags color={service.isActive ? colors.text : colors.textMuted} size={18} /> : <Scissors color={service.isActive ? colors.text : colors.textMuted} size={18} />}
                          </View>
                          <View style={styles.serviceCopy}>
                            <View style={styles.nameRow}>
                              <Text testID={`service-card-${service.id}-name`} style={styles.serviceName}>{service.name}</Text>
                              {service.kind === 'combo' ? <StatusBadge label="Combo" tone="info" /> : null}
                            </View>
                            <View style={styles.serviceMeta}>
                              <Text style={styles.servicePrice}>{currency(service.price)}</Text>
                              <Text style={styles.metaDivider}>·</Text>
                              <Clock3 color={colors.textMuted} size={12} />
                              <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                              {service.kind === 'combo' && savings > 0 ? (
                                <>
                                  <Text style={styles.metaDivider}>·</Text>
                                  <Text style={styles.savingsText}>{savings.toFixed(1).replace('.', ',')}% vs avulsos</Text>
                                </>
                              ) : null}
                            </View>
                            {service.kind === 'combo' ? (
                              <Text style={styles.memberLine}>
                                {memberIds.map((id) => singles.find((item) => item.id === id)?.name || 'Serviço').join(' + ')}
                              </Text>
                            ) : null}
                          </View>
                          <StatusBadge testID={`service-card-${service.id}-status`} label={service.isActive ? 'Ativo' : 'Pausado'} tone={service.isActive ? 'success' : 'neutral'} />
                        </View>
                        <View style={[styles.serviceActions, !isWide && styles.serviceActionsMobile]}>
                          <Pressable testID={`service-card-${service.id}-edit-button`} accessibilityRole="button" disabled={!!actionLoadingId} onPress={() => startEditing(service)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Pencil color={colors.textSecondary} size={16} /></Pressable>
                          <Pressable testID={`service-card-${service.id}-duplicate-button`} accessibilityRole="button" disabled={!!actionLoadingId} onPress={() => { void duplicateService(service); }} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Copy color={colors.textSecondary} size={16} /></Pressable>
                          <Pressable testID={`service-card-${service.id}-move-up-button`} accessibilityRole="button" disabled={!!actionLoadingId || listedAll.findIndex((item) => item.id === service.id) === 0} onPress={() => { void reorderService(service, 'up'); }} style={({ pressed }) => [styles.iconButton, listedAll.findIndex((item) => item.id === service.id) === 0 && styles.disabledAction, pressed && styles.pressed]}><ArrowUp color={colors.textSecondary} size={16} /></Pressable>
                          <Pressable testID={`service-card-${service.id}-move-down-button`} accessibilityRole="button" disabled={!!actionLoadingId || listedAll.findIndex((item) => item.id === service.id) === listedAll.length - 1} onPress={() => { void reorderService(service, 'down'); }} style={({ pressed }) => [styles.iconButton, listedAll.findIndex((item) => item.id === service.id) === listedAll.length - 1 && styles.disabledAction, pressed && styles.pressed]}><ArrowDown color={colors.textSecondary} size={16} /></Pressable>
                          <Pressable
                            testID={`service-card-${service.id}-toggle-button`}
                            accessibilityRole="button"
                            disabled={!!actionLoadingId}
                            onPress={() => { void toggleService(service); }}
                            style={({ pressed }) => [styles.toggleButton, service.isActive && styles.toggleButtonActive, pressed && styles.pressed]}
                          >
                            {actionLoadingId === service.id ? <ActivityIndicator color={colors.text} size="small" /> : <Power color={service.isActive ? colors.success : colors.textMuted} size={17} />}
                          </Pressable>
                        </View>
                      </AppCard>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={[styles.workspace, isWide && styles.workspaceWide]}>
            <FormSection
              testID="promotions-create-form"
              title={editingPromoId ? 'Editar promoção' : 'Nova promoção semanal'}
              description="O preço promocional é aplicado no booking e gravado em price_charged no dia do atendimento."
              style={styles.formSection}
            >
              <Text style={styles.helperLabel}>Abrangência</Text>
              <View style={styles.chipRow}>
                <Pressable testID="promo-scope-all" onPress={() => setPromoServiceId('all')} style={[styles.chip, promoServiceId === 'all' && styles.chipActive]}>
                  <Text style={[styles.chipText, promoServiceId === 'all' && styles.chipTextActive]}>Todos os serviços</Text>
                </Pressable>
                {services.filter((service) => service.isActive).map((service) => (
                  <Pressable key={service.id} testID={`promo-scope-${service.id}`} onPress={() => setPromoServiceId(service.id)} style={[styles.chip, promoServiceId === service.id && styles.chipActive]}>
                    <Text style={[styles.chipText, promoServiceId === service.id && styles.chipTextActive]}>{service.name}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.helperLabel}>Dias da semana</Text>
              <View style={styles.chipRow}>
                {DAY_OPTIONS.map((day) => {
                  const selected = promoDays.includes(day.value);
                  return (
                    <Pressable
                      key={day.value}
                      testID={`promo-day-${day.value}`}
                      onPress={() => setPromoDays((current) => selected ? current.filter((value) => value !== day.value) : [...current, day.value].sort())}
                      style={[styles.chip, selected && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{day.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.chipRow}>
                <Pressable testID="promo-type-percent" onPress={() => setPromoType('percent')} style={[styles.chip, promoType === 'percent' && styles.chipActive]}>
                  <Text style={[styles.chipText, promoType === 'percent' && styles.chipTextActive]}>% percentual</Text>
                </Pressable>
                <Pressable testID="promo-type-fixed" onPress={() => setPromoType('fixed_price')} style={[styles.chip, promoType === 'fixed_price' && styles.chipActive]}>
                  <Text style={[styles.chipText, promoType === 'fixed_price' && styles.chipTextActive]}>Preço fixo</Text>
                </Pressable>
              </View>

              <View style={styles.formRow}>
                <AppInput containerStyle={styles.halfField} label={promoType === 'percent' ? 'Desconto (%)' : 'Preço promocional'} testID="promo-value-input" icon={<Percent color={colors.textMuted} size={17} />} value={promoValue} onChangeText={setPromoValue} keyboardType="decimal-pad" />
                <AppInput containerStyle={styles.halfField} label="Início" testID="promo-starts-input" value={promoStartsAt} onChangeText={setPromoStartsAt} placeholder="AAAA-MM-DD" />
              </View>
              <AppInput label="Fim (opcional)" testID="promo-ends-input" value={promoEndsAt} onChangeText={setPromoEndsAt} placeholder="AAAA-MM-DD" />

              <View style={styles.formActions}>
                <AppButton label={editingPromoId ? 'Salvar promoção' : 'Criar promoção'} testID="promo-save-button" onPress={savePromotion} loading={submitting} fullWidth variant="admin" icon={<Plus color={colors.white} size={17} />} style={styles.primaryFormAction} />
                {editingPromoId ? <AppButton label="Cancelar" testID="promo-edit-cancel" onPress={resetPromoForm} variant="secondary" /> : null}
              </View>
            </FormSection>

            <View style={styles.listColumn}>
              <View style={styles.listHeader}>
                <View>
                  <Text style={styles.listTitle}>Promoções</Text>
                  <Text style={styles.listSubtitle}>{promotions.filter((item) => item.isActive).length} ativas</Text>
                </View>
              </View>
              {!promotions.length ? (
                <EmptyState title="Sem promoções" description="Programe descontos por dia da semana para a vitrine e o booking." icon={<Percent color={colors.textSecondary} size={22} />} />
              ) : (
                <View style={styles.serviceList}>
                  {promotions.map((promotion) => {
                    const serviceName = promotion.serviceId
                      ? services.find((service) => service.id === promotion.serviceId)?.name || 'Serviço'
                      : 'Todos os serviços';
                    const days = promotion.daysOfWeek
                      .slice()
                      .sort()
                      .map((day) => DAY_OPTIONS.find((option) => option.value === day)?.label || String(day))
                      .join(', ');
                    return (
                      <AppCard key={promotion.id} testID={`promo-card-${promotion.id}`} style={[styles.serviceCard, !promotion.isActive && styles.serviceCardInactive]}>
                        <View style={styles.serviceHeader}>
                          <View style={styles.serviceCopy}>
                            <Text style={styles.serviceName}>{serviceName}</Text>
                            <Text style={styles.memberLine}>
                              {promotion.discountType === 'percent'
                                ? `${String(promotion.value).replace('.', ',')}% off`
                                : `${currency(promotion.value)} fixo`}
                              {' · '}{days}
                            </Text>
                            <Text style={styles.helperMuted}>
                              {promotion.startsAt.slice(0, 10)}
                              {promotion.endsAt ? ` → ${promotion.endsAt.slice(0, 10)}` : ' · sem data fim'}
                            </Text>
                          </View>
                          <StatusBadge label={promotion.isActive ? 'Ativa' : 'Pausada'} tone={promotion.isActive ? 'success' : 'neutral'} />
                        </View>
                        <View style={styles.serviceActions}>
                          <Pressable onPress={() => startEditingPromo(promotion)} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Pencil color={colors.textSecondary} size={16} /></Pressable>
                          <Pressable onPress={() => { void togglePromotion(promotion); }} style={({ pressed }) => [styles.toggleButton, promotion.isActive && styles.toggleButtonActive, pressed && styles.pressed]}>
                            {actionLoadingId === promotion.id ? <ActivityIndicator size="small" color={colors.text} /> : <Power color={promotion.isActive ? colors.success : colors.textMuted} size={17} />}
                          </Pressable>
                        </View>
                      </AppCard>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={formOpen && tab !== 'promotions'} transparent animationType="fade" onRequestClose={resetServiceForm}>
        <Pressable style={styles.modalOverlay} onPress={() => !submitting && resetServiceForm()}>
          <Pressable onPress={(event) => event.stopPropagation?.()} style={styles.modalCardPressable}>
            <FormSection
              testID="services-create-form"
              title={editingId ? (tab === 'combos' ? 'Editar combo' : 'Editar serviço') : (tab === 'combos' ? 'Novo combo' : 'Novo serviço')}
              description={tab === 'combos'
                ? 'Defina o preço único do pacote. A duração começa como soma dos membros e pode ser ajustada.'
                : 'Cadastre uma opção com preço e tempo suficientes para bloquear a agenda corretamente.'}
              style={styles.formModal}
            >
              <AppInput label={tab === 'combos' ? 'Nome do combo' : 'Nome do serviço'} testID="services-name-input" icon={<Scissors color={colors.textMuted} size={17} />} placeholder={tab === 'combos' ? 'Ex.: Corte + barba' : 'Ex.: Corte clássico'} value={name} onChangeText={setName} />
              <View style={styles.formRow}>
                <AppInput containerStyle={styles.halfField} label="Preço" testID="services-price-input" icon={<WalletCards color={colors.textMuted} size={17} />} placeholder="45,00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
                <AppInput containerStyle={styles.halfField} label="Duração (min)" testID="services-duration-input" icon={<Clock3 color={colors.textMuted} size={17} />} placeholder={tab === 'combos' ? String(suggestedDuration || 60) : '30'} value={duration} onChangeText={setDuration} keyboardType="number-pad" />
              </View>
              {tab === 'combos' ? (
                <View style={styles.comboMembers}>
                  <Text style={styles.helperLabel}>Serviços do combo</Text>
                  <View style={styles.chipRow}>
                    {singles.map((service) => {
                      const selected = selectedMemberIds.includes(service.id);
                      return (
                        <Pressable key={service.id} testID={`combo-member-${service.id}`} onPress={() => toggleMember(service.id)} style={[styles.chip, selected && styles.chipActive]}>
                          <Text style={[styles.chipText, selected && styles.chipTextActive]}>{service.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!singles.length ? <Text style={styles.helperMuted}>Cadastre serviços avulsos antes de montar um combo.</Text> : null}
                  {selectedMemberIds.length >= 2 ? (
                    <Text style={styles.helperMuted}>
                      Soma avulsa {currency(membersTotal)}
                      {Number.isFinite(numericPrice) && numericPrice > 0 ? ` · economia ${discountPreview.toFixed(1).replace('.', ',')}%` : ''}
                      {suggestedDuration ? ` · duração sugerida ${suggestedDuration} min` : ''}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.formActions}>
                <AppButton
                  label={editingId ? 'Salvar alterações' : tab === 'combos' ? 'Adicionar combo' : 'Adicionar serviço'}
                  testID="services-add-button"
                  onPress={saveService}
                  loading={submitting}
                  fullWidth
                  variant="admin"
                  icon={editingId ? <Pencil color={colors.white} size={17} /> : <Plus color={colors.white} size={17} />}
                  style={styles.primaryFormAction}
                />
                <AppButton label="Cancelar" testID="services-edit-cancel" onPress={resetServiceForm} variant="secondary" icon={<X color={colors.text} size={16} />} />
              </View>
            </FormSection>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={Boolean(pauseConfirm)}
        title="Pausar item"
        message={pauseConfirm?.message || ''}
        confirmLabel="Pausar"
        destructive
        testID="services-pause-confirm"
        onConfirm={() => {
          if (pauseConfirm) void applyServiceActive(pauseConfirm.service, false);
        }}
        onCancel={() => setPauseConfirm(null)}
      />
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingTop: 30, paddingBottom: 110, gap: 20 },
  tabsWrap: { marginTop: 8, maxWidth: 420 },
  workspace: { gap: 18, marginTop: 18 },
  workspaceWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formSection: { flex: 0.9, minWidth: 300 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  halfField: { flex: 1, minWidth: 135 },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryFormAction: { flex: 1 },
  listColumn: { flex: 1 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 },
  listHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  listTitle: { color: colors.text, fontFamily: typography.display, fontSize: 18, letterSpacing: -0.5 },
  listSubtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 13,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as object,
      default: {},
    }),
  },
  modalCardPressable: { width: '100%', maxWidth: 520 },
  formModal: { width: '100%', ...glassSurface },
  loader: { margin: 50 },
  serviceList: { gap: 9 },
  serviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15 },
  serviceCardMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 10 },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  serviceCardInactive: { opacity: 0.64 },
  serviceIcon: { width: 42, height: 42, borderRadius: radii.md, backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  serviceIconInactive: { backgroundColor: colors.surfacePressed },
  serviceCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5, flexWrap: 'wrap' },
  servicePrice: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  metaDivider: { color: colors.textMuted },
  serviceDuration: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  savingsText: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 12 },
  memberLine: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 4 },
  serviceActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  serviceActionsMobile: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 10, marginTop: 4, width: '100%' },
  iconButton: { width: 36, height: 36, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvasSoft, borderWidth: 1, borderColor: colors.borderSubtle },
  disabledAction: { opacity: 0.3 },
  toggleButton: { width: 38, height: 38, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfacePressed, borderWidth: 1, borderColor: colors.border },
  toggleButtonActive: { backgroundColor: colors.successSoft, borderColor: '#34D39944' },
  pressed: { opacity: 0.6, transform: [{ scale: 0.97 }] },
  comboMembers: { gap: 8 },
  helperLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 4 },
  helperMuted: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  chipTextActive: { color: colors.white },
});
