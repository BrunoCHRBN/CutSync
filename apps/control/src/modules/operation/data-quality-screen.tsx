import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DataQualityDashboard } from '@/components/data-quality-dashboard';
import { RequireControlPermission } from '@/components/require-control-permission';
import { useControlAuth } from '@/contexts/control-auth-context';
import {
  OpsHeader,
  OpsPage,
  OpsSecondaryButton,
} from '@/modules/operation/ops-console';
import {
  ControlAnalyticsHealthApiError,
  loadControlAnalyticsHealth,
  requestControlAnalyticsReprocess,
  type ControlAnalyticsHealth,
} from '@/services/control-analytics-health';
import { cloudTheme } from '@/theme/cloud-components';

function formatRelative(iso: string, now = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 45) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

export function DataQualityScreen() {
  const { context } = useControlAuth();
  const [health, setHealth] = useState<ControlAnalyticsHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const requestIdRef = useRef(0);

  const loadHealth = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const nextHealth = await loadControlAnalyticsHealth();
      if (requestId !== requestIdRef.current) return;
      setHealth(nextHealth);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(
        loadError instanceof ControlAnalyticsHealthApiError
          ? loadError.message
          : 'Não foi possível carregar a saúde analítica.',
      );
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadHealth();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadHealth]));

  const reprocess = useCallback(async (input: {
    start: string;
    end: string;
    reason: string;
  }) => {
    setReprocessing(true);
    setError('');
    setSuccess('');
    try {
      const request = await requestControlAnalyticsReprocess(input);
      setSuccess(
        `Solicitação ${request.id.slice(0, 8).toUpperCase()} adicionada à fila para ${request.start} a ${request.end}.`,
      );
      await loadHealth();
    } finally {
      setReprocessing(false);
    }
  }, [loadHealth]);

  return (
    <RequireControlPermission permission="control.dashboard.read">
      <OpsPage>
        <OpsHeader
          kicker="OPERAÇÃO / SAÚDE DOS DADOS"
          title="Confiabilidade"
          description="Cobertura, continuidade de snapshots, comparações históricas e processamentos. Sem métricas simuladas."
          meta={health ? (
            <Text style={styles.meta}>
              Atualizado {formatRelative(health.generatedAt)}
            </Text>
          ) : undefined}
          actions={(
            <OpsSecondaryButton
              label={loading ? 'Atualizando…' : 'Atualizar'}
              disabled={loading}
              onPress={() => { void loadHealth(); }}
            />
          )}
        />

        {loading && !health ? (
          <View style={styles.loading}>
            <ActivityIndicator color={cloudTheme.colors.brand} />
            <Text style={styles.loadingText}>Verificando fontes e snapshots...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{error}</Text>
            <OpsSecondaryButton label="Tentar novamente" onPress={() => { void loadHealth(); }} />
          </View>
        ) : null}

        {success ? (
          <Text style={styles.success}>{success}</Text>
        ) : null}

        {health ? (
          <DataQualityDashboard
            canReprocess={context?.role === 'SaaS_Owner'}
            health={health}
            onReprocess={reprocess}
            reprocessing={reprocessing}
          />
        ) : null}
      </OpsPage>
    </RequireControlPermission>
  );
}

const styles = StyleSheet.create({
  meta: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: { color: cloudTheme.colors.textSecondary, fontSize: 13 },
  errorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: cloudTheme.colors.danger,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.dangerSoft,
  },
  errorText: { flex: 1, minWidth: 200, color: cloudTheme.colors.danger },
  success: { color: '#1F6B45', fontSize: 13, fontWeight: '600' },
});
