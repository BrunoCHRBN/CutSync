import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AuthScreenProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}

export function AuthScreen({
  eyebrow,
  title,
  description,
  children,
  footer,
  testID,
}: AuthScreenProps) {
  return (
    <SafeAreaView testID={testID} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.shell}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandLetter}>C</Text>
              </View>
              <View>
                <Text style={styles.brand}>CutSync Business</Text>
                <Text style={styles.brandCaption}>GESTÃO DO SEU NEGÓCIO</Text>
              </View>
            </View>

            <View style={styles.heading}>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.description}>{description}</Text>
            </View>

            <View style={styles.content}>{children}</View>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0E1914',
  },
  keyboard: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 36,
  },
  shell: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginBottom: 48,
  },
  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C7E36F',
  },
  brandLetter: {
    color: '#102019',
    fontSize: 20,
    fontWeight: '900',
  },
  brand: {
    color: '#F5F8F6',
    fontSize: 15,
    fontWeight: '800',
  },
  brandCaption: {
    color: '#829087',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 2,
  },
  heading: {
    gap: 9,
    marginBottom: 26,
  },
  eyebrow: {
    color: '#C7E36F',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: '#F5F8F6',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  description: {
    color: '#9EACA4',
    fontSize: 14,
    lineHeight: 21,
  },
  content: {
    gap: 14,
  },
  footer: {
    marginTop: 18,
  },
});
