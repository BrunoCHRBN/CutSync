import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import {
  Banknote, CalendarRange, Download, RefreshCw, Repeat2, TicketCheck, TrendingUp, UsersRound,
} from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminReport } from '../../hooks/use-admin-report';
import { useAdminReportDetails, AdminReportDetailSelection } from '../../hooks/use-admin-report-details';
import { useAdminReportFilterOptions } from '../../hooks/use-admin-report-filter-options';
import { useEstablishment } from '../../hooks/useEstablishment';
import { AdminReport, AdminReportFilters, AdminReportTab } from '../../types/admin-report';
import {
  adminReportUrlParams, AdminReportPreset, parseAdminReportUrlState, rangeForReportPreset,
} from '../../utils/admin-report-state';
import { colors, layout, radii, typography, typeScale } from '../../theme/tokens';
import { AdminShell } from '../layout/AdminShell';
import { ReportChart } from '../reports/report-chart';
import { ReportDetailPanel } from '../reports/report-detail-panel';
import { ReportFilterBar } from '../reports/report-filter-bar';
import { AppButton } from '../ui/AppButton';
import { AppCard } from '../ui/AppCard';
import { AppInput } from '../ui/AppInput';
import { EmptyState } from '../ui/EmptyState';
import { InlineNotice } from '../ui/InlineNotice';
import { MetricStrip } from '../ui/metric-strip';
import { PageHeader } from '../ui/page-header';
import { SegmentedControl } from '../ui/SegmentedControl';
import { StatusBadge } from '../ui/StatusBadge';

const periodOptions = [
  { value: '7d' as const, label: '7 dias' },
  { value: '30d' as const, label: '30 dias' },
  { value: '90d' as const, label: '90 dias' },
  { value: 'month' as const, label: 'Mês atual' },
  { value: 'custom' as const, label: 'Personalizado' },
];

const tabOptions = [
  { value: 'overview' as const, label: 'Visão geral' },
  { value: 'operations' as const, label: 'Operação' },
  { value: 'team' as const, label: 'Equipe' },
  { value: 'services' as const, label: 'Serviços' },
  { value: 'clients' as const, label: 'Clientes' },
];

const currencyFormatter = (currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}min`;
const deltaLabel = (current: number, previous: number) => {
  if (previous === 0) return current === 0 ? 'sem variação no período' : 'sem base no período anterior';
  const change = (current - previous) * 100 / Math.abs(previous);
  if (Math.abs(change) < 0.1) return 'igual ao período anterior';
  return `${Math.abs(change).toFixed(1).replace('.', ',')}% ${change > 0 ? 'acima' : 'abaixo'} do período anterior`;
};
const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const buildCsv = (report: AdminReport, filters: AdminReportFilters) => {
  const lines: (string | number)[][] = [
    ['CutSync - relatório agregado do estabelecimento'],
    ['Período', report.period.start, report.period.end],
    ['Filtros', `profissional=${filters.professionalId || 'todos'}`, `serviço=${filters.serviceId || 'todos'}`, `status=${filters.status || 'todos'}`],
    [], ['Resumo'],
    ['Produção realizada', report.summary.production_realized],
    ['Valor agendado', report.summary.scheduled_value],
    ['Ticket médio', report.summary.average_ticket],
    ['Ocupação (%)', report.summary.occupancy_rate],
    ['Concluídos', report.summary.completed_count],
    ['Cancelados', report.summary.cancelled_count],
    [], ['Série diária'], ['Data', 'Produção realizada', 'Valor agendado', 'Ocupação (%)', 'Concluídos', 'Cancelados'],
    ...report.daily_series.map((day) => [day.date, day.production_realized, day.scheduled_value, day.occupancy_rate, day.completed_count, day.cancelled_count]),
    [], ['Serviços'], ['Serviço', 'Agendamentos', 'Concluídos', 'Cancelados', 'Produção', 'Participação (%)'],
    ...report.services.map((service) => [service.name, service.appointment_count, service.completed_count, service.cancelled_count, service.production_realized, service.demand_share]),
    [], ['Profissionais'], ['Profissional', 'Atendimentos', 'Concluídos', 'Cancelados', 'Produção', 'Repasse projetado', 'Ocupação (%)'],
    ...report.professionals.map((professional) => [professional.name, professional.appointment_count, professional.completed_count, professional.cancelled_count, professional.production_realized, professional.commission_amount, professional.occupancy_rate]),
  ];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(';')).join('\n')}`;
};

const ProgressBar = ({ value, tone = colors.brandPrimary }: { value: number; tone?: string }) => (
  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.max(0, Math.min(value, 100))}%`, backgroundColor: tone }]} /></View>
);

export const AdminReportsExperience = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tab?: string; period?: string; start?: string; end?: string;
    professionalId?: string; serviceId?: string; status?: string;
  }>();
  const urlState = parseAdminReportUrlState(params);
  const { width } = useWindowDimensions();
  const isWide = width >= layout.desktopBreakpoint;
  const { profile, signOut } = useAuth();
  const establishmentId = profile?.establishment_id;
  const { establishment } = useEstablishment(establishmentId);
  const { professionals: professionalOptions, services: serviceOptions } = useAdminReportFilterOptions(establishmentId);
  const [draftStart, setDraftStart] = useState(urlState.start);
  const [draftEnd, setDraftEnd] = useState(urlState.end);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [detail, setDetail] = useState<(AdminReportDetailSelection & { title: string }) | null>(null);

  useEffect(() => {
    setDraftStart(urlState.start);
    setDraftEnd(urlState.end);
  }, [urlState.start, urlState.end]);

  const updateUrl = (next: Partial<typeof urlState>) => {
    const merged = { ...urlState, ...next, filters: next.filters ?? urlState.filters };
    router.setParams(adminReportUrlParams(merged) as never);
  };
  const { report, loading, error, refresh } = useAdminReport({
    establishmentId,
    rangeStart: urlState.start,
    rangeEnd: urlState.end,
    enabled: Boolean(establishmentId),
    interactive: true,
    filters: urlState.filters,
  });
  const details = useAdminReportDetails({
    establishmentId,
    rangeStart: urlState.start,
    rangeEnd: urlState.end,
    filters: urlState.filters,
    selection: detail,
  });
  const currency = useMemo(() => currencyFormatter(establishment?.currency || 'BRL'), [establishment?.currency]);

  const choosePreset = (preset: AdminReportPreset) => {
    setRangeError(null);
    if (preset === 'custom') {
      updateUrl({ preset, start: urlState.start, end: urlState.end });
      return;
    }
    const range = rangeForReportPreset(preset);
    updateUrl({ preset, ...range });
  };
  const applyCustomRange = () => {
    const start = new Date(`${draftStart}T12:00:00`);
    const end = new Date(`${draftEnd}T12:00:00`);
    const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftStart) || !/^\d{4}-\d{2}-\d{2}$/.test(draftEnd) || !Number.isFinite(days) || days < 1 || days > 366) {
      setRangeError('Use datas válidas, com início anterior ao fim e no máximo 366 dias.');
      return;
    }
    setRangeError(null);
    updateUrl({ preset: 'custom', start: draftStart, end: draftEnd });
  };
  const exportCsv = async () => {
    if (!report) return;
    const csv = buildCsv(report, urlState.filters);
    const filename = `cutsync-relatorio-${report.period.start}-${report.period.end}.csv`;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    await Share.share({ title: filename, message: csv });
  };
  const openAppointments = (title: string, overrides: Partial<AdminReportDetailSelection> = {}) => setDetail({
    dimension: 'appointments', title, ...overrides,
  });
  const openAgenda = (date: string, professionalId: string) => {
    setDetail(null);
    router.push({ pathname: '/(admin)', params: { date: date.slice(0, 10), professionalId } } as never);
  };

  const summary = report?.summary;
  const previous = report?.previous_summary;
  const heatmapHours = Array.from({ length: 13 }, (_, index) => index + 8);
  const heatmapDays = [{ value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' }, { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' }];
  const heatmapMaximum = Math.max(1, ...(report?.hourly_demand || []).map((item) => item.appointment_count));
  const metricItems = summary && previous ? [
    { key: 'production', label: 'Produção realizada', value: currency.format(summary.production_realized), note: deltaLabel(summary.production_realized, previous.production_realized), icon: <Banknote color={colors.textMuted} size={16} />, onPress: () => openAppointments('Atendimentos concluídos', { status: 'completed' }) },
    { key: 'scheduled', label: 'Valor agendado', value: currency.format(summary.scheduled_value), note: `${summary.active_count} atendimentos ativos`, icon: <CalendarRange color={colors.textMuted} size={16} />, onPress: () => openAppointments('Atendimentos ativos') },
    { key: 'ticket', label: 'Ticket médio', value: currency.format(summary.average_ticket), note: deltaLabel(summary.average_ticket, previous.average_ticket), icon: <TicketCheck color={colors.textMuted} size={16} />, onPress: () => openAppointments('Base do ticket médio', { status: 'completed' }) },
    { key: 'occupancy', label: 'Ocupação real', value: `${summary.occupancy_rate.toFixed(1).replace('.', ',')}%`, note: deltaLabel(summary.occupancy_rate, previous.occupancy_rate), icon: <TrendingUp color={colors.textMuted} size={16} />, onPress: () => openAppointments('Atendimentos que ocupam a agenda') },
  ] : [];
  const contextLabel = `${urlState.start.split('-').reverse().join('/')} a ${urlState.end.split('-').reverse().join('/')} · filtros ativos preservados`;

  return (
    <AdminShell testID="admin-reports-screen" activeRoute="reports" shopName={establishment?.name || 'Sua barbearia'} userName={profile?.name} onSignOut={signOut}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <PageHeader
          testID="admin-reports-heading" eyebrow="Inteligência da operação" title="Relatórios"
          description="Investigue ocupação, demanda e produção sem confundir agendamento com dinheiro recebido."
          actions={<View style={styles.headerActions}>
            <AppButton label="Atualizar" testID="reports-refresh-button" variant="secondary" onPress={() => { void refresh(); }} loading={loading} icon={<RefreshCw color={colors.text} size={16} />} />
            <AppButton label="Exportar CSV" testID="reports-export-button" variant="admin" onPress={() => { void exportCsv(); }} disabled={!report} icon={<Download color={colors.white} size={16} />} />
          </View>}
        />

        <AppCard testID="reports-period-card" style={styles.periodCard}>
          <View style={styles.periodHeader}>
            <View style={styles.sectionCopy}><Text style={styles.cardTitle}>Período analisado</Text><Text style={styles.cardSubtitle}>{urlState.start.split('-').reverse().join('/')} a {urlState.end.split('-').reverse().join('/')}</Text></View>
            {report ? <StatusBadge testID="reports-generated-status" label={`${report.period.days} dias`} tone="info" /> : null}
          </View>
          <SegmentedControl testID="reports-period-selector" value={urlState.preset} options={periodOptions} onChange={choosePreset} />
          {urlState.preset === 'custom' ? <View style={styles.customRange}>
            <AppInput containerStyle={styles.rangeField} label="Data inicial" testID="reports-custom-start" value={draftStart} onChangeText={setDraftStart} placeholder="AAAA-MM-DD" autoCapitalize="none" />
            <AppInput containerStyle={styles.rangeField} label="Data final" testID="reports-custom-end" value={draftEnd} onChangeText={setDraftEnd} placeholder="AAAA-MM-DD" autoCapitalize="none" />
            <AppButton label="Aplicar período" testID="reports-custom-apply" variant="admin" onPress={applyCustomRange} style={styles.applyButton} />
          </View> : null}
          {rangeError ? <InlineNotice testID="reports-range-error" tone="danger" message={rangeError} /> : null}
        </AppCard>

        <ReportFilterBar filters={urlState.filters} professionals={professionalOptions} services={serviceOptions} onChange={(filters) => updateUrl({ filters })} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tabs}><SegmentedControl testID="reports-tabs" value={urlState.tab} options={tabOptions} onChange={(tab: AdminReportTab) => updateUrl({ tab })} /></View>
        </ScrollView>

        <InlineNotice testID="reports-accounting-notice" tone="info" title="Produção não é caixa" message="Os valores usam atendimentos e preços atuais dos serviços. Pagamentos, descontos, estornos, inadimplência e repasses efetivos ainda não são registrados." />
        {error ? <InlineNotice testID="reports-load-error" tone="danger" title="Relatório indisponível" message={error} action={<AppButton label="Tentar novamente" testID="reports-error-retry" variant="secondary" onPress={() => { void refresh(); }} />} /> : null}
        {loading && !report ? <View testID="reports-loading" style={styles.loading}><ActivityIndicator size="large" color={colors.brandPrimary} /><Text style={styles.loadingText}>Consolidando os dados da unidade...</Text></View> : null}

        {report && summary ? <>
          {summary.available_minutes === 0 ? <InlineNotice testID="reports-schedule-warning" tone="warning" title="Ocupação sem base" message="Configure os horários da unidade e as jornadas da equipe para calcular capacidade e ociosidade." /> : null}

          {urlState.tab === 'overview' ? <>
            <MetricStrip testID="reports-summary-metrics" items={metricItems} />
            <View style={[styles.grid, isWide && styles.gridWide]}>
              <AppCard testID="reports-production-card" style={styles.chartCard}>
                <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Produção ao longo do período</Text><Text style={styles.cardSubtitle}>Selecione um dia para abrir os registros concluídos</Text></View><StatusBadge testID="reports-completed-count" label={`${summary.completed_count} concluídos`} tone="success" /></View>
                <ReportChart testID="reports-production-chart" data={report.daily_series} mode="production" onSelectDay={(day) => openAppointments(`Produção de ${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}`, { day: day.date, status: 'completed' })} selectedDate={detail?.day} />
              </AppCard>
              <AppCard testID="reports-occupancy-card" style={styles.chartCard}>
                <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Ocupação da capacidade</Text><Text style={styles.cardSubtitle}>{formatMinutes(summary.occupied_minutes)} ocupadas de {formatMinutes(summary.available_minutes)}</Text></View><StatusBadge testID="reports-idle-time" label={`${formatMinutes(summary.idle_minutes)} livres`} tone="neutral" /></View>
                <ReportChart testID="reports-occupancy-chart" data={report.daily_series} mode="occupancy" onSelectDay={(day) => openAppointments(`Ocupação de ${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}`, { day: day.date })} selectedDate={detail?.day} />
              </AppCard>
            </View>
            <AppCard testID="reports-overview-alerts">
              <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Pontos de atenção</Text><Text style={styles.cardSubtitle}>Atalhos para investigar o período selecionado</Text></View></View>
              <View style={styles.alertGrid}>
                <Pressable accessibilityRole="button" onPress={() => openAppointments('Cancelamentos do período', { status: 'cancelled' })} style={styles.alertItem}><Text selectable style={styles.alertValue}>{summary.cancelled_count}</Text><Text style={styles.rankingMeta}>cancelamentos</Text></Pressable>
                <Pressable accessibilityRole="button" onPress={() => openAppointments('Atendimentos pendentes', { status: 'pending' })} style={styles.alertItem}><Text selectable style={styles.alertValue}>{summary.pending_count}</Text><Text style={styles.rankingMeta}>aguardando confirmação</Text></Pressable>
                <View style={styles.alertItem}><Text selectable style={styles.alertValue}>{formatMinutes(summary.idle_minutes)}</Text><Text style={styles.rankingMeta}>de capacidade livre</Text></View>
              </View>
            </AppCard>
          </> : null}

          {urlState.tab === 'operations' ? <>
            <MetricStrip testID="reports-operation-metrics" items={metricItems.slice(1)} />
            <AppCard testID="reports-daily-table" style={styles.tableCard}>
              <View style={styles.paddedHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Detalhamento diário</Text><Text style={styles.cardSubtitle}>Selecione uma linha para investigar os atendimentos</Text></View></View>
              <ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.dailyTable}>
                <View style={[styles.tableRow, styles.tableHeader]}><Text style={[styles.tableCell, styles.dateCell, styles.tableHeaderText]}>Data</Text><Text style={[styles.tableCell, styles.tableHeaderText]}>Produção</Text><Text style={[styles.tableCell, styles.tableHeaderText]}>Ocupação</Text><Text style={[styles.tableCell, styles.tableHeaderText]}>Concluídos</Text><Text style={[styles.tableCell, styles.tableHeaderText]}>Cancelados</Text></View>
                {report.daily_series.map((day) => <Pressable key={day.date} testID={`reports-daily-row-${day.date}`} accessibilityRole="button" onPress={() => openAppointments(`Atendimentos de ${new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}`, { day: day.date })} style={({ pressed }) => [styles.tableRow, pressed && styles.rowPressed]}><Text selectable style={[styles.tableCell, styles.dateCell]}>{new Date(`${day.date}T12:00:00`).toLocaleDateString('pt-BR')}</Text><Text selectable style={styles.tableCell}>{currency.format(day.production_realized)}</Text><Text selectable style={styles.tableCell}>{day.occupancy_rate.toFixed(1).replace('.', ',')}%</Text><Text selectable style={styles.tableCell}>{day.completed_count}</Text><Text selectable style={styles.tableCell}>{day.cancelled_count}</Text></Pressable>)}
              </View></ScrollView>
            </AppCard>
            <AppCard testID="reports-demand-heatmap" style={styles.heatmapCard}>
              <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Horários mais procurados</Text><Text style={styles.cardSubtitle}>Selecione uma célula para abrir os atendimentos daquele dia da semana e hora</Text></View></View>
              <ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.heatmap}>
                <View style={styles.heatmapRow}><View style={styles.heatmapDay} />{heatmapHours.map((hour) => <Text key={hour} style={styles.heatmapHour}>{String(hour).padStart(2, '0')}h</Text>)}</View>
                {heatmapDays.map((day) => <View key={day.value} style={styles.heatmapRow}><Text style={styles.heatmapDay}>{day.label}</Text>{heatmapHours.map((hour) => {
                  const count = report.hourly_demand.find((item) => item.day_of_week === day.value && item.hour === hour)?.appointment_count || 0;
                  const opacity = count === 0 ? 0.04 : 0.18 + (count / heatmapMaximum) * 0.72;
                  return <Pressable key={hour} disabled={!count} accessibilityRole="button" accessibilityLabel={`${day.label}, ${hour} horas: ${count} atendimentos`} onPress={() => openAppointments(`${day.label}, ${hour}h`, { dayOfWeek: day.value, hour })} style={({ pressed }) => [styles.heatmapCell, { backgroundColor: `rgba(49,92,155,${opacity})` }, pressed && styles.rowPressed]}><Text selectable style={[styles.heatmapCount, count > heatmapMaximum * 0.55 && styles.heatmapCountStrong]}>{count || '–'}</Text></Pressable>;
                })}</View>)}
              </View></ScrollView>
            </AppCard>
            <AppCard testID="reports-cancellations-card">
              <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Cancelamentos</Text><Text style={styles.cardSubtitle}>Motivos registrados no período</Text></View><StatusBadge testID="reports-cancellations-total" label={`${report.cancellations.total} cancelados`} tone={report.cancellations.total ? 'warning' : 'success'} /></View>
              {report.cancellations.by_reason.map((item) => <Pressable key={item.reason} accessibilityRole="button" onPress={() => openAppointments(`Cancelamentos: ${item.reason}`, { status: 'cancelled' })} style={styles.insightRow}><Text style={styles.insightLabel}>{item.reason}</Text><Text selectable style={styles.insightValue}>{item.count}</Text></Pressable>)}
              {!report.cancellations.total ? <Text style={styles.emptyCopy}>Nenhum cancelamento registrado.</Text> : null}
            </AppCard>
          </> : null}

          {urlState.tab === 'team' ? <AppCard testID="reports-team-card">
            <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Desempenho da equipe</Text><Text style={styles.cardSubtitle}>Selecione um profissional para aplicar o filtro global</Text></View><UsersRound color={colors.textMuted} size={20} /></View>
            <View style={styles.rankingList}>{report.professionals.map((professional) => <Pressable key={professional.id} testID={`reports-professional-${professional.id}`} accessibilityRole="button" onPress={() => updateUrl({ filters: { ...urlState.filters, professionalId: professional.id } })} style={({ pressed }) => [styles.rankingRow, pressed && styles.rowPressed]}><View style={styles.rankingHeader}><View style={styles.sectionCopy}><Text style={styles.rankingName}>{professional.name}</Text><Text style={styles.rankingMeta}>{professional.completed_count} concluídos · {professional.cancelled_count} cancelados</Text></View><View style={styles.alignEnd}><Text selectable style={styles.rankingValue}>{currency.format(professional.production_realized)}</Text><Text style={styles.commissionText}>{currency.format(professional.commission_amount)} repasse projetado</Text></View></View><ProgressBar value={professional.occupancy_rate} tone={colors.info} /><Text style={styles.rankingMeta}>{professional.occupancy_rate.toFixed(1).replace('.', ',')}% de ocupação · {professional.production_share.toFixed(1).replace('.', ',')}% da produção</Text></Pressable>)}</View>
            {!report.professionals.length ? <EmptyState testID="reports-team-empty" title="Nenhum profissional encontrado" description="Revise os filtros ou vincule profissionais ativos à unidade." /> : null}
          </AppCard> : null}

          {urlState.tab === 'services' ? <AppCard testID="reports-services-card">
            <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Serviços que puxam a demanda</Text><Text style={styles.cardSubtitle}>Selecione um serviço para aplicar o filtro global</Text></View></View>
            <View style={styles.rankingList}>{report.services.filter((item) => item.appointment_count > 0).map((service) => <Pressable key={service.id} testID={`reports-service-${service.id}`} accessibilityRole="button" onPress={() => updateUrl({ filters: { ...urlState.filters, serviceId: service.id } })} style={({ pressed }) => [styles.rankingRow, pressed && styles.rowPressed]}><View style={styles.rankingHeader}><Text style={styles.rankingName}>{service.name}</Text><Text selectable style={styles.rankingValue}>{currency.format(service.production_realized)}</Text></View><ProgressBar value={service.demand_share} /><Text style={styles.rankingMeta}>{service.appointment_count} agend. · {service.demand_share.toFixed(1).replace('.', ',')}% da demanda · ticket {currency.format(service.average_ticket)} · {service.average_duration_minutes} min médios · {service.cancelled_count} cancelados</Text></Pressable>)}</View>
            {!report.services.some((item) => item.appointment_count > 0) ? <EmptyState testID="reports-services-empty" title="Sem demanda no período" description="Revise os filtros ou selecione outro período." /> : null}
          </AppCard> : null}

          {urlState.tab === 'clients' ? <>
            <AppCard testID="reports-clients-card">
              <View style={styles.cardHeader}><View style={styles.sectionCopy}><Text style={styles.cardTitle}>Recorrência de clientes</Text><Text style={styles.cardSubtitle}>Dados agregados de clientes identificados com atendimento concluído</Text></View><Repeat2 color={colors.success} size={20} /></View>
              <View style={styles.clientMetrics}><View style={styles.clientMetric}><Text selectable style={styles.clientValue}>{report.clients.new_clients}</Text><Text style={styles.clientLabel}>novos</Text></View><View style={styles.clientMetric}><Text selectable style={styles.clientValue}>{report.clients.returning_clients}</Text><Text style={styles.clientLabel}>recorrentes</Text></View><View style={styles.clientMetric}><Text selectable style={styles.clientValue}>{report.clients.return_rate.toFixed(1).replace('.', ',')}%</Text><Text style={styles.clientLabel}>retorno</Text></View></View>
              <InlineNotice testID="reports-walk-in-note" tone="info" message={`${report.clients.walk_in_appointments} atendimentos concluídos sem cliente identificado não entram na taxa de retorno.`} />
              <View style={styles.privacyAction}><View style={styles.sectionCopy}><Text style={styles.rankingName}>Lista operacional restrita</Text><Text style={styles.rankingMeta}>Exibe somente nome minimizado, visitas e próxima reserva. A abertura será auditada.</Text></View><AppButton testID="reports-open-client-list" label="Abrir lista" variant="secondary" onPress={() => setDetail({ dimension: 'clients', title: 'Clientes do período' })} /></View>
            </AppCard>
          </> : null}
        </> : null}
      </ScrollView>

      <ReportDetailPanel
        visible={Boolean(detail)} title={detail?.title || 'Detalhamento'} context={contextLabel}
        items={details.items} loading={details.loading} error={details.error} hasMore={details.hasMore} currency={currency}
        onClose={() => setDetail(null)} onLoadMore={() => { void details.loadMore(); }} onRetry={() => { void details.retry(); }} onOpenAgenda={openAgenda}
      />
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: layout.operationalMax, alignSelf: 'center', padding: 24, paddingTop: 30, paddingBottom: 120, gap: 20 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  periodCard: { gap: 16 },
  periodHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  customRange: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 10 },
  rangeField: { flex: 1, minWidth: 190 },
  applyButton: { minHeight: 50 },
  tabs: { minWidth: 680, width: '100%' },
  loading: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { ...typeScale.body, color: colors.textMuted },
  grid: { gap: 16 },
  gridWide: { flexDirection: 'row', alignItems: 'stretch' },
  chartCard: { flex: 1, minWidth: 0, padding: 0, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingBottom: 14 },
  paddedHeader: { flexDirection: 'row', padding: 16, paddingBottom: 14 },
  sectionCopy: { flex: 1, minWidth: 0 },
  cardTitle: { ...typeScale.cardTitle, color: colors.text },
  cardSubtitle: { ...typeScale.small, color: colors.textMuted, marginTop: 3 },
  tableCard: { padding: 0, overflow: 'hidden' },
  dailyTable: { minWidth: 760 },
  tableRow: { flexDirection: 'row', minHeight: 44, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingHorizontal: 16 },
  tableHeader: { backgroundColor: colors.canvasSoft, borderTopWidth: 0 },
  tableCell: { width: 140, ...typeScale.small, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  dateCell: { width: 120 },
  tableHeaderText: { fontFamily: typography.bodyStrong, color: colors.text },
  heatmapCard: { overflow: 'hidden' },
  heatmap: { minWidth: 720, gap: 5 },
  heatmapRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  heatmapDay: { width: 40, color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  heatmapHour: { width: 46, textAlign: 'center', color: colors.textMuted, fontFamily: typography.body, fontSize: 11 },
  heatmapCell: { width: 46, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm },
  heatmapCount: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11, fontVariant: ['tabular-nums'] },
  heatmapCountStrong: { color: colors.white },
  rankingList: { gap: 0 },
  rankingRow: { gap: 8, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.borderSubtle, borderRadius: radii.sm, paddingHorizontal: 8 },
  rankingHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  rankingName: { ...typeScale.bodyStrong, color: colors.text },
  rankingValue: { ...typeScale.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  rankingMeta: { ...typeScale.small, color: colors.textMuted },
  progressTrack: { height: 6, overflow: 'hidden', borderRadius: radii.pill, backgroundColor: colors.canvasSubtle },
  progressFill: { height: '100%', borderRadius: radii.pill },
  alignEnd: { alignItems: 'flex-end' },
  commissionText: { ...typeScale.small, color: colors.success, marginTop: 3 },
  insightRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  insightLabel: { ...typeScale.body, color: colors.textSecondary },
  insightValue: { ...typeScale.bodyStrong, color: colors.text, fontVariant: ['tabular-nums'] },
  emptyCopy: { ...typeScale.small, color: colors.textMuted, paddingVertical: 18 },
  clientMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingVertical: 12 },
  clientMetric: { flex: 1, minWidth: 100, padding: 14, borderRadius: radii.md, backgroundColor: colors.canvasSoft },
  clientValue: { ...typeScale.sectionTitle, color: colors.text, fontVariant: ['tabular-nums'] },
  clientLabel: { ...typeScale.small, color: colors.textMuted, marginTop: 3 },
  privacyAction: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, paddingTop: 16 },
  alertGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  alertItem: { flex: 1, minWidth: 150, padding: 14, borderRadius: radii.md, backgroundColor: colors.canvasSoft },
  alertValue: { ...typeScale.cardTitle, color: colors.text, fontVariant: ['tabular-nums'] },
  rowPressed: { opacity: 0.72, backgroundColor: colors.canvasSoft },
});
