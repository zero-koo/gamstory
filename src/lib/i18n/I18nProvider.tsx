import * as React from 'react';
import ko from './messages/ko.json';
import en from './messages/en.json';
import { detectLocale, type Locale } from './use-locale';

type MessageBag = Record<string, string>;
const BAGS: Record<Locale, MessageBag> = { 'ko-KR': ko, en };

interface Ctx {
  locale: Locale;
  t: (key: keyof typeof ko, vars?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
}
const I18nContext = React.createContext<Ctx | null>(null);

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale ?? detectLocale());
  const t = React.useCallback(
    (key: keyof typeof ko, vars?: Record<string, string | number>) => {
      const raw =
        (BAGS[locale] as Record<string, string>)[key] ??
        (BAGS['en'] as Record<string, string>)[key] ??
        String(key);
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
    },
    [locale],
  );
  const setLocale = React.useCallback((l: Locale) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gamstory:locale', l);
      document.documentElement.lang = l;
    }
    setLocaleState(l);
  }, []);
  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext.Provider value={{ locale, t, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be inside I18nProvider');
  return ctx;
}
