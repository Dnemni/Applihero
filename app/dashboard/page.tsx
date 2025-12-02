"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { JobService, ProfileService } from "@/lib/supabase/services";
import type { Job } from "@/lib/supabase/types";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import { Header } from "@/components/header";
import {
  getOnboardingState,
  advanceOnboarding,
  shouldShowOnboarding
} from "@/lib/onboarding-state";

type JobSessionCard = {
  id: string;
  title: string;
  company: string;
  status: "Draft" | "In Progress" | "Submitted" | "Archived";
  lastTouched: string;
  questionCount: number;
};

const statusStyles = {
  "Draft": "bg-gray-100 text-gray-800 ring-gray-600/20",
  "In Progress": "bg-blue-100 text-blue-800 ring-blue-600/20",
  "Submitted": "bg-green-100 text-green-800 ring-green-600/20"
};

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<JobSessionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [userName, setUserName] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  const onboardingSteps = [
    {
      title: "Profile Complete! 🎉",
      description: "Excellent work setting up your profile! Now let's explore your dashboard where you'll manage all your job applications. Click 'Next' to continue.",
      position: "center" as const,
    },
    {
      title: "Your Dashboard",
      description: "This is your command center. Here you'll see all your job applications, their status, and when you last worked on them. Each card represents a different job you're tracking.",
      targetId: "dashboard-content",
      position: "center" as const,
    },
    {
      title: "Create Your First Application",
      description: "Ready to get started? Click the highlighted 'New application' button to add your first job! You'll paste the job description and Applihero will help you craft personalized answers.",
      targetId: "new-application-button",
      position: "bottom" as const,
    },
  ];

  useEffect(() => {
    checkAuthAndLoadJobs();

    // Check if we should show dashboard onboarding
    if (shouldShowOnboarding('dashboard')) {
      setShowOnboarding(true);
      setOnboardingStep(0);
    }
  }, []);

  async function checkAuthAndLoadJobs() {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push("/login"), 1500);
      return;
    }

    // Get user name from profile
    const profile = await ProfileService.getCurrentProfile();
    let fullName = "there";
    
    if (profile?.first_name && profile?.last_name) {
      fullName = `${profile.first_name} ${profile.last_name}`;
    } else if (user.user_metadata?.first_name && user.user_metadata?.last_name) {
      fullName = `${user.user_metadata.first_name} ${user.user_metadata.last_name}`;
    } else if (user.user_metadata?.full_name) {
      fullName = user.user_metadata.full_name;
    } else if (user.email) {
      fullName = user.email.split('@')[0];
    }
    
    setUserName(fullName);

    // Load jobs
    await loadJobs();
  }

  async function loadJobs() {
    setLoading(true);
    const jobsData = await JobService.getAllJobs();

    if (jobsData) {
      const formattedJobs: JobSessionCard[] = jobsData.map(job => ({
        id: job.id,
        title: job.job_title,
        company: job.company_name,
        status: job.status,
        lastTouched: job.last_touched_at || job.updated_at,
        questionCount: 0 // Will be updated when we load questions
      }));
      setJobs(formattedJobs);
    }

    setLoading(false);
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
    // Advance to job-creation phase
    advanceOnboarding('dashboard', 'job-creation');
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    // Advance to job-creation phase
    advanceOnboarding('dashboard', 'job-creation');
  }

  function handleNewApplicationClick(e: React.MouseEvent) {
    // If we're on the last onboarding step (step 2), complete the onboarding
    if (showOnboarding && onboardingStep === 2) {
      e.preventDefault();
      handleOnboardingComplete();
      // Navigate after a short delay
      setTimeout(() => {
        router.push('/dashboard/new');
      }, 300);
    }
    // Otherwise, let the link navigate normally
  }

  async function handleDeleteJob(jobId: string, jobTitle: string, companyName: string) {
    if (!confirm(`Are you sure you want to delete the application for ${jobTitle} at ${companyName}? This will delete all related data including chat history and answers.`)) {
      return;
    }

    setDeletingId(jobId);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Remove from UI
        setJobs(jobs.filter(j => j.id !== jobId));
        alert("Job deleted successfully");
      } else {
        alert("Failed to delete job");
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert("Failed to delete job");
    }
    setDeletingId(null);
    setOpenMenuId(null);
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

  function formatLastTouched(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 1) return "Just now";
    if (diffInHours < 24) return `${diffInHours}h ago`;
    if (diffInHours < 48) return "Yesterday";
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  }

  function getStatusDisplay(status: string): { label: string; style: string } {
    const statusMap: Record<string, { label: string; style: string }> = {
      "Draft": { label: "Draft", style: "bg-gray-100 text-gray-800 ring-gray-600/20" },
      "In Progress": { label: "In Progress", style: "bg-blue-100 text-blue-800 ring-blue-600/20" },
      "Submitted": { label: "Submitted", style: "bg-green-100 text-green-800 ring-green-600/20" },
      "Archived": { label: "Archived", style: "bg-gray-100 text-gray-700 ring-gray-500/20" },
    };
    return statusMap[status] || statusMap["Draft"];
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col">
      <Header showProfile />

      <div className="max-w-7xl mx-auto px-8 py-12 flex-1 w-full">
        <div className="mb-8 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 text-left">
              {userName && userName !== "there" ? `Welcome back, ${userName}!` : "Your applications"}
            </h1>
            <p className="mt-2 text-lg text-gray-600 text-left">
              {jobs.length === 0 ? "Start tracking your job applications" : "Track roles you're applying to and continue inquiring."}
            </p>
          </div>
          <div className="ml-4 flex-shrink-0">
            <a
              id="new-application-button"
              href="/dashboard/new"
              onClick={handleNewApplicationClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New application
            </a>
          </div>
        </div>

        <div id="dashboard-content" className="w-full">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading your applications...</p>
              </div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">No applications yet</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating your first application.</p>
              <div className="mt-6">
                <a
                  href="/dashboard/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New application
                </a>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 w-full">
              {jobs.map((job) => {
                const statusInfo = getStatusDisplay(job.status);
                const isDeleting = deletingId === job.id;
                return (
                  <div
                    key={job.id}
                    className="group relative rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-xl p-6 shadow-xl hover:shadow-2xl hover:border-indigo-300 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between">
                      <a href={`/jobs/${job.id}`} className="flex-1">
                        <h2 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{job.title}</h2>
                        <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          {job.company}
                        </p>
                      </a>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusInfo.style}`}>
                          {statusInfo.label}
                        </span>
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId(openMenuId === job.id ? null : job.id);
                            }}
                            disabled={isDeleting}
                            className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>
                          {openMenuId === job.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                              <a
                                href={`/jobs/${job.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit Job
                              </a>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteJob(job.id, job.title, job.company);
                                }}
                                disabled={isDeleting}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                {isDeleting ? "Deleting..." : "Delete Job"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <a href={`/jobs/${job.id}`} className="block mt-3">
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatLastTouched(job.lastTouched)}
                        </span>
                      </div>
                    </a>

                    <a href={`/jobs/${job.id}`} className="absolute right-4 bottom-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Onboarding Overlay */}
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

      {/* Footer removed on dashboard */}
    </div>
  );
}
