"use client";

import { useState, useRef, useEffect } from "react";

export type AnswerEditorPanelProps = {
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

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

export function AnswerEditorPanel({ fullscreen = false, onToggleFullscreen }: AnswerEditorPanelProps) {
  const [questions, setQuestions] = useState<Question[]>(mockQuestions);
  const [selected, setSelected] = useState<Question | null>(mockQuestions[0]);
  const [answer, setAnswer] = useState("");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const questionsEndRef = useRef<HTMLDivElement>(null);
  const questionsContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (questionsContainerRef.current) {
      questionsContainerRef.current.scrollTop = questionsContainerRef.current.scrollHeight;
    }
  };

  const handleAddQuestion = () => {
    const newQuestion: Question = {
      id: Date.now().toString(),
      text: "New question - click to edit",
      status: "Not started"
    };
    setQuestions([...questions, newQuestion]);
    setSelected(newQuestion);
    setEditingQuestionId(newQuestion.id);
    setEditingText(newQuestion.text);
    setTimeout(scrollToBottom, 0);
  };

  const handleStartEdit = (question: Question) => {
    setEditingQuestionId(question.id);
    setEditingText(question.text);
  };

  const handleSaveEdit = (questionId: string) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, text: editingText } : q
    ));
    setEditingQuestionId(null);
    if (selected?.id === questionId) {
      setSelected({ ...selected, text: editingText });
    }
  };

  const handleCancelEdit = () => {
    setEditingQuestionId(null);
    setEditingText("");
  };

  const handleDeleteQuestion = (questionId: string) => {
    const updatedQuestions = questions.filter(q => q.id !== questionId);
    setQuestions(updatedQuestions);
    setDeletingQuestionId(null);
    
    if (selected?.id === questionId) {
      setSelected(updatedQuestions.length > 0 ? updatedQuestions[0] : null);
    }
  };

  return (
    <div className={`flex flex-col rounded-3xl bg-white/70 shadow-xl backdrop-blur-xl p-0 transition-all duration-300 ${fullscreen ? 'z-10 h-[calc(100vh-12rem)]' : 'h-[600px]'}`}>
      <div className="flex items-center gap-2 px-6 pt-6 pb-2 flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-400">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-gray-900">Application questions</h3>
          <p className="text-xs text-gray-500">Draft and refine your answers</p>
        </div>
        {onToggleFullscreen && (
          <button
            type="button"
            onClick={onToggleFullscreen}
            className="ml-auto rounded-lg p-1.5 hover:bg-gray-100 transition"
            title={fullscreen ? 'Exit full screen' : 'Full screen'}
          >
            {fullscreen ? (
              <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M20 8V4h-4M4 16v4h4m12-4v4h-4" /></svg>
            ) : (
              <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4" /></svg>
            )}
          </button>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-2/5 bg-gradient-to-b from-purple-50/60 via-pink-50/40 to-pink-50 p-4 pt-2 pl-5 rounded-l-3xl flex flex-col">
          <div className="mb-4 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Questions
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                {questions.length}
              </span>
              <button
                onClick={handleAddQuestion}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-400 text-white hover:from-purple-600 hover:to-pink-500 transition-all shadow-sm"
                title="Add question"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          <div ref={questionsContainerRef} className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-2 pl-2 pb-2 pt-1">
            {questions.map((q) => (
              <div
                key={q.id}
                className={`group relative block w-full rounded-xl p-3.5 transition-all ${
                  selected?.id === q.id
                    ? "bg-white text-gray-900 shadow-md ring-2 ring-purple-400"
                    : "bg-white/60 text-gray-700 hover:bg-white hover:shadow-sm"
                }`}
              >
                {editingQuestionId === q.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="w-full rounded-lg border border-purple-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200/40 resize-none"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={handleCancelEdit}
                        className="px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(q.id)}
                        className="px-3 py-1 text-xs font-semibold text-white bg-gradient-to-r from-purple-500 to-pink-400 rounded-lg hover:from-purple-600 hover:to-pink-500 transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {deletingQuestionId === q.id && (
                      <div className="absolute inset-0 bg-white/95 backdrop-blur-sm rounded-xl z-10 flex flex-col items-center justify-center p-4 gap-3">
                        <svg className="h-10 w-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-sm font-semibold text-gray-900 text-center">Delete this question?</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDeletingQuestionId(null)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDeleteQuestion(q.id)}
                            className="px-3 py-1.5 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                    <div 
                      onClick={() => setSelected(q)}
                      className="cursor-pointer"
                    >
                      <div className="line-clamp-2 text-sm font-medium leading-snug pr-6">{q.text}</div>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[q.status]}`}>
                          {q.status}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(q);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-purple-100 transition-all"
                            title="Edit question"
                          >
                            <svg className="h-3.5 w-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingQuestionId(q.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 transition-all"
                            title="Delete question"
                          >
                            <svg className="h-3.5 w-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                          {selected?.id === q.id && (
                            <svg className="h-4 w-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
            <div ref={questionsEndRef} />
          </div>
        </div>
        <div className="flex flex-1 flex-col p-6 bg-white/80 rounded-r-3xl">
          {selected ? (
            <>
              <div className="mb-4">
                <label className="block text-base font-bold text-gray-900">
                  {selected.text}
                </label>
                <p className="mt-1 text-xs text-gray-600">
                  Draft your answer here. Later you can send it for feedback.
                </p>
              </div>
              <textarea
                rows={10}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-200/40 resize-none shadow-sm"
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
                  <button className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save draft
                  </button>
                  <button className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-400 px-4 py-2 text-sm font-semibold text-white hover:from-purple-600 hover:to-pink-500 transition-colors shadow-md">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
