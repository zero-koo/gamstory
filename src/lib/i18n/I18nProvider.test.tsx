import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, useI18n } from './I18nProvider';

function Probe() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <span data-testid="msg">{t('common.boot.ok')}</span>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => setLocale('en')}>en</button>
    </>
  );
}

describe('I18nProvider', () => {
  it('renders Korean by default and switches to English', () => {
    render(<I18nProvider initialLocale="ko-KR"><Probe /></I18nProvider>);
    expect(screen.getByTestId('msg').textContent).toBe('기반이 부팅되었습니다.');
    fireEvent.click(screen.getByText('en'));
    expect(screen.getByTestId('msg').textContent).toBe('Foundation booted.');
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });
});
