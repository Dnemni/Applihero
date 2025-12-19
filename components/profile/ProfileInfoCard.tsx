import React from "react";

interface ProfileInfoCardProps {
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  onFirstNameChange: (v: string) => void;
  onLastNameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function ProfileInfoCard({
  firstName,
  lastName,
  email,
  bio,
  onFirstNameChange,
  onLastNameChange,
  onBioChange,
  onSave,
  onCancel,
  saving,
}: ProfileInfoCardProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-white">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
          <p className="text-sm text-gray-600">Update your personal details</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={firstName}
            onChange={e => onFirstNameChange(e.target.value)}
            disabled={saving}
            className="w-1/2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="First name"
          />
          <input
            type="text"
            value={lastName}
            onChange={e => onLastNameChange(e.target.value)}
            disabled={saving}
            className="w-1/2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Last name"
          />
        </div>
        <div>
          <input
            type="email"
            value={email}
            disabled
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 cursor-not-allowed"
            placeholder="Email address"
          />
          <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
        </div>
        <div>
          <textarea
            rows={3}
            value={bio}
            onChange={e => onBioChange(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Tell us about yourself..."
          />
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </section>
  );
}
