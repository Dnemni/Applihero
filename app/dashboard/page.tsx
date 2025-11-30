"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { JobService } from "@/lib/supabase/services";
import type { Job } from "@/lib/supabase/types";

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
  const [jobs, setJobs] = useState<JobSessionCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    checkAuthAndLoadJobs();
  }, []);

  async function checkAuthAndLoadJobs() {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push("/login"), 1500);
      return;
    }

    // Get user name
    const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || "there";
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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {userName ? `Welcome back, ${userName.split(' ')[0]}!` : "Your applications"}
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              {jobs.length === 0 ? "Start tracking your job applications" : "Track roles you're applying to and jump back into coaching."}
            </p>
          </div>
        <a
          href="/dashboard/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New application
        </a>
      </div>

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
          <div className="grid gap-6 md:grid-cols-2">
            {jobs.map((job) => {
              const statusInfo = getStatusDisplay(job.status);
              return (
                <a
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group relative rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-xl p-6 shadow-xl hover:shadow-2xl hover:border-indigo-300 transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-base font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">{job.title}</h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
                        <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        {job.company}
                      </p>
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusInfo.style}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatLastTouched(job.lastTouched)}
                    </span>
                  </div>
                  
                  <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
