import * as React from 'react';

export type Locale = 'ko-KR' | 'en';
const STORAGE_KEY = 'gamstory:locale';
const SUPPORTED: ReadonlyArray<Locale> = ['ko-KR', 'en'];
export const DEFAULT_LOCALE: Locale = 'ko-KR';

function normaliseTag(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lower = tag.toLowerCase();
  if (lower === 'ko' || lower.startsWith('ko-')) return 'ko-KR';
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return null;
}

export function detectLocale(opts?: { url?: string; navigator?: string }): Locale {
  const isBrowser = typeof window !== 'undefined';
  const urlStr = opts?.url ?? (isBrowser ? window.location.href : '');
  // On the server, ignore Node's built-in `navigator` (which reports en-US) so
  // SSR falls through to DEFAULT_LOCALE instead of leaking host preferences.
  const navTag = opts?.navigator ?? (isBrowser && typeof navigator !== 'undefined' ? navigator.language : '');

  if (urlStr) {
    try {
      const url = new URL(urlStr);
      const q = url.searchParams.get('lang');
      const fromQuery = normaliseTag(q);
      if (fromQuery && SUPPORTED.includes(fromQuery)) return fromQuery;
    } catch { /* ignore malformed */ }
  }

  if (typeof localStorage !== 'undefined') {
    const stored = normaliseTag(localStorage.getItem(STORAGE_KEY));
    if (stored && SUPPORTED.includes(stored)) return stored;
  }

  const fromNav = normaliseTag(navTag);
  if (fromNav && SUPPORTED.includes(fromNav)) return fromNav;

  return DEFAULT_LOCALE;
}

export function setLocale(locale: Locale) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const [locale, setLocaleState] = React.useState<Locale>(() => detectLocale());
  React.useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return [locale, (l) => { setLocale(l); setLocaleState(l); }];
}
