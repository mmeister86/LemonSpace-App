/**
 * Onboarding note:
 * Internationalization module for request. Keep locale routing and message loading centralized here.
 */

import { getRequestConfig } from 'next-intl/server';
import { routing } from '../routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  const locales = routing.locales;
  type Locale = (typeof locales)[number];

  if (!locale || !locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    timeZone: 'Europe/Berlin',
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
