import { useWindowDimensions } from 'react-native';
import { landingLayout } from '../../theme/landing-tokens';

// Responsividade resolvida em um único lugar: cada seção lê daqui em vez de
// recalcular breakpoints com useWindowDimensions por conta própria.

export type LandingBreakpoint = 'phone' | 'tablet' | 'desktop';

export interface LandingLayoutInfo {
  width: number;
  breakpoint: LandingBreakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  /** Largura útil da área de conteúdo, já descontadas as margens laterais. */
  contentWidth: number;
  /** Espaço entre colunas e linhas das grades. */
  gutter: number;
  /** Margem lateral aplicada ao conteúdo. */
  paddingX: number;
  /** Espaço vertical entre seções. */
  sectionGap: number;
  /** Número de colunas recomendado para uma grade de cards. */
  columns: number;
}

const GUTTER = { phone: 14, tablet: 18, desktop: 22 } as const;
const PADDING_X = { phone: 20, tablet: 32, desktop: 40 } as const;
const SECTION_GAP = { phone: 72, tablet: 96, desktop: 120 } as const;

const resolveBreakpoint = (width: number): LandingBreakpoint => {
  if (width >= landingLayout.desktopBreakpoint) return 'desktop';
  if (width >= landingLayout.mobileBreakpoint) return 'tablet';
  return 'phone';
};

/**
 * O tablet é a faixa historicamente negligenciada: recebe duas colunas e
 * tipografia intermediária em vez de pular direto do layout empilhado para o
 * layout de desktop.
 */
const resolveColumns = (width: number): number => {
  if (width >= 1180) return 3;
  if (width >= landingLayout.mobileBreakpoint) return 2;
  return 1;
};

export const useLandingLayout = (): LandingLayoutInfo => {
  const { width } = useWindowDimensions();
  const breakpoint = resolveBreakpoint(width);
  const paddingX = PADDING_X[breakpoint];

  return {
    width,
    breakpoint,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    contentWidth: Math.min(width, landingLayout.maxWidth) - paddingX * 2,
    gutter: GUTTER[breakpoint],
    paddingX,
    sectionGap: SECTION_GAP[breakpoint],
    columns: resolveColumns(width),
  };
};

/**
 * Largura de cada célula de uma grade fluida. Grades em React Native Web não
 * têm `grid-template-columns`, então a largura precisa ser calculada a partir
 * do espaço disponível — sem isso, o "wrap" quebra em larguras intermediárias.
 */
export const resolveCellWidth = (
  contentWidth: number,
  columns: number,
  gutter: number,
  maxColumns = columns,
): number => {
  const effective = Math.max(1, Math.min(columns, maxColumns));
  return Math.max(200, (contentWidth - gutter * (effective - 1)) / effective);
};

/** Escalas tipográficas por breakpoint — evita títulos de 64px em telas de 390px. */
export const landingTypeScale = {
  display: { phone: 34, tablet: 44, desktop: 54 },
  sectionTitle: { phone: 28, tablet: 34, desktop: 42 },
  lead: { phone: 15, tablet: 16, desktop: 17 },
} as const;

export const resolveTypeSize = (
  scale: keyof typeof landingTypeScale,
  breakpoint: LandingBreakpoint,
): number => landingTypeScale[scale][breakpoint];
