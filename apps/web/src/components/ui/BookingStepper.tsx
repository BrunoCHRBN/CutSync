import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, radii, typography } from '../../theme/tokens';

export interface BookingStepItem {
  step: number;
  label: string;
  done: boolean;
}

export const BookingStepper = ({ items, currentStep, onStepPress }: {
  items: BookingStepItem[];
  currentStep: number;
  onStepPress: (step: number) => void;
}) => (
  <View accessibilityRole="tablist" style={styles.root}>
    {items.map((item, index) => {
      const active = item.step === currentStep;
      const enabled = item.step <= currentStep || item.done;
      return (
        <View key={item.step} style={styles.segment}>
          {index > 0 ? <View style={[styles.connector, (item.done || active) && styles.connectorDone]} /> : null}
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel={`Passo ${item.step} de ${items.length}: ${item.label}`}
            accessibilityState={{ selected: active, disabled: !enabled }}
            disabled={!enabled}
            onPress={() => onStepPress(item.step)}
            style={({ pressed, hovered }) => [
              styles.step,
              active && styles.active,
              item.done && styles.done,
              hovered && enabled && styles.focused,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.circle, (active || item.done) && styles.circleActive]}>
              {item.done && !active ? <Check size={13} color={colors.white} /> : <Text style={[styles.number, (active || item.done) && styles.numberActive]}>{item.step}</Text>}
            </View>
            <Text numberOfLines={1} style={[styles.label, (active || item.done) && styles.labelActive]}>{item.label}</Text>
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
  connectorDone: { backgroundColor: colors.brandPrimary },
  step: { flex: 1, minHeight: layout.touchTarget, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.md },
  active: { backgroundColor: colors.brandSecondarySoft },
  done: { opacity: 1 },
  focused: { borderWidth: 1, borderColor: colors.brandPrimary },
  pressed: { opacity: 0.72 },
  circle: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.surfacePressed },
  circleActive: { backgroundColor: colors.brandPrimary },
  number: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10 },
  numberActive: { color: colors.white },
  label: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 10 },
  labelActive: { color: colors.text },
});
