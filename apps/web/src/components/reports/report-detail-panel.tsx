import React from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CalendarDays, ChevronRight, X } from 'lucide-react-native';
import { AdminReportDetailItem } from '../../types/admin-report';
import { colors, radii, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';

interface Props {
  visible: boolean;
  title: string;
  context: string;
  items: AdminReportDetailItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  currency: Intl.NumberFormat;
  onClose: () => void;
  onLoadMore: () => void;
  onRetry: () => void;
  onOpenAgenda: (date: string, professionalId: string) => void;
}

const statusLabel: Record<string, string> = {
  pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado',
};

export const ReportDetailPanel = ({
  visible, title, context, items, loading, error, hasMore, currency,
  onClose, onLoadMore, onRetry, onOpenAgenda,
}: Props) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.overlay}>
      <Pressable testID="reports-detail-backdrop" accessibilityRole="button" accessibilityLabel="Fechar detalhamento" onPress={onClose} style={styles.backdrop} />
      <View testID="reports-detail-panel" accessibilityViewIsModal style={styles.panel}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.context}>{context}</Text>
          </View>
          <Pressable testID="reports-detail-close" accessibilityRole="button" accessibilityLabel="Fechar detalhamento" onPress={onClose} style={styles.close}>
            <X color={colors.text} size={20} />
          </Pressable>
        </View>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
          {error ? <InlineNotice tone="danger" message={error} action={<AppButton label="Tentar novamente" variant="secondary" size="sm" onPress={onRetry} />} /> : null}
          {!error && !loading && !items.length ? <EmptyState title="Nenhum registro encontrado" description="Não há registros para os filtros e período selecionados." /> : null}
          {items.map((item) => item.kind === 'appointment' ? (
            <View key={item.id} testID={`reports-detail-appointment-${item.id}`} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text selectable style={styles.rowTitle}>{item.client_name}</Text>
                <Text selectable style={styles.rowMeta}>{new Date(item.date_time).toLocaleString('pt-BR')} · {item.service_name}</Text>
                <Text selectable style={styles.rowMeta}>{item.professional_name} · {statusLabel[item.status] || item.status}</Text>
              </View>
              <View style={styles.rowAction}>
                <Text selectable style={styles.value}>{currency.format(item.production_value)}</Text>
                <Pressable accessibilityRole="link" onPress={() => onOpenAgenda(item.date_time, item.professional_id)} style={styles.agendaLink}>
                  <CalendarDays size={14} color={colors.brandPrimary} />
                  <Text style={styles.agendaText}>Abrir na agenda</Text>
                  <ChevronRight size={14} color={colors.brandPrimary} />
                </Pressable>
              </View>
            </View>
          ) : (
            <View key={item.id} testID={`reports-detail-client-${item.id}`} style={styles.row}>
              <View style={styles.rowCopy}>
                <Text selectable style={styles.rowTitle}>{item.display_name}</Text>
                <Text selectable style={styles.rowMeta}>Última visita: {new Date(item.last_visit).toLocaleDateString('pt-BR')} · {item.visit_count} visita(s)</Text>
                <Text selectable style={styles.rowMeta}>{item.next_appointment ? `Próxima visita: ${new Date(item.next_appointment).toLocaleString('pt-BR')}` : 'Sem próxima visita'}</Text>
              </View>
              <Text style={styles.clientStatus}>{item.operational_status === 'scheduled' ? 'Agendado' : item.operational_status === 'active' ? 'Ativo' : 'Inativo'}</Text>
            </View>
          ))}
          {loading ? <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /><Text style={styles.context}>Carregando registros...</Text></View> : null}
          {hasMore && !loading ? <AppButton testID="reports-detail-load-more" label="Carregar mais 25" variant="secondary" onPress={onLoadMore} /> : null}
        </ScrollView>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: 'rgba(16,24,40,0.24)' },
  backdrop: { ...StyleSheet.absoluteFill },
  panel: { width: '100%', maxWidth: 540, height: '100%', backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.borderSubtle },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 22, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  headerCopy: { flex: 1, gap: 4 },
  title: { ...typeScale.sectionTitle, color: colors.text },
  context: { ...typeScale.small, color: colors.textMuted },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.canvasSoft },
  content: { padding: 20, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.md },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { ...typeScale.bodyStrong, color: colors.text },
  rowMeta: { ...typeScale.small, color: colors.textMuted },
  rowAction: { alignItems: 'flex-end', gap: 8 },
  value: { ...typeScale.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  agendaLink: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 32 },
  agendaText: { ...typeScale.small, color: colors.brandPrimary },
  clientStatus: { ...typeScale.label, color: colors.brandPrimary, textTransform: 'uppercase' },
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
