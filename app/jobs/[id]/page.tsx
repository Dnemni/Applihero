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
  const [userId, setUserId] = useState<string>("");
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ jobTitle: "", companyName: "", jobDescription: "" });
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

    // Store user ID for chat
    setUserId(user.id);

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

  function handleOpenEdit() {
    if (!job) return;
    setEditForm({
      jobTitle: job.job_title,
      companyName: job.company_name,
      jobDescription: job.job_description || "",
    });
    setShowEditModal(true);
  }

  async function handleSaveEdit() {
    if (!job || !userId) return;
    
    setUpdating(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle: editForm.jobTitle,
          companyName: editForm.companyName,
          jobDescription: editForm.jobDescription,
          userId,
        }),
      });

      if (response.ok) {
        setShowEditModal(false);
        await loadJob();
        alert("Job updated and documents reingested!");
      } else {
        alert("Failed to update job");
      }
    } catch (err) {
      console.error('Update error:', err);
      alert("Failed to update job");
    }
    setUpdating(false);
  }

  async function handleDelete() {
    if (!job) return;
    
    if (!confirm(`Are you sure you want to delete this job application for ${job.company_name}? This will delete all related data including chat history and answers.`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert("Job deleted successfully");
        router.push("/dashboard");
      } else {
        alert("Failed to delete job");
        setDeleting(false);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert("Failed to delete job");
      setDeleting(false);
    }
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
              onClick={() => setShowDescriptionModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              View Description
            </button>
            <button
              onClick={handleOpenEdit}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all shadow-sm"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleting ? "Deleting..." : "Delete"}
            </button>
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
                userId={userId}
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

      {/* View Description Modal */}
      {showDescriptionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowDescriptionModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Job Description</h2>
                <button onClick={() => setShowDescriptionModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
              {job.job_description ? (
                <div className="prose prose-sm max-w-none">
                  <p className="whitespace-pre-wrap text-gray-700">{job.job_description}</p>
                </div>
              ) : (
                <p className="text-gray-500 italic">No job description available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !updating && setShowEditModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Edit Job Details</h2>
                <button onClick={() => !updating && setShowEditModal(false)} className="text-gray-400 hover:text-gray-600" disabled={updating}>
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)] space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                <input
                  type="text"
                  value={editForm.jobTitle}
                  onChange={e => setEditForm({...editForm, jobTitle: e.target.value})}
                  disabled={updating}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company *</label>
                <input
                  type="text"
                  value={editForm.companyName}
                  onChange={e => setEditForm({...editForm, companyName: e.target.value})}
                  disabled={updating}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
                <textarea
                  rows={10}
                  value={editForm.jobDescription}
                  onChange={e => setEditForm({...editForm, jobDescription: e.target.value})}
                  disabled={updating}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-indigo-500/70 focus:ring-2 disabled:opacity-50"
                />
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> Updating will delete and reingest all documents for this job, which may take a few seconds.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowEditModal(false)}
                disabled={updating}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updating || !editForm.jobTitle.trim() || !editForm.companyName.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? "Saving & Reingesting..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
