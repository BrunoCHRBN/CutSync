import React, { createContext, ReactNode, useContext, useMemo } from 'react';
import {
  buildEstablishmentTheme,
  DEFAULT_ESTABLISHMENT_COLOR,
  type EstablishmentTheme,
} from '@cutsync/brand';

export interface EstablishmentThemeContextValue {
  theme: EstablishmentTheme;
  establishmentId?: string;
  establishmentName?: string;
}

const EstablishmentThemeContext = createContext<EstablishmentThemeContextValue | null>(null);

export interface EstablishmentThemeProviderProps {
  children: ReactNode;
  primaryColor?: string | null;
  establishmentId?: string;
  establishmentName?: string;
}

export const EstablishmentThemeProvider = ({
  children,
  primaryColor,
  establishmentId,
  establishmentName,
}: EstablishmentThemeProviderProps) => {
  const value = useMemo(
    () => ({
      theme: buildEstablishmentTheme(primaryColor ?? DEFAULT_ESTABLISHMENT_COLOR),
      establishmentId,
      establishmentName,
    }),
    [primaryColor, establishmentId, establishmentName],
  );

  return (
    <EstablishmentThemeContext.Provider value={value}>
      {children}
    </EstablishmentThemeContext.Provider>
  );
};

export function useEstablishmentTheme(): EstablishmentThemeContextValue {
  const context = useContext(EstablishmentThemeContext);
  if (!context) {
    return { theme: buildEstablishmentTheme(DEFAULT_ESTABLISHMENT_COLOR) };
  }
  return context;
}

export function useRequiredEstablishmentTheme(): EstablishmentThemeContextValue {
  const context = useContext(EstablishmentThemeContext);
  if (!context) {
    throw new Error('useRequiredEstablishmentTheme must be used within EstablishmentThemeProvider');
  }
  return context;
}
