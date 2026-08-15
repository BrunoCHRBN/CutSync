import { CheckCircle2 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { businessTheme } from '@/theme/business-theme';

export function BusinessToast({ message, testID }: { message: string; testID: string }) {
  return (
    <View testID={testID} accessibilityLiveRegion="assertive" style={styles.toast}>
      <CheckCircle2 color={businessTheme.colors.success} size={22} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: businessTheme.spacing.lg,
    right: businessTheme.spacing.lg,
    bottom: businessTheme.spacing.lg,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: businessTheme.spacing.sm,
    borderWidth: 1,
    borderColor: '#295336',
    borderRadius: businessTheme.radii.sm,
    paddingHorizontal: businessTheme.spacing.md,
    backgroundColor: businessTheme.colors.canvasRaised,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  message: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text, flex: 1 },
});