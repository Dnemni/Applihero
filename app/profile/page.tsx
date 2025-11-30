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
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedTranscript, setUploadedTranscript] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

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
      await loadProfile();
      alert("Resume uploaded successfully!");
    } else {
      alert("Failed to upload resume");
    }
    
    setUploading(false);
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
      await loadProfile();
      alert("Transcript uploaded successfully!");
    } else {
      alert("Failed to upload transcript");
    }
    
    setUploadingTranscript(false);
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
              <div>
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
              <div>
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
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailNotifications ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    emailNotifications ? "translate-x-6" : "translate-x-1"
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
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    marketingEmails ? "bg-indigo-600" : "bg-gray-200"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    marketingEmails ? "translate-x-6" : "translate-x-1"
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
    </div>
  );
}
