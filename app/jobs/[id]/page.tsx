"use client";
import React, { useState } from "react";
import { ChatPanel } from "../../../components/chat";
import { AnswerEditorPanel } from "../../../components/answer-editor";
export default function JobPage({ params }: { params: { id: string } }) {
  const [fullscreen, setFullscreen] = useState<null | 'chat' | 'answer'>(null);
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
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Application Workspace</h1>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Job #{params.id}
              </span>
              <span className="text-gray-400">•</span>
              <span>Senior Product Manager</span>
              <span className="text-gray-400">•</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                In Progress
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white/80 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-white hover:border-gray-400 transition-all shadow-sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-all shadow-sm">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Submit Application
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
