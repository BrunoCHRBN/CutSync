import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ModuleCard } from '@/components/cloud/module-card';
import { useControlAuth } from '@/contexts/control-auth-context';
import { isCloudFlagEnabled } from '@/features/cloud/cloud-feature-flags';
import {
  CLOUD_AREA_LAUNCHER_COPY,
  launcherAreasVisibleTo,
} from '@/navigation/cloud-area-registry';
import {
  formatAlertAreaBreakdown,
  loadCloudActionableAlerts,
  type CloudAlertSummary,
} from '@/modules/central/central-alerts';
import { cloudTheme } from '@/theme/cloud-components';

export function CentralHub() {
  const { can } = useControlAuth();
  const { width } = useWindowDimensions();
  const areas = launcherAreasVisibleTo(can);
  const centralEnabled = isCloudFlagEnabled('centralEnabled');
  const [alerts, setAlerts] = useState<CloudAlertSummary | null>(null);
  const [loadingAlerts, setLoadingAlerts] = useState(true);

  const refreshAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      setAlerts(await loadCloudActionableAlerts(can));
    } catch {
      setAlerts({
        total: 0,
        byArea: {},
        alerts: [],
        error: 'Não foi possível atualizar os avisos.',
      });
    } finally {
      setLoadingAlerts(false);
    }
  }, [can]);

  useEffect(() => {
    void refreshAlerts();
  }, [refreshAlerts]);

  const columns = width >= 1100 ? 4 : width >= 720 ? 2 : 1;

  if (!centralEnabled) {
    return (
      <View style={styles.page}>
        <Text style={styles.disabled}>Central temporariamente indisponível.</Text>
      </View>
    );
  }

  const breakdown = alerts ? formatAlertAreaBreakdown(alerts.byArea) : '';
  const showAlertStrip = Boolean(alerts && alerts.total > 0);
  const primaryAlertHref = alerts?.alerts[0]?.href;

  return (
    <View style={styles.page}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>CENTRAL</Text>
          <Text style={styles.title}>Onde você quer trabalhar?</Text>
          <Text style={styles.description}>Selecione uma área para continuar.</Text>
        </View>

        {showAlertStrip ? (
          <View style={styles.alertStrip} accessibilityRole="summary">
            <View style={styles.alertCopy}>
              <Text style={styles.alertTitle}>
                {alerts!.total} aviso{alerts!.total === 1 ? '' : 's'} exigem atenção
              </Text>
              {breakdown ? <Text style={styles.alertDetail}>{breakdown}</Text> : null}
            </View>
            {primaryAlertHref ? (
              <Link href={primaryAlertHref as never} asChild>
                <Pressable accessibilityRole="link" style={styles.alertLink}>
                  <Text style={styles.alertLinkText}>Ver avisos →</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : alerts?.error ? (
          <View style={styles.alertError}>
            <Text style={styles.alertErrorText}>{alerts.error}</Text>
            <Pressable onPress={() => { void refreshAlerts(); }}>
              <Text style={styles.alertLinkText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : loadingAlerts ? (
          <Text style={styles.quietMeta}>Atualizando avisos…</Text>
        ) : null}

        <View
          style={[
            styles.grid,
            columns === 1 && styles.gridOne,
            columns === 2 && styles.gridTwo,
          ]}
        >
          {areas.map((area) => (
            <View
              key={area.id}
              style={[
                styles.slot,
                columns === 4 && styles.slotFour,
                columns === 2 && styles.slotTwo,
                columns === 1 && styles.slotOne,
              ]}
            >
              <ModuleCard
                href={area.href}
                label={area.label}
                description={CLOUD_AREA_LAUNCHER_COPY[area.id as keyof typeof CLOUD_AREA_LAUNCHER_COPY]}
                accent={area.accent === 'brand' ? 'green' : area.accent}
                alertCount={alerts?.byArea[area.id as keyof typeof alerts.byArea] ?? 0}
                compact
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    width: '100%',
    minHeight: '100%',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingHorizontal: cloudTheme.spacing.xxl,
    paddingTop: 72,
    paddingBottom: cloudTheme.spacing.xxl,
    backgroundColor: cloudTheme.colors.canvas,
  },
  content: {
    width: '100%',
    maxWidth: 1320,
    alignSelf: 'center',
    gap: cloudTheme.spacing.xl,
  },
  header: { gap: cloudTheme.spacing.xs, maxWidth: 720 },
  eyebrow: {
    ...cloudTheme.type.eyebrow,
    color: cloudTheme.colors.accent,
  },
  title: {
    ...cloudTheme.type.pageTitle,
    color: cloudTheme.colors.text,
  },
  description: {
    ...cloudTheme.type.body,
    color: cloudTheme.colors.textSecondary,
  },
  alertStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingVertical: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.warning,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.warningSoft,
  },
  alertCopy: { flex: 1, minWidth: 220, gap: 2 },
  alertTitle: {
    ...cloudTheme.type.bodyStrong,
    color: cloudTheme.colors.text,
  },
  alertDetail: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textSecondary,
  },
  alertLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  alertLinkText: {
    ...cloudTheme.type.smallStrong,
    color: cloudTheme.colors.accent,
  },
  alertError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.md,
  },
  alertErrorText: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textSecondary,
  },
  quietMeta: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.textMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.md,
  },
  gridOne: { flexDirection: 'column' },
  gridTwo: {},
  slot: { minWidth: 0 },
  slotFour: { flexBasis: '23%', flexGrow: 1 },
  slotTwo: { flexBasis: '47%', flexGrow: 1 },
  slotOne: { width: '100%' },
  disabled: {
    ...cloudTheme.type.body,
    color: cloudTheme.colors.textSecondary,
  },
});
