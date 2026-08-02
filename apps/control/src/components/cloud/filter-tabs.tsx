import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { cloudTheme } from '@/theme/cloud-components';

export type FilterTab<T extends string> = {
  id: T;
  label: string;
};

export function FilterTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: FilterTab<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [
              styles.tab,
              selected && styles.tabSelected,
              pressed && styles.tabPressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: cloudTheme.spacing.xs },
  tab: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  tabSelected: {
    borderColor: cloudTheme.colors.brand,
    backgroundColor: cloudTheme.colors.brandSoft,
  },
  tabPressed: { opacity: 0.85 },
  label: { ...cloudTheme.type.button, color: cloudTheme.colors.textSecondary },
  labelSelected: { color: cloudTheme.colors.brand },
});
