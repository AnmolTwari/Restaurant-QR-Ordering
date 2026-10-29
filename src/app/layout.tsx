import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DineFlow QR — Multi-Restaurant Ordering Platform',
  description:
    'High-performance multi-tenant QR code restaurant ordering SaaS with kitchen display, waiter dispatch, and contactless guest menus.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased selection:bg-orange-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
