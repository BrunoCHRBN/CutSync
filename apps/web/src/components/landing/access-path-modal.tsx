import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ArrowRight, CalendarDays, Store, UsersRound, X } from 'lucide-react-native';
import {
  landingColors,
  landingLayout,
  landingRadii,
  landingShadows,
  landingTypography,
} from '../../theme/landing-tokens';
import { trackLandingEvent } from './landing-analytics';
import { useReducedMotion } from './motion/landing-motion';

export type AccessPath = 'client' | 'business' | 'establishment';
export type AccessPathSource = 'client' | 'business';

interface AccessPathModalProps {
  visible: boolean;
  source: AccessPathSource;
  onClose: () => void;
  onSelect: (path: AccessPath) => void;
}

const options = [
  {
    id: 'client',
    title: 'Quero agendar',
    description: 'Sou cliente e quero marcar ou acompanhar um horário.',
    icon: CalendarDays,
  },
  {
    id: 'business',
    title: 'Já uso no meu estabelecimento',
    description: 'Sou dono, gestor ou colaborador e quero acessar a operação.',
    icon: UsersRound,
  },
  {
    id: 'establishment',
    title: 'Quero cadastrar meu estabelecimento',
    description: 'Quero começar a usar o CutSync no meu negócio.',
    icon: Store,
  },
] as const;

export const AccessPathModal = ({ visible, source, onClose, onSelect }: AccessPathModalProps) => {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const isDesktop = width >= landingLayout.mobileBreakpoint;
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  const firstOptionRef = useRef<any>(null);
  const closeButtonRef = useRef<any>(null);
  const optionRefs = useRef<any[]>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const modalAccessibilityProps = Platform.OS === 'web'
    ? ({ role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'access-path-title' } as any)
    : { accessibilityViewIsModal: true };

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (visible) setRendered(true);
  }, [visible]);

  useEffect(() => {
    if (!rendered) return;
    const duration = reducedMotion ? 0 : visible ? 280 : 220;
    progress.value = withTiming(
      visible ? 1 : 0,
      { duration, easing: Easing.bezier(0.16, 1, 0.3, 1) },
      (finished) => {
        if (finished && !visible) runOnJS(setRendered)(false);
      },
    );
  }, [progress, reducedMotion, rendered, visible]);

  useEffect(() => {
    if (!visible) return;
    trackLandingEvent({ name: 'access_selector_opened', source });

    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => firstOptionRef.current?.focus?.(), reducedMotion ? 0 : 80);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [closeButtonRef.current, ...optionRefs.current].filter(Boolean);
      if (focusable.length === 0) return;
      const currentIndex = focusable.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex]?.focus?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [reducedMotion, source, visible]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [isDesktop ? -32 : 64, 0]) },
      { scale: interpolate(progress.value, [0, 1], [isDesktop ? 0.98 : 1, 1]) },
    ],
  }));

  const selectPath = (path: AccessPath) => {
    trackLandingEvent({ name: 'access_path_selected', source, path });
    onSelect(path);
  };

  if (!rendered) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={rendered}
    >
      <View
        {...modalAccessibilityProps}
        accessibilityLabel="Escolha como usar o CutSync"
        style={[styles.modalRoot, isDesktop ? styles.desktopRoot : styles.mobileRoot]}
        testID="access-path-modal"
      >
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, overlayStyle]} />
        <Pressable
          accessibilityLabel="Fechar escolha de acesso"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID="access-path-backdrop"
        />

        <Animated.View
          style={[
            styles.panel,
            landingShadows.raised,
            isDesktop ? styles.desktopPanel : styles.mobilePanel,
            panelStyle,
          ]}
          testID={isDesktop ? 'access-path-modal-desktop' : 'access-path-modal-mobile'}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>ACESSO PERSONALIZADO</Text>
              <Text accessibilityRole="header" nativeID="access-path-title" style={styles.title}>Como você quer usar o CutSync?</Text>
              <Text style={styles.description}>Escolha uma opção para seguir pelo caminho certo.</Text>
            </View>
            <Pressable
              ref={closeButtonRef}
              accessibilityLabel="Fechar"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              testID="access-path-close-button"
            >
              <X color={landingColors.inkSecondary} size={20} />
            </Pressable>
          </View>

          <View style={styles.options}>
            {options.map((option, index) => {
              const Icon = option.icon;
              return (
                <Pressable
                  key={option.id}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                    if (index === 0) firstOptionRef.current = node;
                  }}
                  accessibilityHint={option.description}
                  accessibilityLabel={option.title}
                  accessibilityRole="button"
                  onPress={() => selectPath(option.id)}
                  style={({ hovered, pressed }: any) => [
                    styles.option,
                    hovered && styles.optionHovered,
                    pressed && styles.optionPressed,
                  ]}
                  testID={`access-path-${option.id}`}
                >
                  <View style={styles.iconShell}><Icon color={landingColors.brand} size={21} /></View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    <Text style={styles.optionDescription}>{option.description}</Text>
                  </View>
                  <ArrowRight color={landingColors.inkMuted} size={18} />
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.securityNote}>Sua escolha orienta a entrada. As permissões são verificadas após o login.</Text>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: { flex: 1, padding: 20 },
  desktopRoot: { alignItems: 'center', justifyContent: 'center' },
  mobileRoot: { justifyContent: 'flex-end', padding: 0 },
  backdrop: { backgroundColor: 'rgba(12, 24, 17, 0.52)' },
  panel: { backgroundColor: landingColors.surface },
  desktopPanel: { width: '100%', maxWidth: 640, borderRadius: landingRadii.xl, padding: 30 },
  mobilePanel: { width: '100%', maxHeight: '92%', borderTopLeftRadius: landingRadii.xl, borderTopRightRadius: landingRadii.xl, padding: 22, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
  headerCopy: { flex: 1 },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 10, letterSpacing: 1.5 },
  title: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 28, lineHeight: 34, letterSpacing: -1, marginTop: 9 },
  description: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 21, marginTop: 7 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md },
  options: { gap: 10, marginTop: 26 },
  option: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface },
  optionHovered: { borderColor: landingColors.brand, backgroundColor: landingColors.brandSoft, transform: [{ translateY: -2 }] },
  optionPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  iconShell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: landingRadii.md, backgroundColor: landingColors.brandSoft },
  optionCopy: { flex: 1, gap: 4 },
  optionTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  optionDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 17 },
  securityNote: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 18 },
  pressed: { opacity: 0.6 },
});
