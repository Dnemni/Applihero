import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | Applihero',
  description: "Read Applihero's Privacy Policy to learn how we collect, use, protect, and manage your personal information.",
  alternates: {
    canonical: 'https://www.applihero.com/privacy-policy',
  },
};

export default function PrivacyPolicyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
