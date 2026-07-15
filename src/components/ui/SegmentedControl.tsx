import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
    backgroundColor: '#ECEDEF',
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  option: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, paddingHorizontal: 10 },
  optionActive: {
    backgroundColor: colors.surface,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    }),
  },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11 },
  labelActive: { color: colors.text },
  pressed: { transform: [{ scale: 0.97 }] },
});