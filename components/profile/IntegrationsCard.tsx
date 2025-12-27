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
  // LinkedIn integration is disabled
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <svg className="h-6 w-6 text-[#0077B5]" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        LinkedIn
      </h2>
      <div className="mt-2 text-red-600 font-semibold">LinkedIn integration is currently disabled.</div>
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
