import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowDown, ArrowUp, Copy, Power, Scissors, TriangleAlert } from 'lucide-react-native';
import { landingColors as colors, landingRadii as radii, landingTypography as typography } from '../../../theme/landing-tokens';

interface DemoService {
  id: string;
  name: string;
  price: number;
  duration: number;
  active: boolean;
  futureBookings: number;
}

const initialServices: DemoService[] = [
  { id: 'service-1', name: 'Corte essencial', price: 45, duration: 30, active: true, futureBookings: 3 },
  { id: 'service-2', name: 'Corte e barba', price: 70, duration: 50, active: true, futureBookings: 1 },
  { id: 'service-3', name: 'Barba', price: 35, duration: 20, active: true, futureBookings: 0 },
];

export const ServicesSandbox = () => {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [services, setServices] = useState(initialServices);
  const [pendingDeactivation, setPendingDeactivation] = useState<string | null>(null);

  const pendingService = useMemo(
    () => services.find((service) => service.id === pendingDeactivation) ?? null,
    [pendingDeactivation, services],
  );

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= services.length) return;
    setServices((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const duplicate = (service: DemoService) => {
    setServices((current) => [
      ...current,
      { ...service, id: `service-${Date.now()}`, name: `${service.name} — cópia`, futureBookings: 0 },
    ]);
  };

  const confirmDeactivation = () => {
    if (!pendingService) return;
    setServices((current) => current.map((service) => (
      service.id === pendingService.id ? { ...service, active: false } : service
    )));
    setPendingDeactivation(null);
  };

  return (
    <View testID="business-services-demo" style={styles.card}>
      <View style={[styles.header, compact && styles.headerStacked]}>
        <View style={styles.headerCopy}>
          <View style={styles.titleRow}><Scissors size={18} color={colors.brand} /><Text style={styles.title}>Serviços e preços</Text></View>
          <Text style={styles.subtitle}>Organize o catálogo e saiba o impacto antes de desativar um serviço.</Text>
        </View>
        <View style={styles.availableBadge}><Text style={styles.availableBadgeText}>FUNÇÃO DISPONÍVEL</Text></View>
      </View>

      <View style={styles.list}>
        {services.map((service, index) => (
          <View key={service.id} style={[styles.serviceRow, compact && styles.serviceRowStacked, !service.active && styles.serviceInactive]}>
            <View style={styles.orderControls}>
              <Pressable accessibilityLabel={`Mover ${service.name} para cima`} disabled={index === 0} onPress={() => move(index, -1)} style={styles.iconButton}>
                <ArrowUp size={15} color={index === 0 ? colors.borderStrong : colors.inkSecondary} />
              </Pressable>
              <Pressable accessibilityLabel={`Mover ${service.name} para baixo`} disabled={index === services.length - 1} onPress={() => move(index, 1)} style={styles.iconButton}>
                <ArrowDown size={15} color={index === services.length - 1 ? colors.borderStrong : colors.inkSecondary} />
              </Pressable>
            </View>
            <View style={styles.serviceCopy}>
              <Text style={styles.serviceName}>{service.name}</Text>
              <Text style={styles.serviceMeta}>R$ {service.price.toFixed(2).replace('.', ',')} · {service.duration} min{!service.active ? ' · desativado' : ''}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityLabel={`Duplicar ${service.name}`} onPress={() => duplicate(service)} style={styles.actionButton}>
                <Copy size={15} color={colors.brand} /><Text style={styles.actionText}>Duplicar</Text>
              </Pressable>
              {service.active && (
                <Pressable accessibilityLabel={`Desativar ${service.name}`} onPress={() => setPendingDeactivation(service.id)} style={styles.actionButton}>
                  <Power size={15} color={colors.danger} /><Text style={styles.dangerText}>Desativar</Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>

      {pendingService && (
        <View testID="business-services-impact-warning" style={styles.warning}>
          <TriangleAlert size={19} color={colors.warning} />
          <View style={styles.warningCopy}>
            <Text style={styles.warningTitle}>Confira antes de desativar</Text>
            <Text style={styles.warningText}>{pendingService.futureBookings} {pendingService.futureBookings === 1 ? 'agendamento futuro será afetado' : 'agendamentos futuros serão afetados'}.</Text>
          </View>
          <View style={styles.warningActions}>
            <Pressable onPress={() => setPendingDeactivation(null)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
            <Pressable onPress={confirmDeactivation} style={styles.confirmButton}><Text style={styles.confirmText}>Confirmar</Text></Pressable>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 22, gap: 18, borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, backgroundColor: colors.surface, boxShadow: '0 2px 8px rgba(20,33,25,0.05)' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18 },
  headerStacked: { flexDirection: 'column' },
  headerCopy: { flex: 1, gap: 7 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.ink, fontFamily: typography.displaySemiBold, fontSize: 19 },
  subtitle: { color: colors.inkSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21 },
  availableBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.successSoft },
  availableBadgeText: { color: colors.success, fontFamily: typography.bodySemiBold, fontSize: 11, letterSpacing: 0.5 },
  list: { gap: 10 },
  serviceRow: { minHeight: 72, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surfaceSoft },
  serviceRowStacked: { alignItems: 'flex-start', flexWrap: 'wrap' },
  serviceInactive: { opacity: 0.58 },
  orderControls: { flexDirection: 'row', gap: 4 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  serviceCopy: { flex: 1, minWidth: 170, gap: 3 },
  serviceName: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 14 },
  serviceMeta: { color: colors.inkMuted, fontFamily: typography.body, fontSize: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionButton: { minHeight: 40, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surface },
  actionText: { color: colors.brand, fontFamily: typography.bodySemiBold, fontSize: 12 },
  dangerText: { color: colors.danger, fontFamily: typography.bodySemiBold, fontSize: 12 },
  warning: { padding: 14, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderWidth: 1, borderColor: colors.warningBorder, borderRadius: radii.md, backgroundColor: colors.warningSoft },
  warningCopy: { flex: 1, minWidth: 180, gap: 2 },
  warningTitle: { color: colors.ink, fontFamily: typography.bodySemiBold, fontSize: 13 },
  warningText: { color: colors.inkSecondary, fontFamily: typography.body, fontSize: 12 },
  warningActions: { flexDirection: 'row', gap: 7 },
  cancelButton: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.inkSecondary, fontFamily: typography.bodySemiBold, fontSize: 12 },
  confirmButton: { minHeight: 40, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, backgroundColor: colors.brand },
  confirmText: { color: colors.white, fontFamily: typography.bodySemiBold, fontSize: 12 },
});
