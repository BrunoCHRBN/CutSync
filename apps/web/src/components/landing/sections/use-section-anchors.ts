import { RefObject, useCallback, useRef } from 'react';
import { LayoutChangeEvent, ScrollView } from 'react-native';
import { LandingSectionId } from '../landing-content';

const HEADER_OFFSET = 84;

export const useSectionAnchors = (scrollRef: RefObject<ScrollView | null>, reducedMotion: boolean) => {
  const baseline = useRef(0);
  const offsets = useRef<Partial<Record<LandingSectionId, number>>>({});

  const setBaseline = useCallback((event: LayoutChangeEvent) => {
    baseline.current = event.nativeEvent.layout.y;
  }, []);

  const registerSection = useCallback((id: LandingSectionId) => (event: LayoutChangeEvent) => {
    offsets.current[id] = event.nativeEvent.layout.y;
  }, []);

  const scrollToSection = useCallback((id: LandingSectionId) => {
    const target = Math.max(0, baseline.current + (offsets.current[id] ?? 0) - HEADER_OFFSET);
    scrollRef.current?.scrollTo({ y: target, animated: !reducedMotion });
  }, [reducedMotion, scrollRef]);

  return { setBaseline, registerSection, scrollToSection };
};
