"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ProfileService } from "@/lib/supabase/services";
import type { Profile } from "@/lib/supabase/types";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);

  // Form fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [transcriptText, setTranscriptText] = useState("");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedTranscript, setUploadedTranscript] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const [showOnboardingDialog, setShowOnboardingDialog] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const resumeSectionRef = useRef<HTMLDivElement>(null);
  const transcriptSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);

    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push("/login"), 1500);
      return;
    }

    const data = await ProfileService.getCurrentProfile();

    if (data) {
      setProfile(data);
      setResumeText(data.resume_text || "");
      setTranscriptText(data.transcript_text || "");

      // Get auth user for metadata fallback
      const { data: { user } } = await supabase.auth.getUser();
      const fullName = user?.user_metadata?.full_name || "";

      // Use profile data if available, otherwise try to extract from auth metadata
      let firstName = data.first_name || "";
      let lastName = data.last_name || "";

      // If no name in profile but we have full_name from auth, split it
      if (!firstName && !lastName && fullName) {
        const nameParts = fullName.trim().split(" ");
        firstName = nameParts[0] || "";
        lastName = nameParts.slice(1).join(" ") || "";

        // Update the profile in the background
        ProfileService.updateProfile({
          first_name: firstName,
          last_name: lastName,
        });
      }

      setFirstName(firstName);
      setLastName(lastName);
      setEmail(data.email || "");
      setBio(data.bio || "");
      setEmailNotifications(data.email_notifications);
      setMarketingEmails(data.marketing_emails);

      // Check if onboarding is needed
      if (!data.onboarding_completed) {
        setShowOnboardingDialog(true);
        setOnboardingStep(0);
      }
    }

    setLoading(false);
  }

  async function handleSaveProfile() {
    setSaving(true);

    const updated = await ProfileService.updateProfile({
      first_name: firstName,
      last_name: lastName,
      bio: bio,
    });

    if (updated) {
      setProfile(updated);
      alert("Profile updated successfully!");
    } else {
      alert("Failed to update profile");
    }

    setSaving(false);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleResumeUpload(file: File) {
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file");
      return;
    }

    setUploading(true);
    const url = await ProfileService.uploadResume(file);

    if (url) {
      setUploadedFile(file);

      // Advance onboarding if in progress
      if (showOnboardingDialog && onboardingStep === 0) {
        setOnboardingStep(1);
      }

      // Wait a moment for text extraction to complete
      setTimeout(async () => {
        const updatedProfile = await ProfileService.getCurrentProfile();
        if (updatedProfile) {
          setProfile(updatedProfile);
          setResumeText(updatedProfile.resume_text || "");

          if (updatedProfile.resume_text) {
            alert(`Resume uploaded! Extracted ${updatedProfile.resume_text.length.toLocaleString()} characters for AI coaching.`);
          } else {
            alert("Resume uploaded! Text extraction is processing...");
          }
        }
        setUploading(false);
      }, 2000);
    } else {
      alert("Failed to upload resume");
      setUploading(false);
    }
  }

  async function handleTranscriptUpload(file: File) {
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file");
      return;
    }

    setUploadingTranscript(true);
    const url = await ProfileService.uploadTranscript(file);

    if (url) {
      setUploadedTranscript(file);

      // Complete onboarding if in progress (after transcript upload)
      if (showOnboardingDialog) {
        await completeOnboarding();
      }

      // Wait a moment for text extraction to complete
      setTimeout(async () => {
        const updatedProfile = await ProfileService.getCurrentProfile();
        if (updatedProfile) {
          setProfile(updatedProfile);
          setTranscriptText(updatedProfile.transcript_text || "");

          if (updatedProfile.transcript_text) {
            alert(`Transcript uploaded! Extracted ${updatedProfile.transcript_text.length.toLocaleString()} characters for AI coaching.`);
          } else {
            alert("Transcript uploaded! Text extraction is processing...");
          }
        }
        setUploadingTranscript(false);
      }, 2000);
    } else {
      alert("Failed to upload transcript");
      setUploadingTranscript(false);
    }
  }

  async function completeOnboarding() {
    const updated = await ProfileService.updateProfile({
      onboarding_completed: true,
    });

    if (updated) {
      setShowOnboardingDialog(false);
      router.push("/dashboard?onboarding=completed");
    }
  }

  function handleSkipOnboarding() {
    completeOnboarding();
  }

  function handleNextOnboardingStep() {
    if (onboardingStep === 0) {
      // Scroll to resume section
      resumeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setOnboardingStep(1);
    } else if (onboardingStep === 1) {
      // Scroll to transcript section
      transcriptSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setOnboardingStep(2);
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleResumeUpload(file);
    }
  };

  const handleTranscriptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleTranscriptUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleResumeUpload(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleTranscriptClick = () => {
    transcriptInputRef.current?.click();
  };

  async function handlePreferencesUpdate() {
    const success = await ProfileService.updatePreferences(
      emailNotifications,
      marketingEmails
    );

    if (success) {
      alert("Preferences updated!");
    } else {
      alert("Failed to update preferences");
    }
  }

  async function handleViewResume() {
    if (!profile?.resume_url) return;

    const url = await ProfileService.getResumeUrl(profile.resume_url);
    if (url) {
      window.open(url, '_blank');
    } else {
      alert('Failed to load resume');
    }
  }

  async function handleViewTranscript() {
    if (!profile?.transcript_url) return;

    const url = await ProfileService.getTranscriptUrl(profile.transcript_url);
    if (url) {
      window.open(url, '_blank');
    } else {
      alert('Failed to load transcript');
    }
  }

  async function handleDeleteAccount() {
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      return;
    }

    const success = await ProfileService.deactivateAccount();

    if (success) {
      router.push("/login");
    } else {
      alert("Failed to delete account");
    }
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
          <p className="text-gray-600">Loading profile...</p>
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
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white/80 backdrop-blur-sm px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white hover:border-gray-400 transition-all"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Dashboard
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

      <div className="w-full max-w-4xl mx-auto px-8 py-12">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="space-y-6">
          {/* Profile Information */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Profile Information</h2>
                <p className="mt-1 text-sm text-gray-600">Update your personal details</p>
              </div>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-blue-600 text-white">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Doe"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Email address</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 cursor-not-allowed"
                  placeholder="john@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Bio</label>
                <textarea
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={saving}
                  className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Tell us about yourself..."
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => loadProfile()}
                disabled={saving}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-indigo-700 hover:to-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>

          {/* Documents */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
            <p className="text-sm text-gray-600 mb-6">
              Upload your resume and transcript for personalized coaching.
            </p>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {/* Resume Upload */}
              <div ref={resumeSectionRef}>
                <label className="block text-sm font-medium text-gray-700 mb-3">Resume</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="hidden"
                />
                <div
                  onClick={handleClick}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                      <span className="text-sm font-medium text-indigo-600">Uploading...</span>
                    </div>
                  ) : uploadedFile || profile?.resume_url ? (
                    <>
                      <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-gray-900">
                        {uploadedFile?.name || "Resume uploaded"}
                      </p>
                    </>
                  ) : (
                    <>
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-gray-900">
                        Click to upload or drag and drop
                      </p>
                      <p className="mt-1 text-xs text-gray-500">PDF up to 10MB</p>
                    </>
                  )}
                </div>
                {profile?.resume_url && (
                  <button
                    onClick={handleViewResume}
                    className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    View current resume
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Transcript Upload */}
              <div ref={transcriptSectionRef}>
                <label className="block text-sm font-medium text-gray-700 mb-3">Transcript</label>
                <input
                  ref={transcriptInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleTranscriptSelect}
                  disabled={uploadingTranscript}
                  className="hidden"
                />
                <div
                  onClick={handleTranscriptClick}
                  className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors cursor-pointer"
                >
                  {uploadingTranscript ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                      <span className="text-sm font-medium text-indigo-600">Uploading...</span>
                    </div>
                  ) : uploadedTranscript || profile?.transcript_url ? (
                    <>
                      <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-gray-900">
                        {uploadedTranscript?.name || "Transcript uploaded"}
                      </p>
                    </>
                  ) : (
                    <>
                      <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="mt-2 text-sm font-medium text-gray-900">
                        Click to upload or drag and drop
                      </p>
                      <p className="mt-1 text-xs text-gray-500">PDF up to 10MB</p>
                    </>
                  )}
                </div>
                {profile?.transcript_url && (
                  <button
                    onClick={handleViewTranscript}
                    className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    View current transcript
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* AI Coaching Status */}
            <div className="mt-8 pt-8 border-t border-gray-200">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-gray-900">AI Coaching Status</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Text is automatically extracted from your uploaded PDFs to enable personalized AI coaching.
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Resume</p>
                      {profile?.resume_url && <p className="text-xs text-gray-500">PDF uploaded</p>}
                    </div>
                  </div>
                  {resumeText ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-600 font-medium">{resumeText.length.toLocaleString()} characters extracted</span>
                      <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No text extracted</span>
                  )}
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-3">
                    <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Transcript</p>
                      {profile?.transcript_url && <p className="text-xs text-gray-500">PDF uploaded</p>}
                    </div>
                  </div>
                  {transcriptText ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-green-600 font-medium">{transcriptText.length.toLocaleString()} characters extracted</span>
                      <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">No text extracted</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Preferences */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Email notifications</p>
                  <p className="text-xs text-gray-500">Receive updates about your applications</p>
                </div>
                <button
                  onClick={() => {
                    setEmailNotifications(!emailNotifications);
                    handlePreferencesUpdate();
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${emailNotifications ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${emailNotifications ? "translate-x-6" : "translate-x-1"
                    }`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Marketing emails</p>
                  <p className="text-xs text-gray-500">Receive tips and updates from AppliHero</p>
                </div>
                <button
                  onClick={() => {
                    setMarketingEmails(!marketingEmails);
                    handlePreferencesUpdate();
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${marketingEmails ? "bg-indigo-600" : "bg-gray-200"
                    }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${marketingEmails ? "translate-x-6" : "translate-x-1"
                    }`} />
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="text-lg font-semibold text-red-900 mb-2">Danger Zone</h2>
            <p className="text-sm text-red-700 mb-4">
              Permanently delete your account and all your data. This action cannot be undone.
            </p>
            <button
              onClick={handleDeleteAccount}
              className="rounded-lg border border-red-600 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-600 hover:text-white transition-colors"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>

      {/* Onboarding Dialog */}
      {showOnboardingDialog && (
        <div className="fixed right-0 top-0 z-50 h-full w-full max-w-md p-6 pointer-events-none">
          <div className="relative h-full flex items-center">
            <div className="w-full rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 pointer-events-auto">
              {onboardingStep === 0 && (
                <>
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Your Resume 📄</h2>
                    <p className="text-sm text-gray-600">
                      Upload your resume so Applihero can extract your skills, experience, and education to provide personalized coaching.
                    </p>
                  </div>
                  <div className="mb-6">
                    <div className="rounded-lg bg-indigo-50 p-4 border border-indigo-200">
                      <p className="text-sm text-indigo-900 font-medium mb-2">💡 Why upload your resume?</p>
                      <p className="text-xs text-indigo-700">
                        Applihero will analyze your resume to understand your background and help you tailor your application answers to match your experience.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleNextOnboardingStep}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                      Next
                    </button>
                    <button
                      onClick={handleSkipOnboarding}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      Skip for now
                    </button>
                  </div>
                </>
              )}
              {onboardingStep === 1 && (
                <>
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Your Transcript 🎓</h2>
                    <p className="text-sm text-gray-600">
                      Upload your transcript to help Applihero understand your academic background and coursework.
                    </p>
                  </div>
                  <div className="mb-6">
                    <div className="rounded-lg bg-indigo-50 p-4 border border-indigo-200">
                      <p className="text-sm text-indigo-900 font-medium mb-2">💡 Why upload your transcript?</p>
                      <p className="text-xs text-indigo-700">
                        Your transcript helps Applihero understand your academic achievements and can be used to highlight relevant coursework in your applications.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleNextOnboardingStep}
                      className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                    >
                      Next
                    </button>
                    <button
                      onClick={handleSkipOnboarding}
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      Skip for now
                    </button>
                  </div>
                </>
              )}
              {onboardingStep === 2 && (
                <>
                  <div className="mb-4">
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">You're all set! 🎉</h2>
                    <p className="text-sm text-gray-600">
                      You can upload your resume and transcript anytime from your profile. Let's get started with your first job application!
                    </p>
                  </div>
                  <div className="mb-6">
                    <div className="rounded-lg bg-green-50 p-4 border border-green-200">
                      <p className="text-sm text-green-900 font-medium mb-2">✨ Ready to go!</p>
                      <p className="text-xs text-green-700">
                        Head back to the dashboard to create your first job application and start getting personalized coaching.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSkipOnboarding}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                  >
                    Complete Tutorial
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
