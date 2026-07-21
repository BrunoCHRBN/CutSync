import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton } from '../components/ui/AppButton';
import { colors, typography } from '../theme/tokens';

export default function WelcomeLandingPage() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CutSync</Text>
      <Text style={styles.subtitle}>Plataforma de Agendamento</Text>
      <AppButton
        label="Acessar Painel"
        onPress={() => router.push('/(auth)/login' as any)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: typography.display,
    color: colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: typography.body,
    color: colors.textSecondary,
  },
});
