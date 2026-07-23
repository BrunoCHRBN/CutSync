import { products, sharedBrand } from '@cutsync/brand';
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
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brandName}>{products.client.name}</Text>
          </View>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
          <View style={styles.form}>{children}</View>
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
          onPress={() => setVisible((current) => !current)}
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
      onPress={onPress}
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
  safeArea: { flex: 1, backgroundColor: sharedBrand.colors.sandSoft },
  scroll: { flexGrow: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 22, paddingBottom: 32 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 18, height: 18, borderRadius: 6, backgroundColor: sharedBrand.colors.forest },
  brandName: { color: sharedBrand.colors.forestDark, fontSize: 17, fontWeight: '700' },
  intro: { paddingTop: 54, paddingBottom: 28, gap: 12 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: sharedBrand.colors.forestDark, fontSize: 38, fontWeight: '700', letterSpacing: -1.25, lineHeight: 43 },
  description: { color: '#59615B', fontSize: 15, lineHeight: 23 },
  form: { gap: 18, backgroundColor: sharedBrand.colors.surface, borderRadius: 26, padding: 20 },
  field: { gap: 8 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: sharedBrand.colors.forestDark, fontSize: 13, fontWeight: '700' },
  fieldAction: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '700' },
  input: {
    height: 52,
    minHeight: 52,
    maxHeight: 52,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8D1BE',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 0,
    color: sharedBrand.colors.forestDark,
    backgroundColor: '#FCFBF7',
    fontSize: 16,
  },
  button: { minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: sharedBrand.colors.forest },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { transform: [{ scale: 0.99 }] },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 5 },
  linkText: { color: sharedBrand.colors.forest, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  notice: { padding: 13, borderRadius: 14, borderWidth: 1 },
  noticeDanger: { backgroundColor: '#FCE9E7', borderColor: '#F2C8C2' },
  noticeSuccess: { backgroundColor: '#E8F3E9', borderColor: '#C7DFC9' },
  noticeNeutral: { backgroundColor: '#F6EED3', borderColor: '#E7D89F' },
  noticeText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  noticeTextDanger: { color: '#8E2F26' },
  noticeTextSuccess: { color: '#2D633A' },
  noticeTextNeutral: { color: '#6A5620' },
  securityNote: { color: '#817A6C', fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
