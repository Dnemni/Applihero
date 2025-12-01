"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { JobService } from "@/lib/supabase/services";

export default function NewJobPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [referralName, setReferralName] = useState("");
  const [referralCompany, setReferralCompany] = useState("");
  const [referralTitle, setReferralTitle] = useState("");
  const [referralLinkedIn, setReferralLinkedIn] = useState("");
  const [referralRelation, setReferralRelation] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push("/login"), 1500);
      return;
    }
    setLoading(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!jobTitle.trim() || !company.trim()) {
      alert("Please fill in job title and company");
      return;
    }

    setSubmitting(true);

    try {
      // Create the job
      const newJob = await JobService.createJob(
        jobTitle,
        company,
        description || undefined
      );

      if (!newJob) {
        alert("Failed to create job application");
        setSubmitting(false);
        return;
      }

      // Create referral if provided
      if (referralName.trim()) {
        try {
          await JobService.createReferral(newJob.id, {
            person_name: referralName,
            company: referralCompany || null,
            title: referralTitle || null,
            linkedin_url: referralLinkedIn || null,
            relation: referralRelation || null,
          });
        } catch (error) {
          console.error("Error creating referral:", error);
          // Don't block job creation if referral fails
        }
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Ingest documents into RAG system (wait for completion)
        try {
          const ingestResponse = await fetch(`/api/jobs/${newJob.id}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id }),
          });

          if (!ingestResponse.ok) {
            console.warn("Document ingestion failed, but continuing...");
          }
        } catch (err) {
          console.error("Failed to ingest documents:", err);
          // Don't block navigation on ingestion failure
        }
      }

      // Navigate to the job page
      router.push(`/jobs/${newJob.id}`);
    } catch (error) {
      console.error("Error creating job:", error);
      alert("Failed to create job application");
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (redirecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-900 mb-2">Not authenticated</p>
          <p className="text-sm text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      {/* Top Navigation */}
      <div className="border-b border-gray-200/50 bg-white/60 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center">
              <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-gray-900">Applihero</span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/profile"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white/80 backdrop-blur-sm px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white hover:border-gray-400 transition-all"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </a>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-all"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="w-full max-w-2xl space-y-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">New application</h1>
            <p className="text-sm text-gray-600">
              Paste the job details so AppliHero can coach you.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job title *</label>
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  disabled={submitting}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Applied Scientist Intern"
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <label className="block text-sm font-medium text-gray-700 mb-3">Referral (optional)</label>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Person's name</label>
                    <input
                      type="text"
                      value={referralName}
                      onChange={(e) => setReferralName(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                    <input
                      type="text"
                      value={referralCompany}
                      onChange={(e) => setReferralCompany(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="OpenAI"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
                    <input
                      type="text"
                      value={referralTitle}
                      onChange={(e) => setReferralTitle(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Senior Engineer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">LinkedIn URL</label>
                    <input
                      type="url"
                      value={referralLinkedIn}
                      onChange={(e) => setReferralLinkedIn(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="https://linkedin.com/in/johndoe"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">How you know them</label>
                    <input
                      type="text"
                      value={referralRelation}
                      onChange={(e) => setReferralRelation(e.target.value)}
                      disabled={submitting}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      placeholder="Former colleague, College friend, etc."
                    />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                required
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="OpenAI"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job description (optional)</label>
              <textarea
                rows={8}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={submitting}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Paste the full job description here..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Creating..." : "Create job session"}
              </button>
              <a
                href="/dashboard"
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
