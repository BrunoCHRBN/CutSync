import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { cloudTheme } from '@/theme/cloud-components';

export function ContextualSearch({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.wrap}>
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={cloudTheme.colors.textMuted}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  input: {
    minHeight: cloudTheme.layout.touchTarget,
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
    color: cloudTheme.colors.text,
    fontSize: 14,
  },
});
