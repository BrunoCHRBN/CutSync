import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { businessTheme } from '@/theme/business-theme';

interface BusinessFloatingActionProps {
  testID: string;
  label: string;
  onPress: () => void;
}

export function BusinessFloatingAction({
  testID,
  label,
  onPress,
}: BusinessFloatingActionProps) {
  const press = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={press}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Plus color={businessTheme.colors.canvas} size={22} strokeWidth={2.6} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: businessTheme.spacing.lg,
    bottom: businessTheme.spacing.lg,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: businessTheme.spacing.xs,
    borderRadius: businessTheme.radii.pill,
    paddingHorizontal: businessTheme.spacing.lg,
    backgroundColor: businessTheme.colors.accentStrong,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  pressed: { opacity: businessTheme.opacity.pressed, transform: [{ scale: 0.96 }] },
  label: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.canvas },
});