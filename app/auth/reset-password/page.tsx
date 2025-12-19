"use client";

import { useState, FormEvent, useEffect } from "react";
import { PasswordStrengthBar, getPasswordStrength } from "@/components/PasswordStrengthBar";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validatingToken, setValidatingToken] = useState(true);

  useEffect(() => {
    // Check if user has a valid session from the reset link
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Invalid or expired reset link. Please request a new one.");
      }
      setValidatingToken(false);
    };
    checkSession();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const { valid, reasons } = getPasswordStrength(password);
    if (!valid) {
      setError("Password is not strong enough: " + reasons.join(", "));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      // Success - redirect to login
      router.push("/login?reset=success");
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
      setLoading(false);
    }
  }

  if (validatingToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-900">Validating reset link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Top Navigation */}
      <div className="border-b border-gray-200/50 bg-white/60 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img src="/applihero_none.png" alt="Applihero Logo" className="h-10 w-10" />
            <span className="text-xl font-bold text-gray-900">Applihero</span>
          </a>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-100 mb-4">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-gray-900">
              Reset your password
            </h1>
            <p className="mt-3 text-lg text-gray-600">
              Choose a new password for your account
            </p>
          </div>

          <div className="rounded-3xl bg-white/80 backdrop-blur-xl shadow-2xl p-8 border border-gray-100">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-800">{error}</p>
                {error.includes("Invalid or expired") && (
                  <a
                    href="/forgot-password"
                    className="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Request new reset link →
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  New password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading || error?.includes("Invalid or expired")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                  minLength={8}
                  autoComplete="new-password"
                />
                <PasswordStrengthBar password={password} />
                <ul className="mt-1 text-xs text-gray-500 space-y-0.5">
                  <li>• At least 8 characters</li>
                  <li>• At least one uppercase letter</li>
                  <li>• At least one number</li>
                  <li>• At least one special character</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading || error?.includes("Invalid or expired")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="••••••••"
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading || error?.includes("Invalid or expired")}
                className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Resetting password..." : "Reset password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
