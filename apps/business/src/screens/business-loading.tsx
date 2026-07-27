import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { businessTheme } from '@/theme/business-theme';

export function BusinessLoadingScreen({ message = 'Preparando sua operação…' }: { message?: string }) {
  return (
    <View testID="business-loading-screen" style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.mark}>
        <Text style={styles.markText}>B</Text>
      </View>
      <ActivityIndicator color={businessTheme.colors.accent} />
      <Text selectable style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: businessTheme.spacing.md,
    padding: businessTheme.spacing.xl,
    backgroundColor: businessTheme.colors.canvas,
  },
  mark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: businessTheme.radii.md,
    backgroundColor: businessTheme.colors.accentStrong,
  },
  markText: { color: businessTheme.colors.canvas, fontSize: 20, fontWeight: '900' },
  message: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft },
});
