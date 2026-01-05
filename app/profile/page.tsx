"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { ProfileService } from "@/lib/supabase/services";
import type { Profile } from "@/lib/supabase/types";
import { OnboardingOverlay, OnboardingStep } from "@/components/onboarding-overlay";
import { Header } from "@/components/header";
import { toast } from "@/components/toast";
import { PasswordStrengthBar, getPasswordStrength } from "@/components/PasswordStrengthBar";
import { ProfileInfoCard } from "@/components/profile/ProfileInfoCard";
import { DocumentsCard } from "@/components/profile/DocumentsCard";
import { PreferencesCard } from "@/components/profile/PreferencesCard";
import { IntegrationsCard } from "@/components/profile/IntegrationsCard";
import { SecurityCard } from "@/components/profile/SecurityCard";
import { DangerZoneCard } from "@/components/profile/DangerZoneCard";
import { SkillsSection } from "@/components/profile/SkillsSection";
import { ExperienceSection } from "@/components/profile/ExperienceSection";
import { EducationSection } from "@/components/profile/EducationSection";
import { ProjectsSection } from "@/components/profile/ProjectsSection";
import {
  getOnboardingState,
  setOnboardingState,
  advanceOnboarding,
  shouldShowOnboarding,
} from "@/lib/onboarding-state";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  
  // Refs for profile data sections
  const skillsRef = useRef<{ refresh: () => Promise<void> }>(null);
  const experienceRef = useRef<{ refresh: () => Promise<void> }>(null);
  const educationRef = useRef<{ refresh: () => Promise<void> }>(null);
  const projectsRef = useRef<{ refresh: () => Promise<void> }>(null);

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

  // New onboarding system
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // Delete account
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Password change
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Integrations state and loader
  const [linkedinProfile, setLinkedinProfile] = useState<{
    connected: boolean;
    name?: string;
    headline?: string;
    picture?: string;
    connectedAt?: string;
  }>({ connected: false });
  const [linkedinLoading, setLinkedinLoading] = useState(false);

  // Placeholder for future integrations
  const [placeholderIntegrations] = useState([
    {
      key: 'notion',
      name: 'Notion',
      description: 'Sync your notes and job search docs from Notion.',
      connected: false,
    },
    {
      key: 'google_drive',
      name: 'Google Drive',
      description: 'Import resumes, transcripts, and cover letters from Drive.',
      connected: false,
    },
    {
      key: 'github',
      name: 'GitHub',
      description: 'Showcase your open source work and link your profile.',
      connected: false,
    },
  ]);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    loadLinkedInProfile();
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
      const shouldShow = await shouldShowOnboarding("profile");
      if (!data.onboarding_completed && shouldShow) {
        setShowOnboarding(true);
        const state = await getOnboardingState();
        setOnboardingStep(state?.step || 0);
      }
    }

    setLoading(false);
  }

  async function loadLinkedInProfile() {
    setLinkedinLoading(true);
    try {
      const res = await fetch('/api/profile/linkedin');
      if (!res.ok) throw new Error('Failed to load LinkedIn integration');
      const data = await res.json();
      setLinkedinProfile(data);
    } catch (e) {
      setLinkedinProfile({ connected: false });
    } finally {
      setLinkedinLoading(false);
    }
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
      toast.success("Profile updated successfully!");

      // Auto-complete profile onboarding if on the last step
      if (showOnboarding && onboardingStep === 4) {
        setTimeout(() => handleOnboardingComplete(), 800);
      }
    } else {
      toast.error("Failed to update profile");
    }

    setSaving(false);
  }

  // Onboarding handlers
  const onboardingSteps: OnboardingStep[] = [
    {
      title: "Welcome to Applihero! 🎉",
      description: "Let's set up your profile to enable personalized AI coaching. We'll help you upload your resume, transcript, and add a bio. This should only take a few minutes!",
      position: "center",
    },
    {
      title: "Upload Your Resume 📄",
      description: "Click the highlighted area to upload your resume (PDF). Applihero will extract your skills, experience, and education to provide personalized coaching. The tutorial will advance automatically once uploaded!",
      targetId: "resume-upload-section",
      position: "right",
    },
    {
      title: "Upload Your Transcript 📚",
      description: "Now click here to upload your academic transcript (PDF). This helps the AI understand your educational background. The tutorial will continue automatically after upload.",
      targetId: "transcript-upload-section",
      position: "right",
    },
    {
      title: "Add Your Bio ✍️",
      description: "Click in the bio field and write a brief description about yourself. Include your interests, goals, and what makes you unique. Don't worry, you can edit this anytime!",
      targetId: "bio-section",
      position: "right",
    },
    {
      title: "Save Your Profile 💾",
      description: "Perfect! Now click the 'Save Profile' button below to save your changes. The tutorial will automatically take you to the dashboard next!",
      targetId: "save-profile-button",
      position: "bottom",
    },
  ];

  const handleOnboardingNext = async () => {
    const state = await getOnboardingState();
    if (!state) return;

    const newState = {
      ...state,
      step: onboardingStep + 1,
    };
    await setOnboardingState(newState);
    setOnboardingStep(onboardingStep + 1);
  };

  const handleOnboardingPrevious = async () => {
    const state = await getOnboardingState();
    if (!state) return;

    const newState = {
      ...state,
      step: Math.max(0, onboardingStep - 1),
    };
    await setOnboardingState(newState);
    setOnboardingStep(Math.max(0, onboardingStep - 1));
  };

  const handleOnboardingSkip = async () => {
    // Mark onboarding complete in DB and clear state
    await ProfileService.updateProfile({ onboarding_completed: true });
    await advanceOnboarding("profile", "completed");
    setShowOnboarding(false);
    router.push("/dashboard");
  };

  const handleOnboardingComplete = async () => {
    // Advance to dashboard phase
    await advanceOnboarding("profile", "dashboard");
    setShowOnboarding(false);
    router.push("/dashboard");
  };

  async function handlePasswordChange() {
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validation
    if (!currentPassword) {
      setPasswordError("Current password is required");
      return;
    }

    const { valid, reasons } = getPasswordStrength(newPassword);
    if (!valid) {
      setPasswordError("Password is not strong enough: " + reasons.join(", "));
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("New password must be different from current password");
      return;
    }

    setChangingPassword(true);

    try {
      // First, verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error("Current password is incorrect");
      }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Success!
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");

      // Close modal after a delay
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
  }



  // Poll for profile parsing completion
  async function pollForParsedProfile(maxAttempts = 10, interval = 2000) {
    let attempts = 0;
    while (attempts < maxAttempts) {
      const updatedProfile = await ProfileService.getCurrentProfile();
      if (updatedProfile && updatedProfile.resume_text && updatedProfile.profile_data_sources?.includes('resume')) {
        setProfile(updatedProfile);
        setResumeText(updatedProfile.resume_text || "");
        toast.success("Resume parsed!", `Structured data extracted for AI coaching.`);
        // Automatically trigger profile parsing after resume text extraction
        await fetch('/api/profile/parse-structured-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: updatedProfile.id,
            source: 'resume',
            forceReparse: true,
          }),
        });
        // Reload profile data after parsing
        const parsedProfile = await ProfileService.getCurrentProfile();
        if (parsedProfile) {
          setProfile(parsedProfile);
          setResumeText(parsedProfile.resume_text || "");
        }
        toast.success("Resume parsed and profile updated!", `Structured data extracted for AI coaching.`);
        return true;
      }
      await new Promise(res => setTimeout(res, interval));
      attempts++;
    }
    toast.info("Resume uploaded!", "Text extraction is processing, but parsing may take longer.");
    return false;
  }

  async function handleResumeUpload(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    setUploading(true);
    const url = await ProfileService.uploadResume(file);

    if (url) {
      setUploadedFile(file);
      // Wait for parsing to complete (poll for up to ~20s)
      await pollForParsedProfile();
      setUploading(false);
    } else {
      toast.error("Failed to upload resume");
      setUploading(false);
    }
  }


  async function pollForParsedTranscript(maxAttempts = 10, interval = 2000) {
    let attempts = 0;
    while (attempts < maxAttempts) {
      const updatedProfile = await ProfileService.getCurrentProfile();
      if (updatedProfile && updatedProfile.transcript_text && updatedProfile.profile_data_sources?.includes('transcript')) {
        setProfile(updatedProfile);
        setTranscriptText(updatedProfile.transcript_text || "");
        toast.success("Transcript parsed!", `Structured data extracted for AI coaching.`);
        return true;
      }
      await new Promise(res => setTimeout(res, interval));
      attempts++;
    }
    toast.info("Transcript uploaded!", "Text extraction is processing, but parsing may take longer.");
    return false;
  }

  async function handleTranscriptUpload(file: File) {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }

    setUploadingTranscript(true);
    const url = await ProfileService.uploadTranscript(file);

    if (url) {
      setUploadedTranscript(file);
      await pollForParsedTranscript();
      setUploadingTranscript(false);
    } else {
      toast.error("Failed to upload transcript");
      setUploadingTranscript(false);
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
      toast.success("Preferences updated!");
    } else {
      toast.error("Failed to update preferences");
    }
  }

  async function handleViewResume() {
    if (!profile?.resume_url) return;

    const url = await ProfileService.getResumeUrl(profile.resume_url);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error('Failed to load resume');
    }
  }

  async function handleViewTranscript() {
    if (!profile?.transcript_url) return;

    const url = await ProfileService.getTranscriptUrl(profile.transcript_url);
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error('Failed to load transcript');
    }
  }

  async function handleDeleteAccount() {
    setShowDeleteModal(true);
  }

  async function confirmDeleteAccount() {
    if (!deletePassword.trim()) {
      toast.error("Please enter your password to confirm deletion");
      return;
    }

    setDeleting(true);

    try {
      // First verify password by attempting to sign in
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email,
        password: deletePassword,
      });

      if (authError) {
        toast.error("Incorrect password. Please try again.");
        setDeleting(false);
        return;
      }

      // Password verified, proceed with deletion via API
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/profile/delete-account', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
      });

      if (response.ok) {
        // Sign out and redirect to home
        await supabase.auth.signOut();
        router.push("/");
      } else {
        const errorData = await response.json();
        toast.error("Failed to delete account", errorData.error || 'Unknown error');
        setDeleting(false);
      }
    } catch (err) {
      console.error('Delete account error:', err);
      toast.error("An error occurred while deleting your account");
      setDeleting(false);
    }
  }

  function handleConnectLinkedIn() {
    window.location.href = '/auth/linkedin';
  }

  // Debug: Trigger profile parsing from client
  async function handleDebugParseProfile() {
    if (!profile) {
      toast.error('No profile loaded');
      return;
    }
    try {
      toast.info('Triggering profile parsing...');
      const res = await fetch('/api/profile/parse-structured-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.id,
          source: 'resume',
          forceReparse: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Profile parsed and synced!', 'Reloading profile data...');
        // Hot reload all profile sections
        await Promise.all([
          skillsRef.current?.refresh(),
          experienceRef.current?.refresh(),
          educationRef.current?.refresh(),
          projectsRef.current?.refresh(),
        ]);
      } else {
        toast.error('Parse failed', data.error || 'Unknown error');
      }
      console.log('[DebugParse] Response:', data);
    } catch (err) {
      toast.error('Parse failed', err instanceof Error ? err.message : String(err));
    }
  }

  if (redirecting || deleting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-900 mb-2">
            {deleting ? "Deleting Account" : "Not authenticated"}
          </p>
          <p className="text-sm text-gray-600">
            {deleting ? "Redirecting to homepage..." : "Redirecting to login..."}
          </p>
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
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col">
      <Header showDashboard />

      <div className="w-full max-w-6xl mx-auto px-8 py-12 flex-1">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your account settings, documents, and security
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6 items-start">
          <div className="space-y-6">
            <ProfileInfoCard
              firstName={firstName}
              lastName={lastName}
              email={email}
              bio={bio}
              onFirstNameChange={setFirstName}
              onLastNameChange={setLastName}
              onBioChange={setBio}
              onSave={handleSaveProfile}
              onCancel={loadProfile}
              saving={saving}
            />

            {/* Documents (restored original rich upload UI) */}
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Documents</h2>
                <button
                  onClick={handleDebugParseProfile}
                  disabled={!profile}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync Profile Data
                </button>
              </div>
              <p className="text-sm text-gray-600 mb-6">
                Upload your resume and transcript for personalized coaching.
              </p>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Resume Upload */}
                <div id="resume-upload-section">
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
                <div id="transcript-upload-section">
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
              <div className="mt-8 pt-8 border-t border-gray-200 relative">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">AI Coaching Status</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Text is automatically extracted from your uploaded PDFs to enable personalized AI coaching.
                    </p>
                  </div>
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

            {/* Enhanced Profile Data Sections */}
            {profile && (
              <>
                <SkillsSection ref={skillsRef} userId={profile.id} editable={true} />
                <ExperienceSection ref={experienceRef} userId={profile.id} editable={true} />
                <EducationSection ref={educationRef} userId={profile.id} editable={true} />
              </>
            )}
          </div>

          <div className="flex flex-col gap-6 h-full">
            <PreferencesCard
              emailNotifications={emailNotifications}
              marketingEmails={marketingEmails}
              onToggleEmailNotifications={() => {
                setEmailNotifications(!emailNotifications);
                handlePreferencesUpdate();
              }}
              onToggleMarketingEmails={() => {
                setMarketingEmails(!marketingEmails);
                handlePreferencesUpdate();
              }}
            />

            {/* Integrations List */}
            <IntegrationsCard
              linkedinProfile={linkedinProfile}
              linkedinLoading={linkedinLoading}
              onConnectLinkedIn={handleConnectLinkedIn}
              placeholderIntegrations={placeholderIntegrations}
            />

            <SecurityCard
              email={email}
              onChangePassword={() => setShowPasswordModal(true)}
            />

            {/* Projects Section */}
            {profile && (
              <ProjectsSection ref={projectsRef} userId={profile.id} editable={true} />
            )}

            <div className="flex-1" />
            <DangerZoneCard onDeleteAccount={handleDeleteAccount} />
          </div>
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

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !changingPassword && setShowPasswordModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Change Password</h2>
                  <p className="text-sm text-gray-600 mt-1">Update your account password</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-4">
              {passwordSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm font-medium text-green-800">Password changed successfully!</p>
                  </div>
                </div>
              )}

              {passwordError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-800">{passwordError}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={changingPassword || passwordSuccess}
                  placeholder="Enter current password"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={changingPassword || passwordSuccess}
                  placeholder="Enter new password"
                  minLength={8}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <PasswordStrengthBar password={newPassword} />
                {newPassword && !getPasswordStrength(newPassword).valid && (
                  <ul className="mt-1 text-xs text-red-500 list-disc list-inside">
                    {getPasswordStrength(newPassword).reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  disabled={changingPassword || passwordSuccess}
                  placeholder="Re-enter new password"
                  minLength={8}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !changingPassword && !passwordSuccess) {
                      handlePasswordChange();
                    }
                  }}
                />
                {confirmNewPassword && newPassword !== confirmNewPassword && (
                  <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end bg-gray-50">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                  setPasswordError(null);
                  setPasswordSuccess(false);
                }}
                disabled={changingPassword}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={
                  changingPassword ||
                  passwordSuccess ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmNewPassword ||
                  newPassword !== confirmNewPassword ||
                  !getPasswordStrength(newPassword).valid
                }
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {changingPassword && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {changingPassword ? "Changing..." : passwordSuccess ? "Changed!" : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Delete Account</h2>
                  <p className="text-sm text-gray-600 mt-1">This action cannot be undone</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800 font-medium mb-2">⚠️ Warning: This will permanently delete:</p>
                <ul className="text-sm text-red-700 space-y-1 ml-4 list-disc">
                  <li>Your profile and personal information</li>
                  <li>All job applications and related data</li>
                  <li>Chat history and AI coaching sessions</li>
                  <li>Uploaded documents (resume, transcript)</li>
                  <li>All answers and cover letters</li>
                </ul>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Enter your password to confirm deletion:
                </label>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  disabled={deleting}
                  placeholder="Your password"
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !deleting) {
                      confirmDeleteAccount();
                    }
                  }}
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end bg-gray-50">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword("");
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteAccount}
                disabled={deleting || !deletePassword.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deleting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {deleting ? "Deleting..." : "Delete My Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer removed on profile page */}
    </div>
  );
}
