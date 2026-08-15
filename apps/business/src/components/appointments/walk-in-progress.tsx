import { Pressable, StyleSheet, Text, View } from 'react-native';

import { businessTheme } from '@/theme/business-theme';

interface WalkInProgressProps {
  currentStep: number;
  labels: readonly string[];
  onStepPress: (step: number) => void;
}

export function WalkInProgress({ currentStep, labels, onStepPress }: WalkInProgressProps) {
  return (
    <View testID="business-walk-in-progress" accessibilityRole="tablist" style={styles.track}>
      {labels.map((label, index) => {
        const complete = index < currentStep;
        const selected = index === currentStep;
        return (
          <Pressable
            key={label}
            testID={`business-walk-in-step-${index + 1}`}
            accessibilityRole="tab"
            accessibilityLabel={`Etapa ${index + 1}: ${label}`}
            accessibilityState={{ selected, disabled: index > currentStep }}
            disabled={index > currentStep}
            onPress={() => onStepPress(index)}
            style={styles.step}
          >
            <View style={[styles.dot, (complete || selected) && styles.dotActive]}>
              <Text style={[styles.number, (complete || selected) && styles.numberActive]}>{index + 1}</Text>
            </View>
            <Text numberOfLines={1} style={[styles.label, selected && styles.labelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'flex-start', gap: businessTheme.spacing.xs },
  step: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  dot: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: 14,
    backgroundColor: businessTheme.colors.surface,
  },
  dotActive: { borderColor: businessTheme.colors.accentStrong, backgroundColor: businessTheme.colors.accentStrong },
  number: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  numberActive: { color: businessTheme.colors.canvas },
  label: { color: businessTheme.colors.textMuted, fontSize: 9, fontWeight: '700' },
  labelActive: { color: businessTheme.colors.accentStrong },
});