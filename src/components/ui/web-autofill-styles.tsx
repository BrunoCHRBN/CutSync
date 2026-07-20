import React from 'react';
import { Platform } from 'react-native';
import { colors } from '../../theme/tokens';

const css = `
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
textarea:-webkit-autofill,
select:-webkit-autofill {
  -webkit-text-fill-color: ${colors.textPrimary} !important;
  -webkit-box-shadow: 0 0 0 1000px ${colors.surface} inset !important;
  box-shadow: 0 0 0 1000px ${colors.surface} inset !important;
  caret-color: ${colors.textPrimary};
  transition: background-color 9999s ease-out 0s;
}
*:focus-visible {
  outline-color: ${colors.brandPrimary};
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;

export const WebAutofillStyles = () => {
  if (Platform.OS !== 'web') return null;
  return React.createElement('style', { dangerouslySetInnerHTML: { __html: css } });
};
