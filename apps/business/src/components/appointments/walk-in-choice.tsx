import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { businessTheme } from '@/theme/business-theme';

interface WalkInChoiceProps {
  testID: string;
  label: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
}

export function WalkInChoice({
  testID,
  label,
  meta,
  selected,
  onPress,
}: WalkInChoiceProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.copy}>
        <Text selectable style={styles.label}>{label}</Text>
        {meta ? <Text selectable style={styles.meta}>{meta}</Text> : null}
      </View>
      <View style={[styles.indicator, selected && styles.indicatorSelected]}>
        {selected ? <Check color={businessTheme.colors.canvas} size={15} strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: businessTheme.spacing.md,
    borderWidth: 1,
    borderColor: businessTheme.colors.border,
    borderRadius: businessTheme.radii.md,
    paddingHorizontal: businessTheme.spacing.md,
    paddingVertical: businessTheme.spacing.sm,
    backgroundColor: businessTheme.colors.surface,
  },
  selected: { borderColor: businessTheme.colors.accent, backgroundColor: businessTheme.colors.accentSoft },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.99 }] },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  label: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  meta: { ...businessTheme.typography.caption, color: businessTheme.colors.textSoft },
  indicator: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: 12,
  },
  indicatorSelected: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentStrong },
});