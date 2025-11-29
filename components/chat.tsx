"use client";

import { useState, useRef, useEffect } from "react";

export type ChatPanelProps = {
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

type Message = { role: "user" | "assistant"; content: string };

const initialMessages: Message[] = [
  {
    role: "assistant",
    content:
      "Hi! Paste a question from the application or ask how to position your experience."
  }
];

export function ChatPanel({ fullscreen = false, onToggleFullscreen }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { role: "user", content: input }]);
    setInput("");
    // TODO: call /api/jobsessions/:id/chat and append assistant reply
  }

  return (
    <div className={`flex flex-col rounded-3xl bg-white/70 shadow-xl backdrop-blur-xl p-0 transition-all duration-300 ${fullscreen ? 'z-10 h-[calc(100vh-12rem)]' : 'h-[600px]'}`}>
      <div className="flex items-center gap-2 px-6 pt-6 pb-2 flex-shrink-0">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-400">
          <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-base font-bold text-gray-900">Coaching chat</h3>
          <p className="text-xs text-gray-500">Get personalized guidance</p>
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
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 min-h-0">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex gap-2.5 items-end ${
              m.role === "user" ? "flex-row-reverse" : "flex-row"
            }`}
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              m.role === "user" ? "bg-gradient-to-br from-indigo-500 to-blue-400" : "bg-gray-200"
            }`}>
              {m.role === "user" ? (
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              ) : (
                <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
            </div>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                m.role === "user"
                  ? "bg-gradient-to-br from-indigo-500 to-blue-400 text-white"
                  : "bg-white text-gray-900 border border-gray-100"
              }`}
              style={{wordBreak: 'break-word'}}
            >
              {m.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form
        onSubmit={handleSend}
        className="px-6 pb-6 pt-2 flex-shrink-0"
      >
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask how to answer a specific prompt..."
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200/40 shadow-sm"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-400 px-5 py-3 text-sm font-semibold text-white shadow-md hover:from-indigo-600 hover:to-blue-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 transition-all active:scale-[0.98] disabled:opacity-50"
            disabled={!input.trim()}
          >
            <span>Send</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
