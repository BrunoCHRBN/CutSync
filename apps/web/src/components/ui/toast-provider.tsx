import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../theme/tokens';

type ToastTone = 'success' | 'danger' | 'info' | 'warning';

type ToastItem = {
  id: string;
  title: string;
  message?: string;
  tone: ToastTone;
};

type ToastInput = {
  title: string;
  message?: string;
  tone?: ToastTone;
};

type ToastContextValue = {
  pushToast: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { background: string; border: string; text: string }> = {
  success: { background: colors.successSoft, border: colors.success, text: colors.success },
  danger: { background: colors.dangerSoft, border: colors.danger, text: colors.danger },
  info: { background: colors.infoSoft, border: colors.info, text: colors.info },
  warning: { background: colors.warningSoft, border: colors.warning, text: colors.warning },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const pushToast = useCallback((toast: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((current) => [...current, { id, title: toast.title, message: toast.message, tone: toast.tone || 'info' }]);
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
          const palette = toneStyles[item.tone];
          return (
            <Pressable
              key={item.id}
              accessibilityRole="alert"
              onPress={() => setItems((current) => current.filter((entry) => entry.id !== item.id))}
              style={[styles.toast, { backgroundColor: palette.background, borderColor: palette.border }]}
              testID={`toast-${item.tone}`}
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

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    left: spacing.lg,
    gap: spacing.xs,
    zIndex: 100,
    elevation: 100,
  },
  toast: {
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    ...elevations.overlay,
  },
  title: { ...typeScale.bodyStrong },
  message: { ...typeScale.small, color: colors.textSecondary, marginTop: 2 },
});
