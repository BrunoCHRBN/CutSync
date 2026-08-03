import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Percent, WalletCards, XCircle } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useAppointments } from '../../hooks/useAppointments';
import { useEstablishment } from '../../hooks/useEstablishment';
import { ProfessionalShell } from '../layout/ProfessionalShell';
import { MetricStrip } from '../ui/metric-strip';
import { SegmentedControl } from '../ui/SegmentedControl';
import { SectionHeading } from '../ui/SectionHeading';
import { colors, layout, spacing, typeScale } from '../../theme/tokens';

type RangeKey = 'day' | 'week' | 'month';

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const rangeFor = (key: RangeKey) => {
  const now = new Date();
  if (key === 'day') return { start: startOfDay(now), end: endOfDay(now), label: 'Hoje' };
  if (key === 'week') {
    const start = startOfDay(now);
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    const end = endOfDay(new Date(start));
    end.setDate(start.getDate() + 6);
    return { start, end, label: 'Esta semana' };
  }
  const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end, label: 'Este mês' };
};

export const ProfessionalPerformanceExperience = () => {
  const { profile, signOut } = useAuth();
  const { establishment } = useEstablishment(profile?.establishment_id);
  const [rangeKey, setRangeKey] = useState<RangeKey>('day');
  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);

  const { appointments, loading } = useAppointments({
    establishmentId: profile?.establishment_id,
    professionalId: profile?.id,
    dateFrom: range.start.toISOString(),
    dateTo: range.end.toISOString(),
    enabled: Boolean(profile?.establishment_id && profile?.id),
  });

  const currency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: establishment?.currency || 'BRL' }).format(value);

  const completed = appointments.filter((item) => item.status === 'completed');
  const cancelled = appointments.filter((item) => item.status === 'cancelled');
  const revenue = completed.reduce((sum, item) => sum + (item.priceCharged || item.service?.price || 0), 0);
  const commission = revenue * (profile?.commission_rate ?? 0.5);
  const cancelRate = appointments.length
    ? Math.round((cancelled.length / appointments.length) * 100)
    : 0;

  return (
    <ProfessionalShell
      activeRoute="performance"
      name={profile?.name}
      onSignOut={signOut}
      shopName={establishment?.name}
      testID="professional-performance-screen"
    >
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <SectionHeading
          description="Números com escopo explícito — não mudam ao navegar a agenda."
          eyebrow="Desempenho"
          testID="professional-performance-heading"
          title={`Resultados · ${range.label}`}
          variant="section"
        />
        <SegmentedControl
          onChange={(next) => setRangeKey(next as RangeKey)}
          options={[
            { label: 'Dia', value: 'day' },
            { label: 'Semana', value: 'week' },
            { label: 'Mês', value: 'month' },
          ]}
          testID="professional-performance-range"
          value={rangeKey}
        />
        <Text style={styles.scope}>
          Período: {range.start.toLocaleDateString('pt-BR')} — {range.end.toLocaleDateString('pt-BR')}
          {loading ? ' · atualizando…' : ''}
        </Text>
        <MetricStrip
          testID="professional-performance-metrics"
          items={[
            {
              key: 'completed',
              testID: 'performance-completed',
              label: 'Concluídos',
              value: String(completed.length),
              note: `${appointments.length} no período`,
              icon: <Check color={colors.success} size={18} />,
            },
            {
              key: 'commission',
              testID: 'performance-commission',
              label: 'Meu ganho',
              value: currency(commission),
              note: `${currency(revenue)} produzidos · ${Math.round((profile?.commission_rate ?? 0.5) * 100)}% comissão`,
              icon: <WalletCards color={colors.info} size={18} />,
            },
            {
              key: 'cancel',
              testID: 'performance-cancel-rate',
              label: 'Cancelamentos',
              value: `${cancelRate}%`,
              note: `${cancelled.length} cancelados`,
              icon: <XCircle color={colors.danger} size={18} />,
            },
            {
              key: 'rate',
              testID: 'performance-completion-rate',
              label: 'Taxa de conclusão',
              value: appointments.length
                ? `${Math.round((completed.length / appointments.length) * 100)}%`
                : '0%',
              note: 'Sobre o total do período',
              icon: <Percent color={colors.brandPrimary} size={18} />,
            },
          ]}
        />
      </ScrollView>
    </ProfessionalShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', gap: spacing.md, padding: 20, paddingBottom: 96 },
  scope: { ...typeScale.small, color: colors.textSecondary },
});

export default ProfessionalPerformanceExperience;
