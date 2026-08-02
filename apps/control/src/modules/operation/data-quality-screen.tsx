import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/cloud/page-header';
import { ControlNotice } from '@/components/control-ui';
import { DataQualityDashboard } from '@/components/data-quality-dashboard';
import { RequireControlPermission } from '@/components/require-control-permission';
import { useControlAuth } from '@/contexts/control-auth-context';
import {
  ControlAnalyticsHealthApiError,
  loadControlAnalyticsHealth,
  requestControlAnalyticsReprocess,
  type ControlAnalyticsHealth,
} from '@/services/control-analytics-health';
import { cloudTheme } from '@/theme/cloud-components';
import { controlColors, controlSpacing, controlType } from '@/theme/tokens';

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
      <View style={styles.page}>
        <PageHeader
          eyebrow="CONFIABILIDADE"
          title="Saúde dos dados"
          description="Cobertura integral, dados reconciliados, dias ausentes, fila pendente, cobertura por fonte, comparações históricas, snapshots e processamentos recentes."
          badge="DADOS REAIS"
          badgeTone="success"
        />

        {loading && !health ? (
          <View style={styles.loading}>
            <ActivityIndicator color={controlColors.brand} />
            <Text style={styles.loadingText}>Verificando fontes e snapshots...</Text>
          </View>
        ) : null}

        {error ? (
          <ControlNotice
            action={{ label: 'Tentar novamente', onPress: () => { void loadHealth(); } }}
            message={error}
            title="Saúde analítica indisponível"
            tone="danger"
          />
        ) : null}

        {success ? (
          <ControlNotice
            message={success}
            title="Reprocessamento solicitado"
            tone="success"
          />
        ) : null}

        {health ? (
          <DataQualityDashboard
            canReprocess={context?.role === 'SaaS_Owner'}
            health={health}
            onReprocess={reprocess}
            reprocessing={reprocessing}
          />
        ) : null}
      </View>
    </RequireControlPermission>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: cloudTheme.layout.contentMax,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
    padding: cloudTheme.layout.contentPadding,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: controlSpacing.sm,
  },
  loadingText: { ...controlType.small, color: controlColors.textSecondary },
});
