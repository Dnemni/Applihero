import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Your Password | Applihero',
  description: 'Reset your Applihero account password and regain access to your job application coaching dashboard.',
  robots: {
    index: false,
    follow: true,
  },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
