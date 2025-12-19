import React from "react";

interface DangerZoneCardProps {
  onDeleteAccount: () => void;
}

export function DangerZoneCard({ onDeleteAccount }: DangerZoneCardProps) {
  return (
    <section className="rounded-xl border border-red-200 bg-red-50 p-6 flex flex-col h-full">
      <h2 className="text-lg font-semibold text-red-900 mb-2">Danger Zone</h2>
      <p className="text-sm text-red-700 mb-4">
        Permanently delete your account and all your data. This action cannot be undone.
      </p>
      <button
        onClick={onDeleteAccount}
        className="rounded-lg bg-red-600 text-white px-4 py-2 font-semibold hover:bg-red-700 transition self-start"
      >
        Delete account
      </button>
    </section>
  );
}
