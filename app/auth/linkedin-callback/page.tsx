
export default function LinkedInCallbackPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">LinkedIn OAuth Disabled</h1>
        <p className="text-gray-700 mb-6">LinkedIn sign-in is no longer supported. Please connect your LinkedIn account from your profile integrations.</p>
        <a
          href="/profile"
          className="inline-block bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition"
        >
          Go to Profile
        </a>
      </div>
    </div>
  );
}

