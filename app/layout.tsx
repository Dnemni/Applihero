import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { ToastContainer } from '@/components/toast';

export const metadata: Metadata = {
  title: 'Applihero - AI-Powered Job Application Coaching',
  description: 'AI-powered coaching to land your dream job',
  icons: {
    icon: '/applihero.PNG',
    shortcut: '/applihero.PNG',
    apple: '/applihero.PNG',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <ToastContainer />
      </body>
    </html>
  );
}