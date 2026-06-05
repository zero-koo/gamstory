import { describe, it, expect, beforeEach } from 'vitest';
import { detectLocale, type Locale } from './use-locale';

describe('detectLocale', () => {
  beforeEach(() => { localStorage.clear(); });

  it('respects ?lang query first', () => {
    expect(detectLocale({ url: 'https://x/?lang=en', navigator: 'ko-KR' })).toBe('en');
  });

  it('falls back to localStorage', () => {
    localStorage.setItem('gamstory:locale', 'en');
    expect(detectLocale({ url: 'https://x/', navigator: 'ko-KR' })).toBe('en');
  });

  it('uses navigator next', () => {
    expect(detectLocale({ url: 'https://x/', navigator: 'en-US' })).toBe('en');
  });

  it('defaults to ko-KR', () => {
    expect(detectLocale({ url: 'https://x/', navigator: 'fr-FR' })).toBe('ko-KR');
  });

  it('rejects unsupported ?lang and falls through', () => {
    expect(detectLocale({ url: 'https://x/?lang=fr', navigator: 'en' })).toBe('en');
  });

  it('returns a Locale type', () => {
    const v: Locale = detectLocale({ url: 'https://x/', navigator: 'ko-KR' });
    expect(['ko-KR', 'en']).toContain(v);
  });
});
