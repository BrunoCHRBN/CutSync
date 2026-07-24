import { products } from '@cutsync/brand';
import { getForbiddenInputMessage } from '@cutsync/validation';
import { StatusBar } from 'expo-status-bar';
import { type PropsWithChildren, type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import { performClientHaptic } from '@/features/experience/client-haptics';
import { clientTheme } from '@/theme/client-theme';

interface AuthScreenProps extends PropsWithChildren {
  testID: string;
  eyebrow: string;
  title: string;
  description: string;
}

export function AuthScreen({ testID, eyebrow, title, description, children }: AuthScreenProps) {
  return (
    <SafeAreaView testID={testID} style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            entering={FadeIn.duration(clientTheme.motion.fast)}
            style={styles.brandRow}
          >
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>C</Text>
            </View>
            <Text style={styles.brandName}>{products.client.name}</Text>
          </Animated.View>
          <Animated.View
            entering={FadeInUp.duration(clientTheme.motion.standard)}
            style={styles.intro}
          >
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </Animated.View>
          <Animated.View
            entering={FadeInUp
              .delay(clientTheme.motion.stagger)
              .duration(clientTheme.motion.emphasized)}
            style={styles.form}
          >
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface AuthFieldProps extends TextInputProps {
  label: string;
  testID: string;
  onUnsafeInput: (message: string | null) => void;
  trailing?: ReactNode;
}

export function AuthField({ label, testID, onUnsafeInput, onChangeText, trailing, style, ...props }: AuthFieldProps) {
  const handleChangeText = (nextValue: string) => {
    const unsafeMessage = getForbiddenInputMessage(nextValue);
    if (unsafeMessage) {
      onUnsafeInput(unsafeMessage);
      return;
    }
    onUnsafeInput(null);
    onChangeText?.(nextValue);
  };

  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.label}>{label}</Text>
        {trailing}
      </View>
      <TextInput
        {...props}
        testID={testID}
        accessibilityLabel={label}
        multiline={false}
        onChangeText={handleChangeText}
        placeholderTextColor="#968E7E"
        submitBehavior="blurAndSubmit"
        textAlignVertical="center"
        style={[styles.input, style]}
      />
    </View>
  );
}

type AuthPasswordFieldProps = Omit<AuthFieldProps, 'secureTextEntry' | 'trailing'>;

export function AuthPasswordField(props: AuthPasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField
      {...props}
      secureTextEntry={!visible}
      trailing={(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          disabled={props.editable === false}
          hitSlop={10}
          onPress={() => {
            void performClientHaptic('selection');
            setVisible((current) => !current);
          }}
        >
          <Text style={styles.fieldAction}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
        </Pressable>
      )}
    />
  );
}

export function AuthButton({ label, testID, loading, disabled, onPress }: {
  label: string;
  testID: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={() => {
        void performClientHaptic('selection');
        onPress();
      }}
      style={({ pressed }) => [styles.button, isDisabled && styles.buttonDisabled, pressed && !isDisabled && styles.buttonPressed]}
    >
      {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

export function AuthLink({ label, testID, onPress }: { label: string; testID: string; onPress: () => void }) {
  return (
    <Pressable testID={testID} accessibilityRole="link" onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export function AuthNotice({ message, testID, tone = 'danger' }: {
  message: string;
  testID: string;
  tone?: 'danger' | 'success' | 'neutral';
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[styles.notice, tone === 'danger' ? styles.noticeDanger : tone === 'success' ? styles.noticeSuccess : styles.noticeNeutral]}
    >
      <Text style={[styles.noticeText, tone === 'danger' ? styles.noticeTextDanger : tone === 'success' ? styles.noticeTextSuccess : styles.noticeTextNeutral]}>
        {message}
      </Text>
    </View>
  );
}

export function AuthSecurityNote({ children }: PropsWithChildren) {
  return <Text style={styles.securityNote}>{children}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: clientTheme.colors.canvas },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: clientTheme.colors.forest },
  brandMarkText: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  brandName: { color: clientTheme.colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  intro: { paddingTop: 42, paddingBottom: 26, gap: 12 },
  eyebrow: { ...clientTheme.typography.eyebrow, color: clientTheme.colors.forest },
  title: { ...clientTheme.typography.display, color: clientTheme.colors.ink },
  description: { ...clientTheme.typography.body, color: clientTheme.colors.inkSoft },
  form: { gap: 18, backgroundColor: clientTheme.colors.surface, borderRadius: 28, padding: 22, boxShadow: clientTheme.shadows.card },
  field: { gap: 8 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: clientTheme.colors.ink, fontSize: 13, fontWeight: '700' },
  fieldAction: { color: clientTheme.colors.forest, fontSize: 12, fontWeight: '800' },
  input: {
    height: clientTheme.sizing.control,
    minHeight: clientTheme.sizing.control,
    maxHeight: clientTheme.sizing.control,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: clientTheme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 0,
    color: clientTheme.colors.ink,
    backgroundColor: '#FCFAF3',
    fontSize: 16,
  },
  button: { minHeight: clientTheme.sizing.control, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: clientTheme.colors.forest },
  buttonDisabled: { opacity: clientTheme.opacity.disabled },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  link: { alignItems: 'center', paddingVertical: 5 },
  linkText: { color: clientTheme.colors.forest, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  notice: { padding: 14, borderRadius: 16, borderWidth: 1 },
  noticeDanger: { backgroundColor: '#FCE9E7', borderColor: '#F2C8C2' },
  noticeSuccess: { backgroundColor: '#E9F3EA', borderColor: '#C7DFC9' },
  noticeNeutral: { backgroundColor: '#F7EFD5', borderColor: '#E7D89F' },
  noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  noticeTextDanger: { color: '#8E2F26' },
  noticeTextSuccess: { color: '#2D633A' },
  noticeTextNeutral: { color: '#6A5620' },
  securityNote: { color: clientTheme.colors.inkMuted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
