import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const ClientSwitch = ({ label, description, value, disabled = false, onValueChange, testID }: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) => (
  <Pressable
    accessibilityRole="switch"
    accessibilityState={{ checked: value, disabled }}
    accessibilityLabel={label}
    disabled={disabled}
    testID={testID}
    onPress={() => onValueChange(!value)}
    style={({ pressed, hovered }) => [
      styles.row,
      hovered && styles.focused,
      pressed && styles.pressed,
      disabled && styles.disabled,
    ]}
  >
    <View style={styles.copy}>
      <Text style={styles.label}>{label}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
    <View style={[styles.track, value && styles.trackActive]}>
      <View style={[styles.thumb, value && styles.thumbActive]} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  row: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: radii.md,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  focused: { backgroundColor: colors.canvasSoft },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.5 },
  copy: { flex: 1 },
  label: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13 },
  description: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  track: { width: 48, height: 28, borderRadius: radii.pill, backgroundColor: colors.borderStrong, padding: 3 },
  trackActive: { backgroundColor: colors.brandPrimary },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  thumbActive: { transform: [{ translateX: 20 }] },
});
