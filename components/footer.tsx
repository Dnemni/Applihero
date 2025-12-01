"use client";

import { useState } from "react";
import { InfoIcon } from "lucide-react";

export function Footer() {
    const [showRAGModal, setShowRAGModal] = useState(false);

    return (
        <>
            <footer className="bg-black text-white py-8">
                <div className="max-w-7xl mx-auto px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
                        {/* Zero Pricing Section */}
                        <div>
                            <h3 className="text-lg font-bold mb-3 text-green-400">💰 Zero Pricing</h3>
                            <p className="text-sm text-gray-300">
                                Completely free forever. No hidden fees, no subscriptions, no credit card required.
                            </p>
                        </div>

                        {/* RAG Model Section */}
                        <div className="relative">
                            <h3 className="text-lg font-bold mb-3 text-indigo-400 relative inline-block">
                                🤖 AI-Powered R
                                <span className="relative inline-block">
                                    A
                                    <span className="relative inline-block">
                                        G
                                        <InfoIcon
                                            className="h-3 w-3 text-indigo-400 absolute -top-1.5 -right-3 cursor-pointer hover:text-green-400 transition-colors"
                                            onMouseEnter={() => setShowRAGModal(true)}
                                            onMouseLeave={() => setShowRAGModal(false)}
                                        />
                                    </span>
                                </span>
                            </h3>

                            <p className="text-sm text-gray-300">
                                <strong className="text-white">
                                    Context-aware retrieval augmented generation technology
                                </strong> for personalized coaching.
                            </p>
                        </div>

                        {/* Copyright */}
                        <div>
                            <h3 className="text-lg font-bold mb-3">© One Week Projects</h3>
                            <p className="text-sm text-gray-300">
                                Built with passion in one week. Link to 52-weeks website coming soon.
                            </p>
                        </div>
                    </div>
                    <div className="border-t border-gray-800 pt-6 text-center">
                        <p className="text-sm text-gray-400">
                            © {new Date().getFullYear()} One Week Projects. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer >

            {/* RAG Modal on Hover */}
            {showRAGModal && (
                <div
                    className="fixed z-50 transition-all duration-300 pointer-events-none"
                    style={{
                        bottom: '120px',
                        left: '69%',
                        top: '50%',
                        transform: 'translateX(-50%)',
                        maxWidth: '600px',
                        width: '90%',
                    }}
                    onMouseEnter={() => setShowRAGModal(true)}
                    onMouseLeave={() => setShowRAGModal(false)}
                >
                    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl pointer-events-auto">
                        <div className="px-6 py-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-indigo-400 mb-2">🤖 Retrieval Augmented Generation (RAG)</h3>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        Our AI uses RAG technology to provide personalized coaching by retrieving relevant context from your resume,
                                        transcripts, job descriptions, referrals, and even hobbies. This allows the AI to give you specific, tailored advice based on your actual
                                        background and experience, rather than generic responses. The system combines your personal data with advanced
                                        language models trained on vector math and data chunks to create repeatable, actionable guidance for your job applications.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
