import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cloudTheme } from '@/theme/cloud-components';

export function SupportFilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string }[];
  onChange: (value: T | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value
    ? (options.find((option) => option.value === value)?.label ?? value)
    : 'Todos';

  return (
    <View style={styles.menu}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[styles.trigger, value !== null && styles.triggerActive]}
      >
        <Text style={styles.triggerLabel}>{label}</Text>
        <Text style={styles.triggerValue} numberOfLines={1}>{selectedLabel}</Text>
      </Pressable>
      {open ? (
        <View style={styles.dropdown}>
          <Pressable
            accessibilityRole="menuitem"
            onPress={() => { onChange(null); setOpen(false); }}
            style={[styles.option, value === null && styles.optionActive]}
          >
            <Text style={[styles.optionText, value === null && styles.optionTextActive]}>Todos</Text>
          </Pressable>
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="menuitem"
              onPress={() => { onChange(option.value); setOpen(false); }}
              style={[styles.option, value === option.value && styles.optionActive]}
            >
              <Text style={[
                styles.optionText,
                value === option.value && styles.optionTextActive,
              ]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'relative', zIndex: 30 },
  trigger: {
    minHeight: 44,
    minWidth: 118,
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  triggerActive: { borderColor: '#27523b', backgroundColor: '#f3f8f4' },
  triggerLabel: { color: cloudTheme.colors.textMuted, fontSize: 10, fontWeight: '800' },
  triggerValue: { color: cloudTheme.colors.text, fontSize: 12, fontWeight: '700', maxWidth: 140 },
  dropdown: {
    position: 'absolute',
    top: 48,
    left: 0,
    minWidth: 180,
    maxHeight: 280,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
    zIndex: 40,
    elevation: 4,
    overflow: 'hidden',
  },
  option: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1ee',
  },
  optionActive: { backgroundColor: '#f0f8f3' },
  optionText: { color: cloudTheme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  optionTextActive: { color: cloudTheme.colors.text, fontWeight: '800' },
});
