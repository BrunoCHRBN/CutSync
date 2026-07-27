import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface ControlStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}

export function ControlState({
  title = 'CutSync Control',
  message,
  actionLabel,
  onAction,
  loading = false,
}: ControlStateProps) {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        {loading ? <ActivityIndicator size="large" color="#173d2b" /> : null}
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" style={styles.button} onPress={onAction}>
            <Text style={styles.buttonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f3f5f1',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    gap: 14,
    padding: 28,
    borderWidth: 1,
    borderColor: '#dce2dc',
    borderRadius: 18,
    backgroundColor: '#ffffff',
  },
  title: { fontSize: 26, fontWeight: '700', color: '#17231c', textAlign: 'center' },
  message: { color: '#667269', lineHeight: 21, textAlign: 'center' },
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#173d2b',
  },
  buttonText: { color: '#ffffff', fontWeight: '700' },
});
