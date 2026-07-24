import { products } from '@cutsync/brand';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInRight,
  FadeInUp,
  LinearTransition,
} from 'react-native-reanimated';

import { ClientButton, ClientGlassStage } from '@/components/ui/client-ui';
import { useClientOnboarding } from '@/contexts/client-onboarding-context';
import { clientTheme } from '@/theme/client-theme';

type ClientOnboardingMode = 'first-run' | 'replay';

interface OnboardingPage {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  detail: string;
}

const pages: OnboardingPage[] = [
  {
    id: 'discover',
    eyebrow: 'DESCUBRA',
    title: 'Seu próximo cuidado começa aqui.',
    description: 'Encontre estabelecimentos, serviços e profissionais com uma experiência feita para você.',
    accent: 'PERTO DE VOCÊ',
    detail: 'Busca clara e escolhas confiáveis',
  },
  {
    id: 'book',
    eyebrow: 'AGENDE',
    title: 'Horários reais, sem complicação.',
    description: 'Escolha o serviço, o profissional e o melhor momento. O CutSync cuida do restante.',
    accent: 'AGENDA CONECTADA',
    detail: 'Confirmação e reagendamento em poucos passos',
  },
  {
    id: 'follow',
    eyebrow: 'ACOMPANHE',
    title: 'Sua rotina sempre em ordem.',
    description: 'Consulte seus próximos atendimentos, receba lembretes e mantenha sua conta protegida.',
    accent: 'TUDO NO CONTROLE',
    detail: 'Agenda, notificações e segurança',
  },
];

function OnboardingArtwork({ pageIndex }: { pageIndex: number }) {
  return (
    <View style={styles.artwork}>
      <View style={[styles.orbit, styles.orbitLarge]} />
      <View style={[styles.orbit, styles.orbitSmall]} />
      <View style={styles.artCardPrimary}>
        <Text style={styles.artCardEyebrow}>{pages[pageIndex].accent}</Text>
        <View style={styles.artCardLineStrong} />
        <View style={styles.artCardLine} />
        <Text style={styles.artCardDetail}>{pages[pageIndex].detail}</Text>
      </View>
      <View style={[styles.artChip, pageIndex === 1 && styles.artChipBooking]}>
        <View style={styles.artChipDot} />
        <Text style={styles.artChipText}>
          {pageIndex === 0 ? 'Bem avaliado' : pageIndex === 1 ? '14:30 disponível' : 'Horário confirmado'}
        </Text>
      </View>
      <View style={styles.artBadge}>
        <Text style={styles.artBadgeText}>{pageIndex + 1}</Text>
      </View>
    </View>
  );
}

export function ClientOnboardingScreen({ mode }: { mode: ClientOnboardingMode }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<OnboardingPage>>(null);
  const { complete } = useClientOnboarding();
  const [activeIndex, setActiveIndex] = useState(0);
  const pageWidth = Math.min(width, 620);
  const isLastPage = activeIndex === pages.length - 1;

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 70 }), []);
  const onViewableItemsChanged = useRef(({ viewableItems }: {
    viewableItems: ViewToken<OnboardingPage>[];
  }) => {
    const nextIndex = viewableItems[0]?.index;
    if (typeof nextIndex === 'number') setActiveIndex(nextIndex);
  }).current;

  const finish = async () => {
    if (mode === 'replay') {
      router.back();
      return;
    }
    await complete();
  };

  const advance = () => {
    if (isLastPage) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
  };

  return (
    <View testID={mode === 'first-run' ? 'client-onboarding-screen' : 'client-introduction-screen'} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <Text style={styles.brandMarkText}>C</Text>
          </View>
          <Text style={styles.brandName}>{products.client.name}</Text>
        </View>
        <Pressable
          testID={mode === 'first-run' ? 'client-onboarding-skip' : 'client-introduction-close'}
          accessibilityRole="button"
          accessibilityLabel={mode === 'first-run' ? 'Pular apresentação' : 'Fechar apresentação'}
          onPress={() => { void finish(); }}
          style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
        >
          <Text style={styles.skipText}>{mode === 'first-run' ? 'Pular' : 'Fechar'}</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={pages}
        horizontal
        pagingEnabled
        bounces={false}
        contentInsetAdjustmentBehavior="automatic"
        decelerationRate="fast"
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInRight.duration(clientTheme.motion.emphasized)}
            style={[styles.page, { width: pageWidth }]}
          >
            <ClientGlassStage
              testID={`client-onboarding-art-${item.id}`}
              backdrop={<OnboardingArtwork pageIndex={index} />}
            >
              <View style={styles.glassCopy}>
                <Text style={styles.glassEyebrow}>{item.eyebrow}</Text>
                <Text style={styles.glassNumber}>0{index + 1}</Text>
              </View>
            </ClientGlassStage>
            <Animated.View
              entering={FadeInUp
                .delay(index * clientTheme.motion.stagger)
                .duration(clientTheme.motion.standard)}
              style={styles.copy}
            >
              <Text style={styles.eyebrow}>{item.eyebrow}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </Animated.View>
          </Animated.View>
        )}
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        viewabilityConfig={viewabilityConfig}
      />

      <View style={styles.footer}>
        <View accessibilityLabel={`Página ${activeIndex + 1} de ${pages.length}`} style={styles.pagination}>
          {pages.map((page, index) => (
            <Animated.View
              key={page.id}
              entering={FadeIn.duration(clientTheme.motion.fast)}
              layout={LinearTransition.duration(clientTheme.motion.standard)}
              style={[styles.paginationDot, index === activeIndex && styles.paginationDotActive]}
            />
          ))}
        </View>
        <ClientButton
          testID="client-onboarding-next"
          label={isLastPage ? (mode === 'replay' ? 'Voltar para a conta' : 'Começar agora') : 'Continuar'}
          haptic={isLastPage ? 'success' : 'selection'}
          onPress={advance}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: clientTheme.colors.canvas,
  },
  topBar: {
    width: '100%',
    maxWidth: clientTheme.sizing.contentMaxWidth,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: clientTheme.spacing.xl,
    paddingTop: clientTheme.spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: clientTheme.spacing.xs,
  },
  brandMark: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: clientTheme.radii.sm,
    borderCurve: 'continuous',
    backgroundColor: clientTheme.colors.forest,
  },
  brandMarkText: {
    color: clientTheme.colors.white,
    fontSize: 17,
    fontWeight: '900',
  },
  brandName: {
    color: clientTheme.colors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  skipButton: {
    minWidth: clientTheme.sizing.touchTarget,
    minHeight: clientTheme.sizing.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: clientTheme.spacing.sm,
  },
  skipText: {
    color: clientTheme.colors.forest,
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    width: '100%',
    maxWidth: clientTheme.sizing.contentMaxWidth,
  },
  page: {
    paddingHorizontal: clientTheme.spacing.xl,
    paddingTop: clientTheme.spacing.sm,
    gap: clientTheme.spacing.xxl,
  },
  artwork: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: clientTheme.colors.sandSoft,
  },
  orbit: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(44, 67, 52, 0.16)',
    borderRadius: clientTheme.radii.pill,
  },
  orbitLarge: {
    width: 260,
    height: 260,
    right: -80,
    top: -82,
  },
  orbitSmall: {
    width: 130,
    height: 130,
    left: -36,
    bottom: -28,
  },
  artCardPrimary: {
    position: 'absolute',
    left: 34,
    right: 34,
    top: 52,
    minHeight: 142,
    gap: 12,
    borderRadius: clientTheme.radii.lg,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    boxShadow: clientTheme.shadows.floating,
  },
  artCardEyebrow: {
    ...clientTheme.typography.eyebrow,
    color: clientTheme.colors.forest,
  },
  artCardLineStrong: {
    width: '78%',
    height: 11,
    borderRadius: clientTheme.radii.pill,
    backgroundColor: clientTheme.colors.forest,
  },
  artCardLine: {
    width: '55%',
    height: 8,
    borderRadius: clientTheme.radii.pill,
    backgroundColor: clientTheme.colors.border,
  },
  artCardDetail: {
    color: clientTheme.colors.inkSoft,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  artChip: {
    position: 'absolute',
    right: 22,
    bottom: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: clientTheme.spacing.xs,
    borderRadius: clientTheme.radii.pill,
    paddingHorizontal: clientTheme.spacing.md,
    paddingVertical: clientTheme.spacing.sm,
    backgroundColor: clientTheme.colors.forest,
    boxShadow: clientTheme.shadows.floating,
  },
  artChipBooking: {
    backgroundColor: clientTheme.colors.forestBright,
  },
  artChipDot: {
    width: 8,
    height: 8,
    borderRadius: clientTheme.radii.pill,
    backgroundColor: clientTheme.colors.sandSoft,
  },
  artChipText: {
    color: clientTheme.colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  artBadge: {
    position: 'absolute',
    left: 22,
    bottom: 26,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: clientTheme.colors.amberSoft,
  },
  artBadgeText: {
    color: clientTheme.colors.amber,
    fontSize: 18,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  glassCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  glassEyebrow: {
    ...clientTheme.typography.eyebrow,
    color: clientTheme.colors.forest,
  },
  glassNumber: {
    color: clientTheme.colors.forest,
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  copy: {
    gap: clientTheme.spacing.sm,
  },
  eyebrow: {
    ...clientTheme.typography.eyebrow,
    color: clientTheme.colors.forest,
  },
  title: {
    ...clientTheme.typography.title,
    color: clientTheme.colors.ink,
  },
  description: {
    ...clientTheme.typography.body,
    color: clientTheme.colors.inkSoft,
  },
  footer: {
    width: '100%',
    maxWidth: clientTheme.sizing.contentMaxWidth,
    gap: clientTheme.spacing.lg,
    paddingHorizontal: clientTheme.spacing.xl,
    paddingTop: clientTheme.spacing.lg,
    paddingBottom: clientTheme.spacing.xxl,
  },
  pagination: {
    minHeight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: clientTheme.spacing.xs,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: clientTheme.radii.pill,
    backgroundColor: clientTheme.colors.border,
  },
  paginationDotActive: {
    width: 26,
    backgroundColor: clientTheme.colors.forest,
  },
  pressed: {
    opacity: clientTheme.opacity.pressed,
  },
});
