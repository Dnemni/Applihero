import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Log In | Applihero',
  description: 'Log in to Applihero to access your AI-powered job application coaching dashboard.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
