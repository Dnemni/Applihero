import React from "react";

interface SecurityCardProps {
  email: string;
  onChangePassword: () => void;
}

export function SecurityCard({ email, onChangePassword }: SecurityCardProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Password &amp; Security</h2>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Email (cannot be changed)</label>
        <input
          type="email"
          value={email}
          disabled
          className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-600 cursor-not-allowed"
        />
      </div>
      <button
        onClick={onChangePassword}
        className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Change Password
      </button>
    </section>
  );
}
