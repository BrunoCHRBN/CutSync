import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, layout, radii, typography } from '../../theme/tokens';

export const ClientFilterChip = ({ label, active = false, removable = false, onPress, testID }: {
  label: string;
  active?: boolean;
  removable?: boolean;
  onPress: () => void;
  testID?: string;
}) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    accessibilityLabel={`${label}${removable ? ', remover filtro' : ''}`}
    testID={testID}
    onPress={onPress}
    style={({ pressed, hovered }) => [
      styles.base,
      active && styles.active,
      hovered && styles.interactive,
      pressed && styles.pressed,
    ]}
  >
    <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    {removable ? <X size={14} color={active ? colors.white : colors.textSecondary} /> : null}
  </Pressable>
);

const styles = StyleSheet.create({
  base: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 15,
  },
  active: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  interactive: { borderColor: colors.brandPrimary },
  pressed: { opacity: 0.76 },
  label: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  activeLabel: { color: colors.white },
});
