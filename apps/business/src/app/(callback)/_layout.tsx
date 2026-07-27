import Stack from 'expo-router/stack';

export default function BusinessCallbackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="confirm-email" />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}
