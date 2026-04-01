'use client';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();

  function switchLocale() {
    const next = locale === 'de' ? 'en' : 'de';
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }

  return (
    <button
      onClick={switchLocale}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
      title={locale === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'}
    >
      {locale === 'de' ? 'EN' : 'DE'}
    </button>
  );
}
