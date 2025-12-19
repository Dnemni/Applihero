import React from "react";

interface PreferencesCardProps {
  emailNotifications: boolean;
  marketingEmails: boolean;
  onToggleEmailNotifications: () => void;
  onToggleMarketingEmails: () => void;
}

export function PreferencesCard({
  emailNotifications,
  marketingEmails,
  onToggleEmailNotifications,
  onToggleMarketingEmails,
}: PreferencesCardProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h2>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Email notifications</p>
            <p className="text-xs text-gray-500">Receive updates about your applications</p>
          </div>
          <button
            onClick={onToggleEmailNotifications}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailNotifications ? "bg-indigo-600" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailNotifications ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Marketing emails</p>
            <p className="text-xs text-gray-500">Receive tips and updates from AppliHero</p>
          </div>
          <button
            onClick={onToggleMarketingEmails}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${marketingEmails ? "bg-indigo-600" : "bg-gray-200"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${marketingEmails ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>
    </section>
  );
}
