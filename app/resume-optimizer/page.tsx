"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { JobService, ProfileService } from "@/lib/supabase/services";
import type { Job, ResumeVersion } from "@/lib/supabase/types";
import { Download, Sparkles, ChevronRight, FileText, Save, Eye, ArrowRight } from "lucide-react";
import { toast } from "@/components/toast";
import { OnboardingOverlay } from "@/components/onboarding-overlay";
import type { OnboardingStep } from "@/components/onboarding-overlay";
import {
  getOnboardingState,
  setOnboardingState,
  advanceOnboarding,
  shouldShowOnboarding,
} from "@/lib/onboarding-state";

export default function ResumeOptimizerPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string>("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [resumeText, setResumeText] = useState<string>("");
  const [originalResumeText, setOriginalResumeText] = useState<string>("");
  const [resumeFileUrl, setResumeFileUrl] = useState<string>("");
  const [feedback, setFeedback] = useState<any>(null);
  const [feedbackScore, setFeedbackScore] = useState<number | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingResume, setLoadingResume] = useState(false);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [contentHash, setContentHash] = useState<string>("");
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showJobInfoModal, setShowJobInfoModal] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>("jake");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  const onboardingSteps: OnboardingStep[] = [
    {
      title: "Resume Optimizer 📄",
      description: "Welcome! Optimize your resume for specific jobs with AI-powered feedback.",
      position: "center",
    },
    {
      title: "Select a Job 💼",
      description: "Choose a job from your applications to tailor your resume to that specific role.",
      targetId: "job-selector",
      position: "right",
    },
    {
      title: "View Your Resume 👀",
      description: "Your uploaded resume is displayed here. Make edits in the text editor below.",
      targetId: "pdf-viewer",
      position: "bottom",
    },
    {
      title: "Edit Resume Text ✏️",
      description: "Edit your resume here. Changes will be saved when you click 'Save Version'.",
      targetId: "resume-editor",
      position: "top",
    },
    {
      title: "Get AI Feedback 🎯",
      description: "Click 'Request Feedback' to get AI analysis of how well your resume matches the job.",
      targetId: "request-feedback-btn",
      position: "bottom",
    },
    {
      title: "Review & Iterate 🔄",
      description: "After getting feedback, use 'Review Feedback' to see suggestions without regenerating.",
      targetId: "review-feedback-btn",
      position: "bottom",
    },
    {
      title: "Save & Download 💾",
      description: "Save your optimized version and download as PDF when ready to apply!",
      targetId: "action-buttons",
      position: "top",
    },
    {
      title: "You're All Set! 🎉",
      description: "Congratulations! You now know how to use Applihero. Add questions, draft answers, generate cover letters, add referrals, chat with the AI for help, request feedback, and iterate. When ready, click 'Submit Application' at the top. You've got this! 🚀",
      position: "center",
    },
  ];

  function hashContent(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  useEffect(() => {
    checkAuthAndLoadJobs();
    // Show onboarding overlay if onboarding_phase is 'resume-optimizer'
    (async () => {
      const profile = await ProfileService.getCurrentProfile();
      if (profile?.onboarding_phase === 'resume-optimizer') {
        setShowOnboarding(true);
        setOnboardingStep(0);
      }
    })();
  }, []);

  useEffect(() => {
    const currentHash = hashContent(resumeText);
    if (contentHash && currentHash !== contentHash) {
      setFeedback(null);
      setFeedbackScore(null);
    }
    setContentHash(currentHash);
  }, [resumeText, contentHash]);

  async function checkAuthAndLoadJobs() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push("/login"), 1500);
      return;
    }

    setUserId(user.id);
    await loadJobs();
    
    // Check if resume-optimizer onboarding should show
    const shouldShow = await shouldShowOnboarding("resume-optimizer");
    if (shouldShow) {
      setShowOnboarding(true);
      const state = await getOnboardingState();
      setOnboardingStep(state?.step || 0);
    }
  }

  async function loadJobs() {
    setLoadingJobs(true);
    try {
      const allJobs = await JobService.getAllJobs();
      setJobs(allJobs);
    } catch (error) {
      console.error("Error loading jobs:", error);
      toast.error("Failed to load jobs");
    } finally {
      setLoadingJobs(false);
    }
  }

  async function loadResume(jobId: string) {
    setLoadingResume(true);
    setFeedback(null);
    setFeedbackScore(null);
    try {
      const job = jobs.find(j => j.id === jobId);
      setSelectedJob(job || null);

      const response = await fetch(`/api/resume-optimizer/${jobId}?userId=${userId}`);
      let data: ResumeVersion | any = null;
      if (response.ok) {
        data = await response.json();
      }

      // If no resume version exists, create one using profile resume_url
      if (!data || (!data.optimized_text && !data.original_text)) {
        // Get profile info
        const profile = await ProfileService.getCurrentProfile();
        const resumeUrl = profile?.resume_url || "";
        const resumeText = profile?.resume_text || "No resume found. Please upload a resume in your profile.";

        // Create initial resume_versions row
        const createRes = await fetch(`/api/resume-optimizer/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            originalText: resumeText,
            optimizedText: resumeText,
            originalFileUrl: resumeUrl,
            currentUrl: resumeUrl,
            feedbackScore: null,
            feedbackText: null,
            latex_code: null,
          }),
        });
        if (createRes.ok) {
          data = await createRes.json();
        }
      }

      // Set resume text and file URL
      if (data.optimized_text) {
        setResumeText(data.optimized_text);
        setOriginalResumeText(data.original_text || data.optimized_text);
      } else {
        await loadProfileResume();
        setLoadingResume(false);
        return;
      }

      // Get the file path (current_url or original_file_url or profile resume_url)
      let filePath = data.current_url || data.original_file_url || "";
      if (!filePath) {
        const profile = await ProfileService.getCurrentProfile();
        filePath = profile?.resume_url || "";
      }

      // Generate signed URL from path
      let resumeUrl = "";
      if (filePath) {
        if (filePath.startsWith('http')) {
          resumeUrl = filePath;
        } else {
          try {
            const { data: signedData, error: signedError } = await supabase.storage
              .from('resumes')
              .createSignedUrl(filePath, 3600);
            if (signedError) throw signedError;
            resumeUrl = signedData.signedUrl;
          } catch (storageError) {
            console.warn("Could not generate signed URL:", storageError);
          }
        }
      }
      setResumeFileUrl(resumeUrl);

      if (data.feedback_score) {
        setFeedbackScore(data.feedback_score);
      }
      if (data.feedback_text) {
        setFeedback(data.feedback_text);
      }
    } catch (error) {
      console.error("Error loading resume:", error);
      await loadProfileResume();
    } finally {
      setLoadingResume(false);
    }
  }

  async function loadProfileResume() {
    try {
      const profile = await ProfileService.getCurrentProfile();
      const text = profile?.resume_text || "No resume found. Please upload a resume in your profile.";
      setResumeText(text);
      setOriginalResumeText(text);
      
      // Get signed URL if resume_url exists
      let resumeUrl = "";
      if (profile?.resume_url) {
        // If it's already a full URL, use it as is
        if (profile.resume_url.startsWith('http')) {
          resumeUrl = profile.resume_url;
        } else {
          try {
            // Generate a signed URL for private bucket (valid for 1 hour)
            const { data, error } = await supabase.storage
              .from('resumes')
              .createSignedUrl(profile.resume_url, 3600);
            
            if (error) throw error;
            resumeUrl = data.signedUrl;
          } catch (storageError) {
            console.warn("Could not generate signed URL:", storageError);
            // Leave resumeUrl empty - will show fallback message
          }
        }
      }
      setResumeFileUrl(resumeUrl);
    } catch (error) {
      console.error("Error loading profile resume:", error);
      toast.error("Failed to load resume");
    }
  }

  async function requestFeedback() {
    if (!selectedJobId || !resumeText) {
      toast.warning("Please select a job and ensure resume is loaded");
      return;
    }

    if (!resumeText.trim() || resumeText.trim().length < 100) {
      toast.warning("Please add more content to your resume before requesting feedback");
      return;
    }

    setLoadingFeedback(true);
    setShowFeedbackModal(true);
    setFeedback(null);
    setFeedbackScore(null);

    try {
      const response = await fetch("/api/resume-optimizer/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJobId,
          jobTitle: selectedJob?.job_title,
          company: selectedJob?.company_name,
          jobDescription: selectedJob?.job_description,
          resumeText,
          userId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const score = data.score || 0;
        const fb = data.feedback || null;

        // Update local state for fast access
        setFeedbackScore(score);
        setFeedback(fb);
        setContentHash(hashContent(resumeText));

        // Persist feedback to the latest resume version without creating a new one
        if (selectedJobId && userId) {
          try {
            await fetch(`/api/resume-optimizer/${selectedJobId}/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                feedbackScore: score,
                feedbackText: fb,
              }),
            });
          } catch (persistError) {
            console.error("Error persisting feedback to backend:", persistError);
          }
        }

        toast.success("Feedback generated!");
      } else {
        toast.error("Failed to generate feedback");
        setShowFeedbackModal(false);
      }
    } catch (error) {
      console.error("Error generating feedback:", error);
      toast.error("Failed to generate feedback");
      setShowFeedbackModal(false);
    } finally {
      setLoadingFeedback(false);
    }
  }

  function reviewFeedback() {
    if (!feedback || !feedbackScore) {
      toast.info("No feedback available yet. Click 'Request Feedback' first.");
      return;
    }
    setShowFeedbackModal(true);
  }

  async function saveOptimizedResume() {
    if (!selectedJobId) return;
    setIsSaving(true);
    setLoadingResume(true); // Show loading animation in PDF previewer
    try {
      // 0. Delete initial resume_versions row if exists (always, not just if file is not resume.pdf)
      await fetch(`/api/resume-optimizer/${selectedJobId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      // 1. Generate LaTeX using LLM API
      // IMPORTANT: The LLM MUST NOT change any actual wording from newText.
      // It may only change layout/ordering/sectioning to match the chosen style.
      let styleHint = "Use Jake's original resume style and layout, preserving the same overall structure and typography as the existing Jake template while keeping every word from NEW_CONTENT unchanged.";

      if (selectedStyle === "jake") {
        styleHint = "Use Jake's original resume style and layout, preserving the same overall structure and typography as the existing Jake template while keeping every word from NEW_CONTENT unchanged.";
      } else if (selectedStyle === "modern") {
        styleHint = "Use a clean, modern tech resume style with clear section headings, strong hierarchy, and generous white space. Keep all wording from NEW_CONTENT exactly the same, but you may reorganize sections and bullets to feel modern and scannable for tech recruiters.";
      } else if (selectedStyle === "classic") {
        styleHint = "Use a classic professional resume style similar to traditional corporate resumes, with conservative typography, clear section dividers, and minimal graphic elements. Do not change any wording from NEW_CONTENT; only adjust formatting and ordering to fit this classic style.";
      } else if (selectedStyle === "onepage") {
        styleHint = "Ensure the resume fits cleanly on a single US letter page with tight but readable spacing. You may shorten spacing, adjust section ordering, and rebalance line breaks, but you must not change any of the actual words or sentences from NEW_CONTENT.";
      } else if (selectedStyle === "chronological") {
        styleHint = "Use a chronological resume format that clearly lists work experience in reverse chronological order with aligned dates, job titles, company names, and concise bullet points. Keep all wording from NEW_CONTENT exactly the same while restructuring sections to emphasize the work history timeline.";
      } else if (selectedStyle === "functional") {
        styleHint = "Use a functional resume format that emphasizes skills and qualifications grouped by theme at the top, with work history de-emphasized and summarized in a brief list later. Preserve every word from NEW_CONTENT, only reorganizing which sentences and bullets appear under which section.";
      } else if (selectedStyle === "combination") {
        styleHint = "Use a combination resume format that starts with a strong skills/qualifications summary section, followed by a detailed reverse-chronological work history section. All wording from NEW_CONTENT must remain identical; only section grouping, ordering, and LaTeX structure should change.";
      }
      const llmResponse = await fetch("/api/resume/generate-latex-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldLatex: undefined,
          oldPdfUrl: resumeFileUrl,
          newText: resumeText,
          styleHint,
        }),
      });
      if (!llmResponse.ok) throw new Error("Failed to generate LaTeX");
      const { latex } = await llmResponse.json();
      if (!latex) throw new Error("No LaTeX code returned");

      // 2. Compile PDF using your existing compile API
      const compileResponse = await fetch("/api/latex/compile-wasm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex }),
      });
      if (!compileResponse.ok) throw new Error("Failed to compile PDF");
      const pdfBlob = await compileResponse.blob();

      // 3. Upload to Supabase storage
      const fileName = `resume-${selectedJobId}-${Date.now()}.pdf`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(`${userId}/${fileName}`, pdfBlob, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw uploadError;
      }

      // 4. Generate signed URL
      const filePath = `${userId}/${fileName}`;
      const { data: signedData, error: signedError } = await supabase.storage
        .from("resumes")
        .createSignedUrl(filePath, 3600);
      if (signedError) {
        console.error("Signed URL error:", signedError);
        throw signedError;
      }

      // 5. Save version with file path and latex_code
      const response = await fetch(`/api/resume-optimizer/${selectedJobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          originalText: originalResumeText,
          optimizedText: resumeText,
          originalFileUrl: resumeFileUrl,
          currentUrl: filePath,
          feedbackScore: feedbackScore,
          feedbackText: feedback,
          latex_code: latex,
        }),
      });
      if (response.ok) {
        await response.json();
        setResumeFileUrl(signedData.signedUrl);

        // After saving, update the editor text to better reflect the
        // formatting/line breaks used in the final PDF. This uses the
        // existing extract-text.cjs script locally; in production you
        // would likely run this as a background job using the stored
        // PDF path.
        try {
          const pdfText = await fetch("/api/resume/extract-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pdfUrl: signedData.signedUrl }),
          });
          if (pdfText.ok) {
            const { text } = await pdfText.json();
            if (text && typeof text === "string") {
              setResumeText(text);
            }
          }
        } catch (extractError) {
          console.error("Error extracting text from generated PDF:", extractError);
        }

        toast.success("Resume version saved!");
      } else {
        toast.error("Failed to save resume version");
      }
    } catch (error) {
      console.error("Error saving resume:", error);
      toast.error("Failed to save resume version");
    } finally {
      setIsSaving(false);
      setLoadingResume(false); // Hide loading animation after save
    }
  }

  async function downloadResume() {
    if (!resumeFileUrl) {
      toast.warning("No resume PDF available to download");
      return;
    }
    try {
      const response = await fetch(resumeFileUrl);
      if (!response.ok) throw new Error("Failed to fetch PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const fileName = `Resume-${selectedJob?.company_name || "Optimized"}-${new Date().toISOString().split("T")[0]}.pdf`;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Resume PDF downloaded!");
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast.error("Failed to download PDF");
    }
  }
  async function copyLatexCode() {
    try {
      if (!selectedJobId || !userId) {
        toast.error("No job or user selected");
        return;
      }
      // Fetch latest resume version for this job/user
      const response = await fetch(`/api/resume-optimizer/${selectedJobId}?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch resume version");
      const data = await response.json();
      if (data?.latex_code) {
        await navigator.clipboard.writeText(data.latex_code);
        toast.success("LaTeX code copied to clipboard!");
      } else {
        toast.error("No LaTeX code found for this resume version");
      }
    } catch (error) {
      console.error("Error copying LaTeX code:", error);
      toast.error("Failed to copy LaTeX code");
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

  async function handleOnboardingSkip() {
    await advanceOnboarding("resume-optimizer", "completed");
    setShowOnboarding(false);
  }

  async function handleOnboardingComplete() {
    await advanceOnboarding("resume-optimizer", "completed");
    setShowOnboarding(false);
    router.push("/dashboard");
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1 flex items-center gap-3">
                <FileText className="w-7 h-7 text-indigo-600" />
                Resume Optimizer
              </h1>
              <p className="text-sm text-gray-600">Tailor your resume with AI-powered feedback</p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors shadow-sm"
            >
              <ChevronRight className="w-4 h-4 rotate-180" />
              Back to Dashboard
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-12 gap-6">
          {/* Job Selector - Left Sidebar */}
          <div id="job-selector" className="col-span-3">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sticky top-6">
              <h2 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wide">Select Job</h2>
              {loadingJobs ? (
                <div className="text-center py-6">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                  <p className="text-xs text-gray-600">Loading...</p>
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-xs text-gray-600 mb-3">No jobs yet</p>
                  <button
                    onClick={() => router.push("/dashboard/new")}
                    className="w-full px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
                  >
                    New Application
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-1">
                    {jobs.map((job) => (
                      <div
                        key={job.id}
                        className={`w-full px-3 py-2.5 rounded-lg transition-all flex items-start justify-between gap-2 ${
                          selectedJobId === job.id
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md"
                            : "bg-gray-50 text-gray-900 hover:bg-gray-100"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedJobId(job.id);
                            loadResume(job.id);
                          }}
                          className="flex-1 text-left"
                        >
                          <div className="font-medium text-xs leading-snug">{job.job_title}</div>
                          <div className={`text-xs mt-0.5 ${selectedJobId === job.id ? "text-indigo-100" : "text-gray-600"}`}>
                            {job.company_name}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => router.push(`/jobs/${job.id}`)}
                          className={`shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-full border text-xs ${
                            selectedJobId === job.id
                              ? "border-indigo-100 bg-white/10 text-white hover:bg-white/20"
                              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                          aria-label="Open job workspace"
                        >
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowJobInfoModal(true)}
                    disabled={!selectedJob}
                    className="mt-4 w-full px-3 py-2 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors disabled:opacity-50"
                  >
                    View Job Info
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="col-span-9">
            <div className="space-y-6">
              {/* PDF Style Selector */}
              <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 px-5 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700 tracking-wide uppercase">PDF Style</p>
                  <p className="text-xs text-gray-500 mt-1">Choose how your generated PDF should look before saving a new version.</p>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedStyle}
                    onChange={(e) => setSelectedStyle(e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-3 py-1.5 bg-white text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="jake">Jake (Default)</option>
                    <option value="modern">Modern Tech</option>
                    <option value="classic">Classic Professional</option>
                    <option value="onepage">One-Page Focused</option>
                    <option value="chronological">Chronological</option>
                    <option value="functional">Functional</option>
                    <option value="combination">Combination</option>
                  </select>
                </div>
              </div>

              {/* PDF Viewer */}
              <div id="pdf-viewer" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-sm font-bold text-gray-900">Your Resume</h3>
                </div>
                <div className="p-4">
                  {loadingResume ? (
                    <div className="w-full h-96 flex items-center justify-center">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-3"></div>
                        <p className="text-sm text-gray-600">Loading resume...</p>
                      </div>
                    </div>
                  ) : resumeFileUrl ? (
                    <iframe
                      src={resumeFileUrl}
                      className="w-full h-96 border border-gray-300 rounded-lg"
                      title="Resume PDF"
                      onError={(e) => {
                        console.error("Failed to load PDF:", resumeFileUrl);
                        setResumeFileUrl("");
                      }}
                    />
                  ) : (
                    <div className="w-full h-96 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <div className="text-center p-6">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-700 mb-1">No resume PDF available</p>
                        <p className="text-xs text-gray-500 mb-3">Upload a resume in your profile settings</p>
                        <button
                          onClick={() => router.push("/profile")}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium underline"
                        >
                          Go to Profile →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Text Editor */}
              <div id="resume-editor" className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-900">Edit Resume Text</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{resumeText.split('\n').length} lines</span>
                    <span>•</span>
                    <span>{resumeText.length} characters</span>
                  </div>
                </div>
                <div className="p-4">
                  <textarea
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    className="w-full h-96 p-4 border border-gray-300 rounded-lg font-mono text-xs leading-relaxed text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none whitespace-pre"
                    placeholder="Edit your resume text here...&#10;&#10;Tips:&#10;- Keep formatting with line breaks&#10;- Use blank lines to separate sections&#10;- UPPERCASE text will be bold in PDF&#10;- Bullet points: use • character"
                    style={{ lineHeight: '1.6' }}
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div id="action-buttons" className="flex gap-3">
                <button
                  id="review-feedback-btn"
                  onClick={reviewFeedback}
                  disabled={!selectedJobId || !feedback}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-indigo-600 text-indigo-600 font-semibold rounded-lg hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Eye className="w-5 h-5" />
                  Review Feedback
                </button>
                <button
                  id="request-feedback-btn"
                  onClick={requestFeedback}
                  disabled={loadingFeedback || !selectedJobId}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  <Sparkles className="w-5 h-5" />
                  {loadingFeedback ? "Generating..." : "Request Feedback"}
                </button>
                <button
                  onClick={() => setShowSaveConfirm(true)}
                  disabled={isSaving || !selectedJobId}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Save className="w-5 h-5" />
                  {isSaving ? "Saving..." : "Save Version"}
                </button>
                <button
                  onClick={downloadResume}
                  disabled={!resumeFileUrl}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <Download className="w-5 h-5" />
                  Download PDF
                </button>
                <button
                  onClick={copyLatexCode}
                  disabled={
                    !resumeText ||
                    Boolean(
                      selectedJobId &&
                      resumeFileUrl &&
                      originalResumeText &&
                      resumeFileUrl !== "" &&
                      resumeFileUrl === originalResumeText
                    )
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <FileText className="w-5 h-5" />
                  Copy LaTeX
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Job Info Modal */}
      {showJobInfoModal && selectedJob && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowJobInfoModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Job Information</h3>
                <p className="text-xs text-gray-500">Review the job details while optimizing your resume.</p>
              </div>
              <button
                onClick={() => setShowJobInfoModal(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close job info modal"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-160px)] space-y-4">
              <div>
                <span className="block text-xs font-semibold text-gray-500 mb-1">Title</span>
                <p className="text-base font-bold text-gray-900">{selectedJob.job_title}</p>
              </div>
              <div>
                <span className="block text-xs font-semibold text-gray-500 mb-1">Company</span>
                <p className="text-base text-gray-800">{selectedJob.company_name}</p>
              </div>
              <div>
                <span className="block text-xs font-semibold text-gray-500 mb-1">Job Description</span>
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {selectedJob.job_description || "No description provided."}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowJobInfoModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-purple-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Resume Feedback</h3>
                    <p className="text-xs text-indigo-100">AI-powered analysis</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFeedbackModal(false)}
                  className="text-white/80 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingFeedback ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-sm text-gray-600">Analyzing your resume...</p>
                </div>
              ) : feedback ? (
                <div className="space-y-6">
                  {/* Score */}
                  <div className="text-center pb-6 border-b border-gray-200">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 mb-3">
                      <span className="text-3xl font-bold text-indigo-600">{feedbackScore}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-600">Overall Score</p>
                    {feedback.summary && (
                      <p className="text-sm text-gray-700 mt-3 max-w-2xl mx-auto">{feedback.summary}</p>
                    )}
                  </div>

                  {/* Priority Changes */}
                  {feedback.priority_changes && feedback.priority_changes.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-xs">!</span>
                        Top Priorities
                      </h4>
                      <ul className="space-y-2">
                        {feedback.priority_changes.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-orange-50 p-3 rounded-lg">
                            <span className="text-orange-600 font-bold mt-0.5">{i + 1}.</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Strengths */}
                  {feedback.strengths && feedback.strengths.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-xs">✓</span>
                        Strengths
                      </h4>
                      <ul className="space-y-2">
                        {feedback.strengths.map((item: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-green-600 mt-1">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvements */}
                  {feedback.improvements && feedback.improvements.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs">→</span>
                        Improvements
                      </h4>
                      <ul className="space-y-2">
                        {feedback.improvements.map((item: any, i: number) => (
                          <li key={i} className="flex flex-col gap-1 text-sm text-gray-700 bg-blue-50 p-3 rounded-lg">
                            <div className="flex items-start gap-2">
                              <span className="text-blue-600 mt-1">•</span>
                              <span>
                                <strong>{item.section}:</strong> {item.suggestion}
                              </span>
                            </div>
                            {item.reason && (
                              <div className="text-xs text-gray-500 pl-6">Reason: {item.reason}</div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Keyword Gaps */}
                  {feedback.keyword_gaps && feedback.keyword_gaps.length > 0 && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xs">⚠</span>
                        Missing Keywords
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {feedback.keyword_gaps.map((keyword: string, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-full border border-red-200">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600">No feedback available</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowFeedbackModal(false)}
                className="w-full px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal */}
      {showSaveConfirm && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setShowSaveConfirm(false)}
        >
          <div
            className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-indigo-200 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="mt-0.5 w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-base font-bold">
                !
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Confirm PDF layout</p>
                <p className="text-xs text-gray-600 mt-1">
                  You are generating this PDF as a
                  {" "}
                  <span className="font-semibold text-indigo-600">
                    {selectedStyle === "jake" && "Jake"}
                    {selectedStyle === "modern" && "Modern Tech"}
                    {selectedStyle === "classic" && "Classic Professional"}
                    {selectedStyle === "onepage" && "One-Page"}
                    {selectedStyle === "chronological" && "Chronological"}
                    {selectedStyle === "functional" && "Functional"}
                    {selectedStyle === "combination" && "Combination"}
                  </span>{" "}
                  layout. This only changes formatting, not your actual content.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveConfirm(false)}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg border border-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSaveConfirm(false);
                  await saveOptimizedResume();
                }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-green-600 text-white hover:bg-green-700 shadow-sm"
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Confirm & Save"}
              </button>
            </div>
          </div>
        </div>
      )}

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
