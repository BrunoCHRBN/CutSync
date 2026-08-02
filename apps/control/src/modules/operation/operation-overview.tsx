import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ExecutiveDashboard } from '@/components/executive-dashboard';
import { RequireControlPermission } from '@/components/require-control-permission';
import {
  OpsHeader,
  OpsPage,
  OpsSecondaryButton,
} from '@/modules/operation/ops-console';
import {
  ControlExecutiveApiError,
  createControlMetricRange,
  listControlMetricScopes,
  loadControlExecutiveDashboard,
  type ControlExecutiveDashboard,
  type ControlMetricRangeDays,
  type ControlMetricScopeOption,
} from '@/services/control-executive';
import { cloudTheme } from '@/theme/cloud-components';

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
      setSnapshot(null);
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
      <OpsPage>
        <OpsHeader
          kicker="OPERAÇÃO / VISÃO GERAL"
          title="Cockpit da operação"
          description="Estado consolidado da plataforma, operação e qualidade dos dados. Valores monetários e latência em ms permanecem fora desta visão quando a fonte ainda não existe."
        />

        {loading && !snapshot ? (
          <View style={styles.loading}>
            <ActivityIndicator color={cloudTheme.colors.brand} />
            <Text style={styles.loadingText}>Reconciliando indicadores...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{error}</Text>
            <OpsSecondaryButton label="Tentar novamente" onPress={() => { void loadDashboard(); }} />
          </View>
        ) : null}

        {snapshot ? (
          <ExecutiveDashboard
            onRangeChange={setRangeDays}
            onRefresh={() => { void loadDashboard(); }}
            onScopeChange={setSelectedScope}
            rangeDays={rangeDays}
            refreshing={loading}
            scopes={scopes}
            selectedScope={selectedScope}
            snapshot={snapshot}
          />
        ) : null}
      </OpsPage>
    </RequireControlPermission>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
});
