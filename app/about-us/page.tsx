"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { toast } from "@/components/toast";

type TeamMember = {
    name: string;
    linkedin: string;
    github: string;
    hobbies: string[];
    degree: string;
};

const teamMembers: TeamMember[] = [
    {
        name: "Dhilon Prasad",
        linkedin: "https://linkedin.com/in/dhilonprasad",
        github: "https://github.com/dhilon",
        hobbies: ["Basketball", "Reading", "Climbing", "Chess"],
        degree: "B.S. Computer Science, University of Colorado Boulder",
    },
    {
        name: "Dhruv Nemani",
        linkedin: "https://linkedin.com/in/dhruv-nemani",
        github: "https://github.com/Dnemni",
        hobbies: ["Reading", "Traveling", "Cooking", "Yoga"],
        degree: "B.S. Computer Science, Purdue University",
    },
    {
        name: "Nikhil Mathihalli",
        linkedin: "https://linkedin.com/in/nikhilmathihalli",
        github: "https://github.com/nikhilmathihalli",
        hobbies: ["Reading", "Traveling", "Cooking", "Yoga"],
        degree: "B.S. Computer Science, University of California, Berkeley",
    },
];

export default function AboutUsPage() {
    const router = useRouter();
    const [redirecting, setRedirecting] = useState(false);
    const [showFeedbackModal, setShowFeedbackModal] = useState(false);
    const [feedbackType, setFeedbackType] = useState<"feedback" | "bug">("feedback");
    const [feedbackText, setFeedbackText] = useState("");
    const [submitting, setSubmitting] = useState(false);

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
    }


    async function handleSubmitFeedback() {
        if (!feedbackText.trim()) {
            toast.warning("Please enter your feedback or bug report");
            return;
        }

        setSubmitting(true);
        try {
            // Here you would typically send this to your backend/API
            // For now, we'll just show a success message
            console.log("Feedback submitted:", {
                type: feedbackType,
                text: feedbackText,
            });

            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));

            toast.success(`Thank you for your ${feedbackType === "bug" ? "bug report" : "feedback"}!`, "We'll review it soon.");
            setFeedbackText("");
            setShowFeedbackModal(false);
        } catch (error) {
            console.error("Error submitting feedback:", error);
            toast.error("Failed to submit feedback. Please try again.");
        } finally {
            setSubmitting(false);
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

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col">
            <Header showDashboard showProfile />

            <div className="max-w-7xl mx-auto px-8 py-12 flex-1">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">About Us</h1>
                    <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                        Meet the team behind Applihero. We're passionate about helping you land your dream job through AI-powered coaching.
                    </p>
                </div>

                {/* Team Members Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {teamMembers.map((member, index) => (
                        <div
                            key={index}
                            className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-xl p-6 shadow-xl hover:shadow-2xl hover:border-indigo-300 transition-all duration-200"
                        >
                            {/* Name */}
                            <div className="mb-4">
                                <h2 className="text-2xl font-bold text-gray-900">{member.name}</h2>
                            </div>

                            {/* Degree */}
                            <div className="mb-4">
                                <div className="flex items-start gap-2">
                                    <svg className="h-5 w-5 text-indigo-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14v9M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                                    </svg>
                                    <p className="text-sm text-gray-700">{member.degree}</p>
                                </div>
                            </div>

                            {/* Social Links */}
                            <div className="flex gap-3 mb-4">
                                <a
                                    href={member.linkedin}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                                    </svg>
                                    LinkedIn
                                </a>
                                <a
                                    href={member.github}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors shadow-sm"
                                >
                                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                        <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                                    </svg>
                                    GitHub
                                </a>
                            </div>

                            {/* Hobbies */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                                    <svg className="h-4 w-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                    Hobbies
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {member.hobbies.map((hobby, hobbyIndex) => (
                                        <span
                                            key={hobbyIndex}
                                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200"
                                        >
                                            {hobby}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Feedback/Bug Report Section */}
                <div className="mt-16">
                    <div className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur-xl p-8 shadow-xl">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Feedback & Bug Reports</h2>
                        <p className="text-gray-600 mb-6">
                            Have feedback or found a bug? We'd love to hear from you! Your input helps us improve Applihero.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setFeedbackType("feedback");
                                    setShowFeedbackModal(true);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                </svg>
                                Share Feedback
                            </button>
                            <button
                                onClick={() => {
                                    setFeedbackType("bug");
                                    setShowFeedbackModal(true);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-6 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors shadow-sm"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                Report Bug
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Feedback Modal */}
            {showFeedbackModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !submitting && setShowFeedbackModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-500 to-blue-400">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-white">
                                        {feedbackType === "bug" ? "Report a Bug" : "Share Feedback"}
                                    </h2>
                                    <p className="text-sm text-indigo-100 mt-1">
                                        {feedbackType === "bug"
                                            ? "Help us fix issues by describing what went wrong"
                                            : "We'd love to hear your thoughts and suggestions"}
                                    </p>
                                </div>
                                <button
                                    onClick={() => !submitting && setShowFeedbackModal(false)}
                                    className="text-white/80 hover:text-white transition-colors"
                                    disabled={submitting}
                                >
                                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {feedbackType === "bug" ? "Bug Description" : "Your Feedback"}
                                </label>
                                <textarea
                                    value={feedbackText}
                                    onChange={e => setFeedbackText(e.target.value)}
                                    disabled={submitting}
                                    rows={8}
                                    placeholder={feedbackType === "bug"
                                        ? "Please describe the bug, steps to reproduce it, and what you expected to happen..."
                                        : "Share your thoughts, suggestions, or ideas for improvement..."}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
                            <button
                                onClick={() => setShowFeedbackModal(false)}
                                disabled={submitting}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 border border-gray-300 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitFeedback}
                                disabled={submitting || !feedbackText.trim()}
                                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? "Submitting..." : "Submit"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
}

