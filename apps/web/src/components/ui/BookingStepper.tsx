import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, radii, typography } from '../../theme/tokens';

export interface BookingStepItem {
  step: number;
  label: string;
  done: boolean;
}

export const BookingStepper = ({
  items,
  currentStep,
  onStepPress,
  accentColor = colors.brandPrimary,
  accentSoft = colors.brandSecondarySoft,
}: {
  items: BookingStepItem[];
  currentStep: number;
  onStepPress: (step: number) => void;
  accentColor?: string;
  accentSoft?: string;
}) => (
  <View accessibilityRole="tablist" style={styles.root}>
    {items.map((item, index) => {
      const active = item.step === currentStep;
      const enabled = item.step <= currentStep || item.done;
      const highlighted = item.done || active;
      return (
        <View key={item.step} style={styles.segment}>
          {index > 0 ? (
            <View
              style={[
                styles.connector,
                highlighted && { backgroundColor: accentColor },
              ]}
            />
          ) : null}
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={`Passo ${item.step} de ${items.length}: ${item.label}`}
            accessibilityState={{ selected: active, disabled: !enabled }}
            disabled={!enabled}
            onPress={() => onStepPress(item.step)}
            style={({ pressed, hovered }) => [
              styles.step,
              active && { backgroundColor: accentSoft },
              item.done && styles.done,
              hovered && enabled && { borderWidth: 1, borderColor: accentColor },
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.circle,
                highlighted && { backgroundColor: accentColor },
              ]}
            >
              {item.done && !active ? (
                <Check size={13} color={colors.white} />
              ) : (
                <Text style={[styles.number, highlighted && styles.numberActive]}>
                  {item.step}
                </Text>
              )}
            </View>
            <Text numberOfLines={1} style={[styles.label, highlighted && styles.labelActive]}>
              {item.label}
            </Text>
          </Pressable>
        </View>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  connector: { width: 14, height: 2, backgroundColor: colors.borderStrong },
  step: { flex: 1, minHeight: layout.touchTarget, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.md },
  done: { opacity: 1 },
  pressed: { opacity: 0.72 },
  circle: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfacePressed },
  number: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10 },
  numberActive: { color: colors.white },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10 },
  labelActive: { color: colors.text },
});
