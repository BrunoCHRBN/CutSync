import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { initialsOf, readableForeground } from '../../theme/color';
import { colors, typography } from '../../theme/tokens';

export const EstablishmentMedia = ({ name, uri, color, category, style, testID }: {
  name: string;
  uri?: string | null;
  color?: string | null;
  category?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) => {
  const backgroundColor = color || colors.brandPrimary;
  if (uri) {
    return <Image testID={testID} source={{ uri }} style={style as any} contentFit="cover" transition={120} />;
  }
  const foreground = readableForeground(backgroundColor);
  return (
    <View testID={testID} style={[styles.fallback, { backgroundColor }, style]}>
      <Text style={[styles.initials, { color: foreground }]}>{initialsOf(name)}</Text>
      {category ? <Text style={[styles.category, { color: foreground }]}>{category}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 7, overflow: 'hidden' },
  initials: { fontFamily: typography.display, fontSize: 34, letterSpacing: -1 },
  category: { fontFamily: typography.bodyStrong, fontSize: 12, opacity: 0.82, textTransform: 'uppercase', letterSpacing: 1.1 },
});
