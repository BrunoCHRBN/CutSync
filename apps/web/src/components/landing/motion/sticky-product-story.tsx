import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ArrowRight } from 'lucide-react-native';
import { landingColors, landingMotion, landingTypography } from '../../../theme/landing-tokens';
import { LandingCapabilityId } from '../landing-capabilities';
import { AnimatedTabContent } from './landing-effects';
import { useLandingMotion } from './landing-motion';

export interface StickyProductStoryChapter {
  id: LandingCapabilityId;
  index: string;
  title: string;
  description: string;
  testID: string;
}

export interface StickyProductStoryHandle {
  scrollTo: (id: LandingCapabilityId) => void;
}

interface StickyProductStoryProps {
  chapters: readonly StickyProductStoryChapter[];
  activeId: LandingCapabilityId;
  direction: -1 | 1;
  onActiveChange: (id: LandingCapabilityId) => void;
  renderPreview: (id: LandingCapabilityId) => React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const StickyProductStory = forwardRef<StickyProductStoryHandle, StickyProductStoryProps>(({
  chapters,
  activeId,
  direction,
  onActiveChange,
  renderPreview,
  style,
}, forwardedRef) => {
  const { quality } = useLandingMotion();
  const nodes = useRef(new Map<LandingCapabilityId, unknown>());

  useImperativeHandle(forwardedRef, () => ({
    scrollTo: (id) => {
      const node = nodes.current.get(id) as { scrollIntoView?: (options?: ScrollIntoViewOptions) => void } | undefined;
      node?.scrollIntoView?.({ behavior: quality === 'off' ? 'auto' : 'smooth', block: 'center' });
    },
  }), [quality]);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const candidate = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const id = candidate?.target.getAttribute('data-story-id') as LandingCapabilityId | null;
      if (id) onActiveChange(id);
    }, {
      rootMargin: '-30% 0px -45% 0px',
      threshold: [0.15, 0.35, 0.6],
    });
    nodes.current.forEach((node) => observer.observe(node as Element));
    return () => observer.disconnect();
  }, [onActiveChange]);

  return (
    <View testID="business-sticky-story" style={[styles.layout, style]}>
      <View style={styles.chapters}>
        {chapters.map((chapter) => {
          const selected = chapter.id === activeId;
          return (
            <Pressable
              key={chapter.id}
              ref={(node) => {
                if (node) nodes.current.set(chapter.id, node);
                else nodes.current.delete(chapter.id);
              }}
              {...({ 'data-story-id': chapter.id } as Record<string, string>)}
              testID={chapter.testID}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onActiveChange(chapter.id)}
              style={[styles.chapter, selected && styles.chapterActive]}
            >
              <View style={styles.chapterTop}>
                <Text style={[styles.index, selected && styles.indexActive]}>{chapter.index}</Text>
                <ArrowRight size={18} color={selected ? landingColors.accent : landingColors.borderStrong} />
              </View>
              <Text style={[styles.title, selected && styles.titleActive]}>{chapter.title}</Text>
              <Text style={styles.description}>{chapter.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.previewColumn}>
        <View testID="business-sticky-preview" style={styles.previewSticky}>
          <AnimatedTabContent
            contentKey={activeId}
            direction={direction}
            testID={`business-sticky-preview-${activeId}`}
          >
            {renderPreview(activeId)}
          </AnimatedTabContent>
        </View>
      </View>
    </View>
  );
});

StickyProductStory.displayName = 'StickyProductStory';

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', alignItems: 'flex-start', gap: 48 },
  chapters: { width: 330 },
  chapter: {
    minHeight: '78vh',
    paddingVertical: 52,
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
    borderLeftWidth: 2,
    borderLeftColor: landingColors.border,
    opacity: 0.5,
    transitionProperty: 'opacity, border-color, background-color',
    transitionDuration: `${landingMotion.standard}ms`,
  } as never,
  chapterActive: { opacity: 1, borderLeftColor: landingColors.brand, backgroundColor: landingColors.brandSoft },
  chapterTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  index: { color: landingColors.inkMuted, fontFamily: landingTypography.mono, fontSize: 12 },
  indexActive: { color: landingColors.brand },
  title: { color: landingColors.inkSecondary, fontFamily: landingTypography.displaySemiBold, fontSize: 24, lineHeight: 30 },
  titleActive: { color: landingColors.ink },
  description: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
  previewColumn: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  previewSticky: {
    position: 'sticky',
    top: 96,
    minHeight: 560,
    paddingVertical: 24,
  } as never,
});
