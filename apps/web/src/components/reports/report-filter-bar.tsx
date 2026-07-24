import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { AdminReportFilters, AdminReportStatus } from '../../types/admin-report';
import { colors, radii, typeScale } from '../../theme/tokens';
import { AdminReportFilterOption } from '../../hooks/use-admin-report-filter-options';

const statusOptions: { id: AdminReportStatus; name: string }[] = [
  { id: 'pending', name: 'Pendente' },
  { id: 'confirmed', name: 'Confirmado' },
  { id: 'completed', name: 'Concluído' },
  { id: 'cancelled', name: 'Cancelado' },
];

interface Props {
  filters: AdminReportFilters;
  professionals: AdminReportFilterOption[];
  services: AdminReportFilterOption[];
  onChange: (filters: AdminReportFilters) => void;
}

const FilterGroup = ({ label, options, value, onSelect }: {
  label: string;
  options: AdminReportFilterOption[];
  value?: string | null;
  onSelect: (value: string | null) => void;
}) => (
  <View style={styles.group}>
    <Text style={styles.label}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.options}>
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: !value }} onPress={() => onSelect(null)} style={[styles.chip, !value && styles.chipActive]}>
        <Text style={[styles.chipText, !value && styles.chipTextActive]}>Todos</Text>
      </Pressable>
      {options.map((option) => (
        <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: value === option.id }} onPress={() => onSelect(option.id)} style={[styles.chip, value === option.id && styles.chipActive]}>
          <Text style={[styles.chipText, value === option.id && styles.chipTextActive]}>{option.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  </View>
);

export const ReportFilterBar = ({ filters, professionals, services, onChange }: Props) => {
  const hasFilters = Boolean(filters.professionalId || filters.serviceId || filters.status);
  return (
    <View testID="reports-filter-bar" style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Filtros do relatório</Text>
        {hasFilters ? (
          <Pressable testID="reports-clear-filters" accessibilityRole="button" onPress={() => onChange({})} style={styles.clear}>
            <X size={14} color={colors.textMuted} /><Text style={styles.clearText}>Limpar filtros</Text>
          </Pressable>
        ) : null}
      </View>
      <FilterGroup label="Profissional" options={professionals} value={filters.professionalId} onSelect={(professionalId) => onChange({ ...filters, professionalId })} />
      <FilterGroup label="Serviço" options={services} value={filters.serviceId} onSelect={(serviceId) => onChange({ ...filters, serviceId })} />
      <FilterGroup label="Status" options={statusOptions} value={filters.status} onSelect={(status) => onChange({ ...filters, status: status as AdminReportStatus | null })} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 14, padding: 16, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.lg, backgroundColor: colors.surface },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { ...typeScale.bodyStrong, color: colors.text },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 8 },
  clearText: { ...typeScale.small, color: colors.textMuted },
  group: { gap: 7 },
  label: { ...typeScale.label, color: colors.textSecondary, textTransform: 'uppercase' },
  options: { gap: 7 },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.pill, backgroundColor: colors.canvasSoft },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondarySoft },
  chipText: { ...typeScale.small, color: colors.textSecondary },
  chipTextActive: { color: colors.brandPrimary },
});
