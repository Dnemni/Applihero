"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { JobService } from "@/lib/supabase/services";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import { Header } from "@/components/header";
import type { OnboardingStep } from "@/components/onboarding-overlay";
import {
  getOnboardingState,
  setOnboardingState,
  advanceOnboarding,
  shouldShowOnboarding
} from "@/lib/onboarding-state";

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
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const onboardingSteps: OnboardingStep[] = [
    {
      title: "Create Your First Job Application 🚀",
      description: "This is where you'll add a new job you're applying to. Fill out the job details and Applihero will analyze everything to help you craft personalized answers. Let's get started!",
      position: "center",
    },
    {
      title: "Job Title",
      description: "Click the highlighted field and enter the position title you're applying for (e.g., 'Software Engineer'). This helps the AI understand the role.",
      targetId: "job-title-input",
      position: "bottom",
    },
    {
      title: "Company Name",
      description: "Enter the company name here. The AI will use this to provide company-specific insights when coaching you.",
      targetId: "company-input",
      position: "bottom",
    },
    {
      title: "Job Description",
      description: "Paste the full job description here. The AI will analyze it to understand what skills and experience the company is looking for. This is key to getting personalized guidance!",
      targetId: "description-input",
      position: "top",
    },
    {
      title: "Referral Info (Optional)",
      description: "If you have a referral, you can add their information here. This is optional but helps track your connections. Feel free to skip this for now.",
      targetId: "referral-section",
      position: "left",
    },
    {
      title: "Submit Your Application",
      description: "Ready to go? Click the highlighted 'Create job session' button! The AI will analyze everything and take you to your personalized coaching workspace.",
      targetId: "submit-button",
      position: "top",
    },
  ];

  useEffect(() => {
    checkAuth();

    // Check if we should show job-creation onboarding
    if (shouldShowOnboarding('job-creation')) {
      setShowOnboarding(true);
      setOnboardingStep(0);
    }
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

      // Store job ID in onboarding state if onboarding is active
      const state = getOnboardingState();
      if (state && state.phase === 'job-creation') {
        setOnboardingState({
          ...state,
          phase: 'job-detail',
          step: 0,
          jobId: newJob.id,
        });
      }

      // Navigate to the job page
      router.push(`/jobs/${newJob.id}`);
    } catch (error) {
      console.error("Error creating job:", error);
      alert("Failed to create job application");
      setSubmitting(false);
    }
  }


  function handleOnboardingNext() {
    if (onboardingStep < onboardingSteps.length - 1) {
      setOnboardingStep(onboardingStep + 1);
    }
  }

  function handleOnboardingPrevious() {
    if (onboardingStep > 0) {
      setOnboardingStep(onboardingStep - 1);
    }
  }

  function handleOnboardingSkip() {
    setShowOnboarding(false);
    // Advance to job-detail phase
    advanceOnboarding('job-creation', 'job-detail');
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    // Advance to job-detail phase
    advanceOnboarding('job-creation', 'job-detail');
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
      <Header showProfile />

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
                  id="job-title-input"
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  required
                  disabled={submitting}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Applied Scientist Intern"
                />
              </div>

              <div id="referral-section" className="rounded-lg border border-gray-200 bg-white p-4">
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
                id="company-input"
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
                id="description-input"
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
                id="submit-button"
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

      {/* Onboarding Overlay */}
      {showOnboarding && (
        <OnboardingOverlay
          steps={onboardingSteps}
          currentStep={onboardingStep}
          onNext={handleOnboardingNext}
          onPrevious={handleOnboardingPrevious}
          onSkip={handleOnboardingSkip}
          onComplete={handleOnboardingComplete}
          showProgress={true}
        />
      )}
    </div>
  );
}
