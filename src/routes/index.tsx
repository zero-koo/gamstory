import { createFileRoute } from '@tanstack/react-router';
import { useI18n } from '~/lib/i18n/I18nProvider';

export const Route = createFileRoute('/')({ component: HomeRoute });

function HomeRoute() {
  const { t, locale, setLocale } = useI18n();
  return (
    <main data-testid="home-root" className="min-h-screen p-6">
      <h1 className="text-2xl font-semibold">{t('common.appName')}</h1>
      <p data-testid="home-boot-msg">{t('common.boot.ok')}</p>
      <button onClick={() => setLocale(locale === 'ko-KR' ? 'en' : 'ko-KR')} className="mt-4 underline">
        {locale === 'ko-KR' ? 'English' : '한국어'}
      </button>
    </main>
  );
}
