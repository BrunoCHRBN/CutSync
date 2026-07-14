import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  options: Segment<T>[];
  onChange: (value: T) => void;
  testID: string;
}

export const SegmentedControl = <T extends string>({ value, options, onChange, testID }: SegmentedControlProps<T>) => (
  <View testID={testID} style={styles.container}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <Pressable
          key={option.value}
          testID={`${testID}-${option.value}`}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => [styles.option, active && styles.optionActive, pressed && styles.pressed]}
        >
          <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  option: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: 10 },
  optionActive: { backgroundColor: colors.brand },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11 },
  labelActive: { color: colors.ink },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
});