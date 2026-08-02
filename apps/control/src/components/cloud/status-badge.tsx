import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cloudTheme, cloudToneStyles, type CloudTone } from '@/theme/cloud-components';

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: CloudTone;
}) {
  const palette = cloudToneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.xxs,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.sm,
  },
  label: {
    ...cloudTheme.type.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
