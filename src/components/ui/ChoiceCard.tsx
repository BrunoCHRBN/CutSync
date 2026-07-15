import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radii, typography } from '../../theme/tokens';

interface ChoiceCardProps {
  title: string;
  subtitle?: string;
  meta?: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  activeColor?: string;
  activeForegroundColor?: string;
}

export const ChoiceCard = ({
  title,
  subtitle,
  meta,
  selected,
  onPress,
  testID,
  icon,
  style,
  activeColor = colors.brand,
  activeForegroundColor = colors.ink,
}: ChoiceCardProps) => (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityState={{ selected }}
    onPress={onPress}
    style={({ pressed }) => [
      styles.card,
      selected && [styles.selected, { borderColor: activeColor }],
      pressed && styles.pressed,
      style,
    ]}
  >
    <View style={[styles.icon, selected && styles.iconSelected, selected && { backgroundColor: activeColor }]}>
      {selected ? <Check color={activeForegroundColor} size={17} strokeWidth={3} /> : icon}
    </View>
    <View style={styles.copy}>
      <Text numberOfLines={2} style={styles.title}>{title}</Text>
      {!!subtitle && <Text numberOfLines={2} style={styles.subtitle}>{subtitle}</Text>}
    </View>
    {!!meta && <Text style={[styles.meta, selected && styles.metaSelected, selected && { color: activeColor }]}>{meta}</Text>}
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: radii.md,
    padding: 14,
    justifyContent: 'space-between',
    gap: 10,
  },
  selected: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
  },
  hovered: { borderColor: colors.borderStrong, transform: [{ translateY: -2 }] },
  pressed: { transform: [{ scale: 0.97 }] },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfacePressed,
  },
  iconSelected: { backgroundColor: colors.brand },
  copy: { flex: 1 },
  title: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, lineHeight: 17 },
  subtitle: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 },
  meta: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 11 },
  metaSelected: { color: colors.brand },
});