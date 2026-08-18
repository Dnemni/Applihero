import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from "@vercel/speed-insights/next"
import './globals.css';
import { ToastContainer } from '@/components/toast';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.applihero.com'),
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
      <head>
        {/* Google tag (gtag.js) */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-PXBY8KSB08"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-PXBY8KSB08');`,
          }}
        />
      </head>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
        <ToastContainer />
      </body>
    </html>
  );
}
