"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { JobService } from "@/lib/supabase/services";
import type { JobWithQuestions } from "@/lib/supabase/types";
import { ChatPanel } from "../../../components/chat";
import { AnswerEditorPanel } from "../../../components/answer-editor";

export default function JobPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [fullscreen, setFullscreen] = useState<null | 'chat' | 'answer'>(null);
  const [job, setJob] = useState<JobWithQuestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    checkAuthAndLoadJob();
  }, [params.id]);

  async function checkAuthAndLoadJob() {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push("/login"), 1500);
      return;
    }

    // Load job data
    await loadJob();
  }

  async function loadJob() {
    setLoading(true);
    const jobData = await JobService.getJobById(params.id);
    
    if (!jobData) {
      // Job not found or doesn't belong to user
      router.push("/dashboard");
      return;
    }

    setJob(jobData);
    setLoading(false);
  }

  async function handleSubmitApplication() {
    if (!job) return;
    
    if (!confirm("Are you sure you want to mark this application as submitted?")) {
      return;
    }

    setSubmitting(true);
    const updated = await JobService.updateJobStatus(job.id, "Submitted");
    
    if (updated) {
      setJob({ ...job, status: "Submitted" });
      alert("Application marked as submitted!");
    } else {
      alert("Failed to update application status");
    }
    
    setSubmitting(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function getStatusStyle(status: string) {
    const styles: Record<string, string> = {
      "Draft": "bg-gray-100 text-gray-800",
      "In Progress": "bg-blue-100 text-blue-800",
      "Submitted": "bg-green-100 text-green-800",
      "Archived": "bg-gray-100 text-gray-700",
    };
    return styles[status] || styles["Draft"];
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
          <p className="text-gray-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return null;
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <div className="max-w-[1800px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <a 
                href="/dashboard"
                className="inline-flex items-center text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to dashboard
              </a>
              <span className="text-gray-400">|</span>
              <a 
                href="/profile"
                className="inline-flex items-center text-sm text-gray-600 hover:text-indigo-600 transition-colors"
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </a>
              <span className="text-gray-400">|</span>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center text-sm text-gray-600 hover:text-red-600 transition-colors"
              >
                <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{job.job_title}</h1>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {job.company_name}
              </span>
              <span className="text-gray-400">•</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(job.status)}`}>
                {job.status}
              </span>
              <span className="text-gray-400">•</span>
              <span>{job.questions?.length || 0} questions</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSubmitApplication}
              disabled={submitting || job.status === "Submitted"}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {job.status === "Submitted" ? "Application Submitted" : submitting ? "Submitting..." : "Submit Application"}
            </button>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="flex gap-6 xl:gap-8">
          {/* Chat Panel or Minimized Bar */}
          {fullscreen === 'answer' ? (
            <button
              onClick={() => setFullscreen(null)}
              className="group relative w-16 rounded-3xl bg-gradient-to-b from-indigo-100 via-blue-50 to-indigo-50 shadow-lg hover:shadow-xl hover:w-20 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 py-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-400 shadow-md group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-700 whitespace-nowrap origin-center -rotate-90 group-hover:text-indigo-600 transition-colors">
                    Coaching Chat
                  </span>
                </div>
                <svg className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ) : (
            <div className={fullscreen === 'chat' ? 'flex-1' : 'flex-1'}>
              <ChatPanel
                jobId={job.id}
                fullscreen={fullscreen === 'chat'}
                onToggleFullscreen={() => setFullscreen(fullscreen === 'chat' ? null : 'chat')}
              />
            </div>
          )}

          {/* Answer Editor Panel or Minimized Bar */}
          {fullscreen === 'chat' ? (
            <button
              onClick={() => setFullscreen(null)}
              className="group relative w-16 rounded-3xl bg-gradient-to-b from-purple-100 via-pink-50 to-purple-50 shadow-lg hover:shadow-xl hover:w-20 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 py-8">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-400 shadow-md group-hover:scale-110 transition-transform">
                  <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-sm font-bold text-gray-700 whitespace-nowrap origin-center -rotate-90 group-hover:text-purple-600 transition-colors">
                    App Questions
                  </span>
                </div>
                <svg className="h-5 w-5 text-gray-400 group-hover:text-purple-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </div>
            </button>
          ) : (
            <div className={fullscreen === 'answer' ? 'flex-1' : 'flex-1'}>
              <AnswerEditorPanel
                jobId={job.id}
                questions={job.questions || []}
                onQuestionsChange={loadJob}
                fullscreen={fullscreen === 'answer'}
                onToggleFullscreen={() => setFullscreen(fullscreen === 'answer' ? null : 'answer')}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
