import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { useControlLive } from '@/hooks/use-control-live';
import type {
  ControlLiveAppointments,
  ControlLiveEstablishments,
  ControlLiveSupport,
} from '@/services/control-live';

const connectionLabels = {
  connecting: 'Conectando',
  connected: 'Ao vivo',
  reconnecting: 'Reconectando',
  stale: 'Dados desatualizados',
} as const;

function MetricCard({
  label,
  value,
  detail,
  tone = 'default',
  compact,
}: {
  label: string;
  value: number;
  detail: string;
  tone?: 'default' | 'warning' | 'danger';
  compact: boolean;
}) {
  return (
    <View style={[
      styles.metricCard,
      compact && styles.metricCardCompact,
      tone === 'warning' && styles.warningCard,
      tone === 'danger' && styles.dangerCard,
    ]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[
        styles.metricValue,
        tone === 'warning' && styles.warningText,
        tone === 'danger' && styles.dangerText,
      ]}>
        {value.toLocaleString('pt-BR')}
      </Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function AgendaSection({
  appointments,
  compact,
}: {
  appointments: ControlLiveAppointments;
  compact: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>AGENDA GLOBAL</Text>
        <Text style={styles.sectionTitle}>Operação de hoje</Text>
      </View>
      <View style={styles.metrics}>
        <MetricCard compact={compact} label="Agendamentos" value={appointments.todayTotal} detail="Total no dia corrente" />
        <MetricCard compact={compact} label="Próximos 60 min" value={appointments.next60Minutes} detail="Pendentes ou confirmados" />
        <MetricCard compact={compact} label="Pendentes" value={appointments.pending} detail="Aguardando confirmação" />
        <MetricCard compact={compact} label="Confirmados" value={appointments.confirmed} detail="Prontos para atendimento" />
        <MetricCard compact={compact} label="Concluídos" value={appointments.completed} detail="Finalizados hoje" />
        <MetricCard compact={compact} label="Cancelados" value={appointments.cancelled} detail="Cancelamentos no dia" tone={appointments.cancelled > 0 ? 'warning' : 'default'} />
      </View>
    </View>
  );
}

function EstablishmentSection({
  establishments,
  compact,
}: {
  establishments: ControlLiveEstablishments;
  compact: boolean;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>PLATAFORMA</Text>
        <Text style={styles.sectionTitle}>Estabelecimentos</Text>
      </View>
      <View style={styles.metrics}>
        <MetricCard compact={compact} label="Ativos" value={establishments.active} detail="Operação liberada" />
        <MetricCard
          compact={compact}
          label="Solicitações pendentes"
          value={establishments.pendingRequests}
          detail="Aguardando análise"
          tone={establishments.pendingRequests > 0 ? 'warning' : 'default'}
        />
      </View>
    </View>
  );
}

function SupportSection({
  support,
  compact,
}: {
  support: ControlLiveSupport | null;
  compact: boolean;
}) {
  if (!support) {
    return (
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Equipe de suporte não vinculada</Text>
        <Text style={styles.metricDetail}>
          Vincule seu acesso à equipe SUPORTE_GERAL na página Suporte para visualizar a operação.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadingRow}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionEyebrow}>SUPORTE OFICIAL</Text>
          <Text style={styles.sectionTitle}>Fila e sincronização</Text>
        </View>
        <View style={styles.runtimeRow}>
          <Text style={[styles.runtimeBadge, support.runtimeEnabled && styles.runtimeBadgeActive]}>
            Módulo {support.runtimeEnabled ? 'ativo' : 'pausado'}
          </Text>
          <Text style={[styles.runtimeBadge, support.syncEnabled && styles.runtimeBadgeActive]}>
            Sync {support.syncEnabled ? 'ativo' : 'pausado'}
          </Text>
        </View>
      </View>
      <View style={styles.metrics}>
        <MetricCard compact={compact} label="Fila aberta" value={support.openQueue} detail="Novos e em atendimento" />
        <MetricCard compact={compact} label="Aguardando usuário" value={support.waitingUser} detail="Resposta solicitada" />
        <MetricCard compact={compact} label="Críticos" value={support.criticalOpen} detail="Incidentes não resolvidos" tone={support.criticalOpen > 0 ? 'danger' : 'default'} />
        <MetricCard compact={compact} label="Risco de SLA" value={support.slaAtRisk} detail="Vencido ou a menos de 1 hora" tone={support.slaAtRisk > 0 ? 'warning' : 'default'} />
        <MetricCard compact={compact} label="Falhas de sync" value={support.syncFailed} detail="Exigem investigação" tone={support.syncFailed > 0 ? 'danger' : 'default'} />
        <MetricCard
          compact={compact}
          label="Operações pendentes"
          value={support.pendingOperations}
          detail={support.oldestPendingMinutes === null
            ? 'Nenhuma operação aguardando'
            : `Mais antiga há ${support.oldestPendingMinutes} min`}
          tone={support.oldestPendingMinutes !== null && support.oldestPendingMinutes >= 5 ? 'warning' : 'default'}
        />
      </View>
    </View>
  );
}

export function LiveOperations() {
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const {
    snapshot,
    connectionState,
    loading,
    refreshing,
    error,
    refresh,
  } = useControlLive();

  return (
    <View style={styles.content}>
      <View style={styles.toolbar}>
        <View>
          <Text style={[
            styles.connectionBadge,
            connectionState === 'connected' && styles.connectionBadgeConnected,
            connectionState === 'stale' && styles.connectionBadgeStale,
          ]}>
            {connectionLabels[connectionState]}
          </Text>
          <Text style={styles.timestamp}>
            {snapshot
              ? `Snapshot de ${new Date(snapshot.generatedAt).toLocaleString('pt-BR')} · ${snapshot.timezone}`
              : 'Aguardando o primeiro snapshot autoritativo'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={refreshing}
          onPress={() => { void refresh(true); }}
          style={[styles.refreshButton, refreshing && styles.disabled]}
        >
          {refreshing ? <ActivityIndicator color="#ffffff" size="small" /> : null}
          <Text style={styles.refreshButtonText}>
            {refreshing ? 'Atualizando' : 'Atualizar agora'}
          </Text>
        </Pressable>
      </View>

      {loading && !snapshot ? (
        <View style={styles.loadingLine}>
          <ActivityIndicator color="#173d2b" />
          <Text style={styles.metricDetail}>Carregando a operação...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          <Text style={styles.metricDetail}>
            {snapshot
              ? 'O último snapshot válido foi preservado.'
              : 'Use a atualização manual para tentar novamente.'}
          </Text>
        </View>
      ) : null}

      {snapshot ? (
        <>
          <AgendaSection appointments={snapshot.appointments} compact={compact} />
          <EstablishmentSection establishments={snapshot.establishments} compact={compact} />
          <SupportSection support={snapshot.support} compact={compact} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', gap: 26 },
  toolbar: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  connectionBadge: {
    alignSelf: 'flex-start',
    color: '#785d2e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  connectionBadgeConnected: { color: '#247047' },
  connectionBadgeStale: { color: '#a33a31' },
  timestamp: { marginTop: 5, color: '#6c786f', fontSize: 12 },
  refreshButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#173d2b',
  },
  refreshButtonText: { color: '#ffffff', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  loadingLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorCard: {
    gap: 5,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6c8c4',
    borderRadius: 12,
    backgroundColor: '#fff7f6',
  },
  errorText: { color: '#913c34', fontWeight: '700' },
  section: { width: '100%', gap: 14 },
  sectionHeading: { gap: 4 },
  sectionHeadingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: { color: '#347452', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  sectionTitle: { color: '#17231c', fontSize: 20, fontWeight: '800' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: {
    width: 190,
    minHeight: 126,
    gap: 7,
    padding: 17,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  metricCardCompact: { width: '100%' },
  warningCard: { borderColor: '#e6d4ad', backgroundColor: '#fffbf1' },
  dangerCard: { borderColor: '#e6c8c4', backgroundColor: '#fff7f6' },
  metricLabel: { color: '#526158', fontSize: 12, fontWeight: '700' },
  metricValue: { color: '#173d2b', fontSize: 29, fontWeight: '800' },
  metricDetail: { color: '#748078', fontSize: 12, lineHeight: 18 },
  warningText: { color: '#8b641d' },
  dangerText: { color: '#a33a31' },
  runtimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  runtimeBadge: {
    color: '#8b5a53',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f8e8e5',
  },
  runtimeBadgeActive: { color: '#286c47', backgroundColor: '#e4f2e9' },
  infoCard: {
    gap: 6,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  infoTitle: { color: '#17231c', fontSize: 16, fontWeight: '800' },
});
