import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SectionPage } from '@/components/section-page';
import { parseControlDashboard, type ControlDashboardSnapshot } from '@/services/control-dashboard';
import { supabase } from '@/services/supabase';

interface MetricCardProps {
  label: string;
  value: number;
  detail: string;
}

function MetricCard({ label, value, detail }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value.toLocaleString('pt-BR')}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

export default function DashboardRoute() {
  const [snapshot, setSnapshot] = useState<ControlDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await (supabase.rpc as any)('get_control_dashboard');
    if (result.error) {
      setError('Não foi possível carregar os indicadores agora.');
      setLoading(false);
      return;
    }

    try {
      setSnapshot(parseControlDashboard(result.data));
    } catch {
      setError('Os indicadores retornaram em um formato inesperado.');
    }
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void loadDashboard();
  }, [loadDashboard]));

  return (
    <SectionPage
      eyebrow="VISÃO EXECUTIVA"
      title="Operação CutSync"
      description="Indicadores operacionais consolidados. Valores monetários permanecerão fora desta visão até existirem snapshots históricos auditáveis."
    >
      {loading ? (
        <View style={styles.loading}><ActivityIndicator color="#173d2b" /><Text style={styles.metricDetail}>Atualizando indicadores...</Text></View>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => { void loadDashboard(); }} style={styles.retry}>
            <Text style={styles.retryText}>Tentar novamente</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <>
          <View style={styles.metrics}>
            <MetricCard label="Agendamentos hoje" value={snapshot.appointmentsToday} detail="Agenda global no dia corrente" />
            <MetricCard label="Atendimentos concluídos" value={snapshot.completedLast28Days} detail="Últimos 28 dias" />
            <MetricCard label="Cancelamentos" value={snapshot.cancelledLast28Days} detail="Últimos 28 dias" />
            <MetricCard label="Estabelecimentos ativos" value={snapshot.activeEstablishments} detail="Status operacional ativo" />
            <MetricCard label="Solicitações pendentes" value={snapshot.pendingEstablishmentRequests} detail="Fila de novos estabelecimentos" />
          </View>
          <Text style={styles.timestamp}>
            Atualizado em {new Date(snapshot.generatedAt).toLocaleString('pt-BR')} · {snapshot.timezone}
          </Text>
        </>
      ) : null}

      <View style={styles.quickLinks}>
        <Link href="/live" asChild>
          <Pressable style={styles.quickLink}>
            <Text style={styles.quickTitle}>Acompanhar operação</Text>
            <Text style={styles.quickDescription}>Abrir a preparação do painel em tempo real.</Text>
          </Pressable>
        </Link>
        <Link href="/support" asChild>
          <Pressable style={styles.quickLink}>
            <Text style={styles.quickTitle}>Central de suporte</Text>
            <Text style={styles.quickDescription}>Acompanhar a projeção operacional sincronizada com o Jira.</Text>
          </Pressable>
        </Link>
      </View>
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  metricCard: {
    width: 220,
    minHeight: 138,
    gap: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 15,
    backgroundColor: '#ffffff',
  },
  metricLabel: { color: '#526158', fontSize: 13, fontWeight: '700' },
  metricValue: { color: '#173d2b', fontSize: 32, fontWeight: '800' },
  metricDetail: { color: '#78827b', fontSize: 12, lineHeight: 17 },
  timestamp: { color: '#7b857e', fontSize: 12 },
  errorCard: {
    maxWidth: 620,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e6c8c4',
    borderRadius: 12,
    backgroundColor: '#fff7f6',
  },
  errorText: { flex: 1, color: '#8d3831' },
  retry: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#173d2b' },
  retryText: { color: '#ffffff', fontWeight: '700' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  quickLink: {
    width: 300,
    gap: 5,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 13,
    backgroundColor: '#f9faf8',
  },
  quickTitle: { color: '#17231c', fontWeight: '700' },
  quickDescription: { color: '#667269', fontSize: 12, lineHeight: 18 },
});
