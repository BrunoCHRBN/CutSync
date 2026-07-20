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
  activeColor?: string;
}

export const SegmentedControl = <T extends string>({ value, options, onChange, testID, activeColor = colors.text }: SegmentedControlProps<T>) => (
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
          <Text testID={`${testID}-${option.value}-label`} style={[styles.label, active && styles.labelActive, active && { color: activeColor }]}>{option.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.canvasSubtle,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  option: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: 10 },
  optionActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 12 },
  labelActive: { color: colors.text },
  pressed: { transform: [{ scale: 0.97 }] },
});
