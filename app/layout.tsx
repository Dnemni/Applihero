import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}