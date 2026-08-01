import React, { ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { establishmentThemeCssVars, type EstablishmentTheme } from '@cutsync/brand';
import { useEstablishmentTheme } from '../../contexts/establishment-theme-context';

interface EstablishmentThemeScopeProps {
  children: ReactNode;
  theme?: EstablishmentTheme;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export const EstablishmentThemeScope = ({
  children,
  theme: themeOverride,
  style,
  testID = 'establishment-theme-scope',
}: EstablishmentThemeScopeProps) => {
  const { theme: contextTheme } = useEstablishmentTheme();
  const theme = themeOverride ?? contextTheme;
  const cssVars = establishmentThemeCssVars(theme);

  if (Platform.OS === 'web') {
    return (
      <View
        testID={testID}
        style={[style, cssVars as unknown as ViewStyle]}
      >
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} style={style}>
      {children}
    </View>
  );
};

export function themeStyle(theme: EstablishmentTheme) {
  return establishmentThemeCssVars(theme) as unknown as ViewStyle;
}
