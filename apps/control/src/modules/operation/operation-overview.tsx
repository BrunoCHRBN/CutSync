import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ControlNotice } from '@/components/control-ui';
import { ExecutiveDashboard } from '@/components/executive-dashboard';
import { RequireControlPermission } from '@/components/require-control-permission';
import { SectionPage } from '@/components/section-page';
import {
  ControlExecutiveApiError,
  createControlMetricRange,
  listControlMetricScopes,
  loadControlExecutiveDashboard,
  type ControlExecutiveDashboard,
  type ControlMetricRangeDays,
  type ControlMetricScopeOption,
} from '@/services/control-executive';
import { colors } from '@/theme/tokens';

const globalScope: ControlMetricScopeOption = {
  type: 'global',
  id: null,
  parentId: null,
  label: 'Toda a plataforma',
};

function sameScope(left: ControlMetricScopeOption, right: ControlMetricScopeOption) {
  return left.type === right.type && left.id === right.id;
}

export function OperationOverviewScreen() {
  const [snapshot, setSnapshot] = useState<ControlExecutiveDashboard | null>(null);
  const [scopes, setScopes] = useState<ControlMetricScopeOption[]>([globalScope]);
  const [selectedScope, setSelectedScope] = useState<ControlMetricScopeOption>(globalScope);
  const [rangeDays, setRangeDays] = useState<ControlMetricRangeDays>(28);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError('');
    setSnapshot(null);

    try {
      const availableScopes = await listControlMetricScopes();
      const requestedScope = availableScopes.find((scope) => sameScope(scope, selectedScope))
        ?? availableScopes.find((scope) => scope.type === 'global')
        ?? globalScope;
      const range = createControlMetricRange(rangeDays);
      const nextSnapshot = await loadControlExecutiveDashboard({
        start: range.start,
        end: range.end,
        scopeType: requestedScope.type,
        scopeId: requestedScope.id,
      });

      if (requestId !== requestIdRef.current) return;
      setScopes(availableScopes.length ? availableScopes : [globalScope]);
      if (!sameScope(requestedScope, selectedScope)) {
        setSelectedScope(requestedScope);
      }
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return;
      setError(
        loadError instanceof ControlExecutiveApiError
          ? loadError.message
          : 'Não foi possível carregar os indicadores agora.',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [rangeDays, selectedScope]);

  useFocusEffect(useCallback(() => {
    void loadDashboard();
    return () => {
      requestIdRef.current += 1;
    };
  }, [loadDashboard]));

  return (
    <RequireControlPermission permission="control.dashboard.read">
      <SectionPage
        eyebrow="VISÃO EXECUTIVA"
        title="Cockpit da operação"
        description="Resultados, motores e riscos consolidados por plataforma, organização ou estabelecimento. Valores monetários e latência em ms permanecem fora desta visão quando a fonte ainda não existe."
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.loadingText}>Reconciliando indicadores...</Text>
          </View>
        ) : null}

        {error ? (
          <ControlNotice
            action={{ label: 'Tentar novamente', onPress: () => { void loadDashboard(); } }}
            message={error}
            title="Indicadores indisponíveis"
            tone="danger"
          />
        ) : null}

        {snapshot ? (
          <ExecutiveDashboard
            onRangeChange={setRangeDays}
            onScopeChange={setSelectedScope}
            rangeDays={rangeDays}
            scopes={scopes}
            selectedScope={selectedScope}
            snapshot={snapshot}
          />
        ) : null}
      </SectionPage>
    </RequireControlPermission>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: '#78827b', fontSize: 12, lineHeight: 17 },
});
