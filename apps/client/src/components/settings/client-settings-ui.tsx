import { products, sharedBrand } from '@cutsync/brand';
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
  return <View style={styles.card}>{children}</View>;
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
    <View
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
    </View>
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
        placeholderTextColor="#938B7C"
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'danger' && styles.buttonDanger,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone === 'primary' ? '#FFFFFF' : sharedBrand.colors.forest} />
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
      onPress={onPress}
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
        onValueChange={onValueChange}
        thumbColor="#FFFFFF"
        trackColor={{ false: '#CEC8BA', true: sharedBrand.colors.forest }}
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
  const radius = size / 2;
  if (avatarUrl) {
    return (
      <Image
        accessibilityLabel={'Foto de perfil de ' + name}
        contentFit="cover"
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#DFD8C6' }}
        transition={180}
      />
    );
  }

  return (
    <View
      accessibilityLabel={'Iniciais de ' + name}
      style={[styles.avatarFallback, { width: size, height: size, borderRadius: radius }]}
    >
      <Text style={[styles.avatarInitials, { fontSize: size * 0.32 }]}>{getInitials(name)}</Text>
    </View>
  );
}

export function ClientBrand() {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark} />
      <Text style={styles.brandName}>{products.client.name}</Text>
    </View>
  );
}

export const settingsColors = {
  background: sharedBrand.colors.sandSoft,
  text: sharedBrand.colors.forestDark,
  secondaryText: '#64695F',
  border: '#D8D1BE',
};

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: sharedBrand.colors.sandSoft },
  pageContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 48,
    gap: 16,
  },
  pageDescription: { color: '#60675F', fontSize: 15, lineHeight: 23, paddingHorizontal: 2 },
  card: {
    backgroundColor: sharedBrand.colors.surface,
    borderRadius: 24,
    padding: 18,
    gap: 16,
    borderCurve: 'continuous',
    boxShadow: '0 8px 24px rgba(44, 67, 52, 0.07)',
  },
  sectionLabel: {
    color: '#7A735F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingTop: 4,
    paddingHorizontal: 2,
  },
  notice: { borderWidth: 1, borderRadius: 15, padding: 13, borderCurve: 'continuous' },
  noticeDanger: { backgroundColor: '#FCE9E7', borderColor: '#F2C8C2' },
  noticeSuccess: { backgroundColor: '#E8F3E9', borderColor: '#C7DFC9' },
  noticeNeutral: { backgroundColor: '#F6EED3', borderColor: '#E7D89F' },
  noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  noticeDangerText: { color: '#8E2F26' },
  noticeSuccessText: { color: '#2D633A' },
  noticeNeutralText: { color: '#6A5620' },
  field: { gap: 8 },
  fieldLabel: { color: sharedBrand.colors.forestDark, fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D8D1BE',
    borderRadius: 15,
    borderCurve: 'continuous',
    paddingHorizontal: 15,
    color: sharedBrand.colors.forestDark,
    backgroundColor: '#FCFBF7',
    fontSize: 16,
  },
  inputReadOnly: { color: '#74786F', backgroundColor: '#F1F0EA' },
  helper: { color: '#817A6C', fontSize: 11, lineHeight: 16 },
  button: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: sharedBrand.colors.forest,
    paddingHorizontal: 18,
  },
  buttonSecondary: { backgroundColor: '#F7F5EE', borderWidth: 1, borderColor: '#D8D1BE' },
  buttonDanger: { backgroundColor: '#FFF7F5', borderWidth: 1, borderColor: '#E6C3BD' },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  buttonSecondaryText: { color: sharedBrand.colors.forest },
  buttonDangerText: { color: '#8E2F26' },
  menuRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  menuRowPressed: { opacity: 0.55 },
  menuCopy: { flex: 1, gap: 4 },
  menuTitle: { color: sharedBrand.colors.forestDark, fontSize: 15, fontWeight: '700' },
  menuSubtitle: { color: '#6F746C', fontSize: 12, lineHeight: 18 },
  chevron: { color: '#898171', fontSize: 28, fontWeight: '300' },
  switchRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14 },
  switchRowDisabled: { opacity: 0.52 },
  switchCopy: { flex: 1, gap: 4 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: sharedBrand.colors.forest },
  avatarInitials: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 0.4 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 18, height: 18, borderRadius: 6, backgroundColor: sharedBrand.colors.forest },
  brandName: { color: sharedBrand.colors.forestDark, fontSize: 17, fontWeight: '700' },
});
