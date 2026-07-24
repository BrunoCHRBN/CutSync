import { products } from '@cutsync/brand';
import { getForbiddenInputMessage } from '@cutsync/validation';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { performClientHaptic } from '@/features/experience/client-haptics';
import { clientTheme } from '@/theme/client-theme';

export const settingsColors = {
  background: clientTheme.colors.canvas,
  card: clientTheme.colors.surface,
  text: clientTheme.colors.ink,
  secondary: clientTheme.colors.inkSoft,
  muted: clientTheme.colors.inkMuted,
  border: clientTheme.colors.border,
  accent: clientTheme.colors.forest,
  accentSoft: clientTheme.colors.forestSoft,
};

export function ClientSettingsPage({ testID, description, children }: PropsWithChildren<{
  testID: string;
  description: string;
}>) {
  return (
    <ScrollView
      testID={testID}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.pageContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <Text style={styles.pageDescription}>{description}</Text>
      {children}
    </ScrollView>
  );
}

export function SettingsCard({ children }: PropsWithChildren) {
  return (
    <Animated.View
      entering={FadeInUp.duration(clientTheme.motion.standard)}
      style={styles.card}
    >
      {children}
    </Animated.View>
  );
}

export function SettingsSectionLabel({ children }: PropsWithChildren) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function SettingsNotice({ message, tone = 'danger', testID }: {
  message: string;
  tone?: 'danger' | 'success' | 'neutral';
  testID?: string;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(clientTheme.motion.fast)}
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[
        styles.notice,
        tone === 'success' ? styles.noticeSuccess : tone === 'neutral' ? styles.noticeNeutral : styles.noticeDanger,
      ]}
    >
      <Text
        selectable
        style={[
          styles.noticeText,
          tone === 'success'
            ? styles.noticeSuccessText
            : tone === 'neutral'
              ? styles.noticeNeutralText
              : styles.noticeDangerText,
        ]}
      >
        {message}
      </Text>
    </Animated.View>
  );
}

interface SettingsFieldProps extends TextInputProps {
  label: string;
  testID: string;
  onUnsafeInput: (message: string | null) => void;
  helper?: string;
  transformValue?: (value: string) => string;
}

export function SettingsField({
  label,
  testID,
  onUnsafeInput,
  onChangeText,
  helper,
  transformValue,
  ...props
}: SettingsFieldProps) {
  const handleChange = (nextValue: string) => {
    const unsafeMessage = getForbiddenInputMessage(nextValue);
    if (unsafeMessage) {
      onUnsafeInput(unsafeMessage);
      return;
    }
    onUnsafeInput(null);
    onChangeText?.(transformValue ? transformValue(nextValue) : nextValue);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        testID={testID}
        accessibilityLabel={label}
        onChangeText={handleChange}
        placeholderTextColor={settingsColors.muted}
        style={[styles.input, props.editable === false && styles.inputReadOnly]}
      />
      {helper && <Text style={styles.helper}>{helper}</Text>}
    </View>
  );
}

export function SettingsButton({ label, onPress, loading, disabled, tone = 'primary', testID }: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
  testID?: string;
}) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={() => {
        void performClientHaptic(tone === 'danger' ? 'warning' : 'selection');
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'danger' && styles.buttonDanger,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'primary' ? '#FFFFFF' : settingsColors.accent} />
      ) : (
        <Text style={[
          styles.buttonText,
          tone !== 'primary' && styles.buttonSecondaryText,
          tone === 'danger' && styles.buttonDangerText,
        ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function SettingsMenuRow({ title, subtitle, onPress, testID }: {
  title: string;
  subtitle: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => {
        void performClientHaptic('selection');
        onPress();
      }}
      style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
    >
      <View style={styles.menuCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function SettingsSwitchRow({ title, subtitle, value, onValueChange, disabled, testID }: {
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (nextValue: boolean) => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <View style={[styles.switchRow, disabled && styles.switchRowDisabled]}>
      <View style={styles.switchCopy}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        testID={testID}
        accessibilityLabel={title}
        disabled={disabled}
        onValueChange={(nextValue) => {
          void performClientHaptic(nextValue ? 'toggle-on' : 'toggle-off');
          onValueChange(nextValue);
        }}
        thumbColor="#FFFFFF"
        trackColor={{ false: '#D3CDBB', true: settingsColors.accent }}
        value={value}
      />
    </View>
  );
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CS';
  return (parts[0][0] + (parts.length > 1 ? parts.at(-1)?.[0] ?? '' : '')).toUpperCase();
};

export function ClientAvatar({ name, avatarUrl, size = 76 }: {
  name: string;
  avatarUrl: string | null;
  size?: number;
}) {
  const radius = Math.round(size * 0.36);
  if (avatarUrl) {
    return (
      <Image
        accessibilityLabel={'Foto de perfil de ' + name}
        contentFit="cover"
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#E7E1CE' }}
        transition={180}
      />
    );
  }

  return (
    <View
      accessibilityLabel={'Iniciais de ' + name}
      style={[styles.avatarFallback, { width: size, height: size, borderRadius: radius }]}
    >
      <Text style={[styles.avatarInitials, { fontSize: Math.round(size * 0.34) }]}>{getInitials(name)}</Text>
    </View>
  );
}

export function ClientBrand() {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}>
        <Text style={styles.brandMarkText}>C</Text>
      </View>
      <Text style={styles.brandName}>{products.client.name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: settingsColors.background },
  pageContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 48,
    gap: 16,
  },
  pageDescription: { color: settingsColors.secondary, fontSize: 15, lineHeight: 23, paddingHorizontal: 2 },
  card: {
    backgroundColor: settingsColors.card,
    borderRadius: 26,
    padding: 20,
    gap: 16,
    borderCurve: 'continuous',
    boxShadow: clientTheme.shadows.card,
  },
  sectionLabel: {
    color: settingsColors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  notice: { borderWidth: 1, borderRadius: 16, padding: 14, borderCurve: 'continuous' },
  noticeDanger: { backgroundColor: '#FCE9E7', borderColor: '#F2C8C2' },
  noticeSuccess: { backgroundColor: '#E9F3EA', borderColor: '#C7DFC9' },
  noticeNeutral: { backgroundColor: '#F7EFD5', borderColor: '#E7D89F' },
  noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  noticeDangerText: { color: '#8E2F26' },
  noticeSuccessText: { color: '#2D633A' },
  noticeNeutralText: { color: '#6A5620' },
  field: { gap: 8 },
  fieldLabel: { color: settingsColors.text, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: clientTheme.sizing.control,
    borderWidth: 1,
    borderColor: settingsColors.border,
    borderRadius: clientTheme.radii.md,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    color: settingsColors.text,
    backgroundColor: '#FCFAF3',
    fontSize: 16,
  },
  inputReadOnly: { color: settingsColors.muted, backgroundColor: '#F3EFE4' },
  helper: { color: settingsColors.muted, fontSize: 11, lineHeight: 16 },
  button: {
    minHeight: clientTheme.sizing.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: settingsColors.accent,
    paddingHorizontal: 20,
  },
  buttonSecondary: { backgroundColor: settingsColors.card, borderWidth: 1, borderColor: settingsColors.border },
  buttonDanger: { backgroundColor: '#FFF7F5', borderWidth: 1, borderColor: '#E6C3BD' },
  buttonDisabled: { opacity: clientTheme.opacity.disabled },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  buttonSecondaryText: { color: settingsColors.accent },
  buttonDangerText: { color: '#8E2F26' },
  menuRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  menuRowPressed: { opacity: clientTheme.opacity.pressed },
  menuCopy: { flex: 1, gap: 4 },
  menuTitle: { color: settingsColors.text, fontSize: 15, fontWeight: '700' },
  menuSubtitle: { color: settingsColors.secondary, fontSize: 12, lineHeight: 18 },
  chevron: { color: settingsColors.muted, fontSize: 28, fontWeight: '300' },
  switchRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  switchRowDisabled: { opacity: 0.52 },
  switchCopy: { flex: 1, gap: 4 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: settingsColors.accent },
  avatarInitials: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: settingsColors.accent },
  brandMarkText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: -0.5 },
  brandName: { color: settingsColors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
});
