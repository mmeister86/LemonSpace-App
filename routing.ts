/**
 * Onboarding note:
 * Shared routing helper for middleware and navigation. Keep path constants centralized to avoid auth redirect drift.
 */

import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['de', 'en'],
  defaultLocale: 'de',
  localePrefix: 'never',
});
