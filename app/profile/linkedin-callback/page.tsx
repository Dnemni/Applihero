import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function LinkedInProfileCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Optionally, show a loading spinner or message
    // Redirect to profile with LinkedIn status
    const status = searchParams.get('status') || 'success';
    router.replace(`/profile?linkedin=${status}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Connecting LinkedIn...</h1>
        <p className="text-gray-700 mb-6">Please wait while we connect your LinkedIn account.</p>
      </div>
    </div>
  );
}
