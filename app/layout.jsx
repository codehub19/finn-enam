import '../public/styles.css';

export const metadata = {
  title: 'FINN | Investor intelligence',
  description: 'FINN investor intelligence',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  appleWebApp: { capable: true }
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0A3C6E' };

export default function Layout({ children }) {
  return <html lang="en" data-theme="light" suppressHydrationWarning><body>{children}</body></html>;
}
