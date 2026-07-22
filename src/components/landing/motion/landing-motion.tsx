import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, LayoutChangeEvent } from 'react-native';

export type LandingMotionQuality = 'high' | 'limited' | 'off';

interface LandingMotionContextValue {
  quality: LandingMotionQuality;
  reducedMotion: boolean;
}

const LandingMotionContext = createContext<LandingMotionContextValue>({
  quality: 'limited',
  reducedMotion: false,
});

const supportsFinePointer = () => {
  if (process.env.EXPO_OS !== 'web' || typeof window === 'undefined') return false;
  return window.matchMedia?.('(pointer: fine)').matches ?? false;
};

export const LandingMotionProvider = ({ children }: { children: React.ReactNode }) => {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quality, setQuality] = useState<LandingMotionQuality>('limited');
  const sampled = useRef(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!mounted) return;
      setReducedMotion(enabled);
      setQuality(enabled ? 'off' : supportsFinePointer() ? 'high' : 'limited');
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReducedMotion(enabled);
      setQuality(enabled ? 'off' : supportsFinePointer() ? 'high' : 'limited');
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (process.env.EXPO_OS !== 'web' || typeof window === 'undefined' || quality !== 'high') return;
    const sample = () => {
      if (sampled.current) return;
      sampled.current = true;
      const frames: number[] = [];
      let previous = performance.now();
      let frame = 0;
      const measure = (now: number) => {
        frames.push(now - previous);
        previous = now;
        frame += 1;
        if (frame < 45) {
          window.requestAnimationFrame(measure);
          return;
        }
        const slowFrames = frames.filter((duration) => duration > 28).length;
        if (slowFrames / frames.length > 0.22) setQuality('limited');
      };
      window.requestAnimationFrame(measure);
    };
    window.addEventListener('pointerdown', sample, { once: true, passive: true });
    return () => window.removeEventListener('pointerdown', sample);
  }, [quality]);

  const value = useMemo(() => ({ quality, reducedMotion }), [quality, reducedMotion]);
  return <LandingMotionContext value={value}>{children}</LandingMotionContext>;
};

export const useLandingMotion = () => React.use(LandingMotionContext);

export const useReducedMotion = () => useLandingMotion().reducedMotion;

export interface PointerPosition {
  x: number;
  y: number;
  active: boolean;
}

const eventPoint = (event: any) => ({
  x: Number(event?.nativeEvent?.offsetX ?? event?.nativeEvent?.locationX ?? 0),
  y: Number(event?.nativeEvent?.offsetY ?? event?.nativeEvent?.locationY ?? 0),
});

export const useMousePosition = () => {
  const { quality } = useLandingMotion();
  const [position, setPosition] = useState<PointerPosition>({ x: 0, y: 0, active: false });
  const onPointerMove = useCallback((event: any) => {
    if (quality !== 'high') return;
    setPosition({ ...eventPoint(event), active: true });
  }, [quality]);
  const onPointerLeave = useCallback(() => setPosition((current) => ({ ...current, active: false })), []);
  return { position, handlers: { onPointerMove, onPointerLeave } };
};

export const useMagneticHover = (strength = 0.08) => {
  const { position, handlers } = useMousePosition();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = useCallback((event: LayoutChangeEvent) => setSize(event.nativeEvent.layout), []);
  const offset = position.active
    ? { x: (position.x - size.width / 2) * strength, y: (position.y - size.height / 2) * strength }
    : { x: 0, y: 0 };
  return { offset, handlers, onLayout };
};

export const useTilt = (maxDegrees = 4) => {
  const { position, handlers } = useMousePosition();
  const [size, setSize] = useState({ width: 1, height: 1 });
  const onLayout = useCallback((event: LayoutChangeEvent) => setSize(event.nativeEvent.layout), []);
  const rotateX = position.active ? ((position.y / size.height) - 0.5) * -maxDegrees * 2 : 0;
  const rotateY = position.active ? ((position.x / size.width) - 0.5) * maxDegrees * 2 : 0;
  return { rotateX, rotateY, active: position.active, handlers, onLayout };
};

export const useSpotlight = useMousePosition;

export const useRevealOnScroll = () => {
  const reducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(reducedMotion || process.env.EXPO_OS !== 'web');
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((node: unknown) => {
    observer.current?.disconnect();
    if (reducedMotion || process.env.EXPO_OS !== 'web' || !node || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }
    observer.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setRevealed(true);
        observer.current?.disconnect();
      }
    }, { rootMargin: '0px 0px 18% 0px', threshold: 0.04 });
    observer.current.observe(node as Element);
  }, [reducedMotion]);
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, revealed };
};
