"use client";

import { useState } from "react";

type Question = {
  id: string;
  text: string;
  status: "Not started" | "Draft" | "Final";
};

const mockQuestions: Question[] = [
  {
    id: "1",
    text: "Why do you want to work at this company?",
    status: "Draft"
  },
  {
    id: "2",
    text: "Tell us about a project you're proud of.",
    status: "Not started"
  }
];

const statusStyles = {
  "Not started": "bg-gray-100 text-gray-700",
  "Draft": "bg-yellow-100 text-yellow-800",
  "Final": "bg-green-100 text-green-800"
};

export function AnswerEditorPanel() {
  const [selected, setSelected] = useState<Question | null>(mockQuestions[0]);
  const [answer, setAnswer] = useState("");

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gradient-to-r from-purple-50 via-pink-50 to-white px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-pink-600">
          <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Application questions</h3>
          <p className="text-xs text-gray-500">Draft and refine your answers</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-2/5 border-r border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Questions
            </span>
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
              {mockQuestions.length}
            </span>
          </div>
          <div className="space-y-2">
            {mockQuestions.map((q) => (
              <button
                key={q.id}
                onClick={() => setSelected(q)}
                className={`group block w-full rounded-lg p-3 text-left transition-all ${
                  selected?.id === q.id
                    ? "bg-white text-gray-900 shadow-sm ring-2 ring-blue-500"
                    : "bg-white/50 text-gray-700 hover:bg-white hover:shadow-sm"
                }`}
              >
                <div className="line-clamp-2 text-sm font-medium leading-snug">{q.text}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[q.status]}`}>
                    {q.status}
                  </span>
                  {selected?.id === q.id && (
                    <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-5">
          {selected ? (
            <>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-900">
                  {selected.text}
                </label>
                <p className="mt-1 text-xs text-gray-600">
                  Draft your answer here. Later you can send it for feedback.
                </p>
              </div>
              
              <textarea
                rows={12}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                placeholder="Draft your answer here. Later you can send it for feedback."
              />

              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{answer.length} characters</span>
                </div>
                <div className="flex gap-2">
                  <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save draft
                  </button>
                  <button className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1.5 text-sm font-semibold text-white hover:from-purple-700 hover:to-pink-700 transition-colors shadow-sm">
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    Request feedback
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-2 text-sm text-gray-600">
                  Select a question to start drafting an answer.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
