import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ModuleCard } from '@/components/cloud/module-card';
import { useControlAuth } from '@/contexts/control-auth-context';
import { isCloudFlagEnabled } from '@/features/cloud/cloud-feature-flags';
import { modulesVisibleTo } from '@/navigation/module-registry';
import { cloudTheme } from '@/theme/cloud-components';

export function CentralHub() {
  const { can } = useControlAuth();
  const { width } = useWindowDimensions();
  const modules = modulesVisibleTo(can);
  const centralEnabled = isCloudFlagEnabled('centralEnabled');
  const narrow = width < cloudTheme.layout.tabletBreakpoint;

  if (!centralEnabled) {
    return (
      <View style={styles.page}>
        <Text style={styles.disabled}>Central temporariamente indisponível.</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={[styles.row, narrow && styles.rowWrap]}>
        {modules.map((module) => (
          <View
            key={module.id}
            style={[styles.slot, narrow ? styles.slotNarrow : styles.slotWide]}
          >
            <ModuleCard
              href={module.href}
              label={module.label}
              description=""
              accent={module.accent}
              compact
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    width: '100%',
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.layout.contentPadding,
    paddingVertical: cloudTheme.spacing.xxl,
  },
  row: {
    width: '100%',
    maxWidth: 1120,
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: cloudTheme.spacing.lg,
  },
  rowWrap: {
    flexWrap: 'wrap',
  },
  slot: {
    minWidth: 0,
  },
  slotWide: {
    flex: 1,
    maxWidth: 260,
  },
  slotNarrow: {
    width: '100%',
    maxWidth: 420,
  },
  disabled: {
    ...cloudTheme.type.body,
    color: cloudTheme.colors.textSecondary,
  },
});
