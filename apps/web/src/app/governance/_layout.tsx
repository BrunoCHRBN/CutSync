import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { GovernanceAuthProvider, useGovernanceAuth } from '../../contexts/governance-auth-context';
import { GovernanceLogin } from '../../components/governance/governance-login';
import { GovernanceShell } from '../../components/governance/governance-shell';
import { ScreenBackground } from '../../components/ui/ScreenBackground';
import { colors } from '../../theme/tokens';

function GovernanceGate() {
  const { loading, profile } = useGovernanceAuth();
  if (loading) {
    return (
      <ScreenBackground testID="governance-loading-screen">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </ScreenBackground>
    );
  }
  if (!profile) return <GovernanceLogin />;

  return (
    <GovernanceShell>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="establishments/index" />
        <Stack.Screen name="establishments/[id]" />
        <Stack.Screen name="audit" />
        <Stack.Screen name="knowledge/index" />
        <Stack.Screen name="knowledge/new" />
        <Stack.Screen name="knowledge/[topicId]/index" />
        <Stack.Screen name="knowledge/[topicId]/edit" />
      </Stack>
    </GovernanceShell>
  );
}

export default function GovernanceLayout() {
  return (
    <GovernanceAuthProvider>
      <GovernanceGate />
    </GovernanceAuthProvider>
  );
}
