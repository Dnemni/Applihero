import React from "react";

interface IntegrationsCardProps {
  linkedinProfile: {
    connected: boolean;
    name?: string;
    headline?: string;
    picture?: string;
  };
  linkedinLoading: boolean;
  onConnectLinkedIn: () => void;
}

interface PlaceholderIntegration {
  key: string;
  name: string;
  description: string;
  connected: boolean;
}

export function IntegrationsCard({
  linkedinProfile,
  linkedinLoading,
  onConnectLinkedIn,
  placeholderIntegrations = [],
}: IntegrationsCardProps & { placeholderIntegrations?: PlaceholderIntegration[] }) {
  // LinkedIn OAuth integration logic
  const handleConnectLinkedIn = async () => {
    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('linkedin_oauth_state', state);
    // Build LinkedIn OAuth URL
    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID;
    const redirectUri = `${window.location.origin}/api/profile/linkedin-callback`;
    const scope = 'openid profile email';
    const linkedinOAuthURL = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=${encodeURIComponent(scope)}`;
    window.location.href = linkedinOAuthURL;
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg className="h-6 w-6 text-[#0077B5]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        LinkedIn
      </h2>
      {linkedinLoading ? (
        <div className="flex items-center gap-2 mt-2"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0077B5]"></div> <span>Checking status...</span></div>
      ) : linkedinProfile.connected ? (
        <div className="mt-2 flex items-center gap-4">
          {linkedinProfile.picture && <img src={linkedinProfile.picture} alt="LinkedIn profile" className="h-12 w-12 rounded-full" />}
          <div>
            <div className="font-semibold text-gray-900">{linkedinProfile.name}</div>
            {linkedinProfile.headline && <div className="text-sm text-gray-600">{linkedinProfile.headline}</div>}
            <div className="text-green-600 text-xs font-medium mt-1">Connected</div>
          </div>
        </div>
      ) : (
        <button
          onClick={handleConnectLinkedIn}
          className="mt-3 px-4 py-2 rounded-lg bg-[#0077B5] text-white font-semibold hover:bg-[#005983] transition"
        >
          Connect LinkedIn
        </button>
      )}

      {/* Placeholder integrations */}
      {placeholderIntegrations.length > 0 && (
        <div className="mt-8 space-y-4">
          {placeholderIntegrations.map((integration) => (
            <div key={integration.key} className="rounded-lg border border-gray-100 bg-gray-50 p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-gray-900">{integration.name}</div>
                <div className="text-xs text-gray-600 mt-1">{integration.description}</div>
              </div>
              <button
                className="px-3 py-1.5 rounded bg-gray-200 text-gray-700 text-xs font-medium cursor-not-allowed opacity-60"
                disabled
              >
                Coming soon
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
