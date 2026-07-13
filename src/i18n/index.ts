import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import pt from './locales/pt.json';
import en from './locales/en.json';

// Pegar o idioma preferencial do dispositivo do usuário
const locales = Localization.getLocales();
const deviceLanguage = locales && locales.length > 0 ? locales[0].languageCode : 'pt';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
    },
    lng: deviceLanguage || 'pt',
    fallbackLng: 'pt',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
