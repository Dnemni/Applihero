import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Your Account | Applihero',
  description: 'Create an Applihero account to get AI-powered resume, application, and interview coaching.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function SignupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
