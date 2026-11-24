import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { getT } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { ToastProvider } from '@/components/ui/toast';
import { SwRegister } from '@/components/sw-register';
import { ErrorReporter } from '@/components/error-reporter';

export const metadata: Metadata = {
  title: { default: 'PoulGo', template: '%s · PoulGo' },
  description: 'Poultry trading, trips, deliveries and accounts — मराठी, हिंदी, English',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'PoulGo', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#F2F6F5',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, messages } = await getT();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale} messages={messages}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
        <SwRegister />
        <ErrorReporter />
      </body>
    </html>
  );
}
