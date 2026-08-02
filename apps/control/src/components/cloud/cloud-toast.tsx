import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cloudTheme, cloudToneStyles, type CloudTone } from '@/theme/cloud-components';

type ToastItem = {
  id: string;
  title: string;
  message?: string;
  tone: Exclude<CloudTone, 'neutral'>;
};

type ToastContextValue = {
  pushToast: (toast: Omit<ToastItem, 'id'>) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function CloudToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((current) => [...current, { ...toast, id }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View pointerEvents="box-none" style={styles.host}>
        {items.map((item) => {
          const palette = cloudToneStyles[item.tone];
          return (
            <Pressable
              key={item.id}
              accessibilityRole="alert"
              onPress={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              style={[styles.toast, { backgroundColor: palette.background, borderColor: palette.border }]}
            >
              <Text style={[styles.title, { color: palette.text }]}>{item.title}</Text>
              {item.message ? <Text style={styles.message}>{item.message}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </ToastContext.Provider>
  );
}

export function useCloudToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useCloudToast must be used within CloudToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: cloudTheme.spacing.lg,
    bottom: cloudTheme.spacing.lg,
    left: cloudTheme.spacing.lg,
    gap: cloudTheme.spacing.xs,
    zIndex: 50,
  },
  toast: {
    padding: cloudTheme.spacing.md,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.md,
  },
  title: { ...cloudTheme.type.smallStrong },
  message: { ...cloudTheme.type.small, color: cloudTheme.colors.textSecondary, marginTop: 2 },
});
