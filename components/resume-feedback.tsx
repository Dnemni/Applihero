"use client";

import React from "react";
import { Sparkles, TrendingUp, AlertCircle } from "lucide-react";

interface FeedbackItem {
  section: string;
  suggestion: string;
  reason: string;
}

interface ResumeFeedbackProps {
  score: number | null;
  summary: string | null;
  strengths: string[];
  improvements: FeedbackItem[];
  keywordGaps: string[];
  priorityChanges: string[];
  isLoading?: boolean;
}

export function ResumeFeedback({
  score,
  summary,
  strengths,
  improvements,
  keywordGaps,
  priorityChanges,
  isLoading = false,
}: ResumeFeedbackProps) {
  if (isLoading) {
    return (
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 flex items-center justify-center min-h-32">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-blue-800">Generating feedback...</p>
        </div>
      </div>
    );
  }

  if (!score && !summary) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Score Display */}
      {score !== null && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Resume Score</h3>
            </div>
            <div className="text-4xl font-bold text-indigo-600">{score}</div>
          </div>
          {summary && (
            <p className="text-sm text-gray-700 italic">{summary}</p>
          )}
        </div>
      )}

      {/* Priority Changes */}
      {priorityChanges.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            Top Priorities
          </h4>
          <ul className="space-y-2">
            {priorityChanges.map((change, idx) => (
              <li key={idx} className="text-sm text-amber-800 flex gap-2">
                <span className="text-amber-600 flex-shrink-0 mt-0.5">•</span>
                <span>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="bg-green-50 rounded-xl border border-green-200 p-4">
          <h4 className="font-semibold text-green-900 mb-3 text-sm">✓ Strengths</h4>
          <ul className="space-y-2">
            {strengths.map((strength, idx) => (
              <li key={idx} className="text-sm text-green-800 flex gap-2">
                <span className="text-green-600 flex-shrink-0 mt-0.5">✓</span>
                <span>{strength}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
          <h4 className="font-semibold text-orange-900 mb-3 text-sm">→ Improvements</h4>
          <div className="space-y-3">
            {improvements.map((improvement, idx) => (
              <div key={idx} className="bg-white rounded-lg p-3 border border-orange-100">
                <p className="text-sm font-medium text-orange-900 mb-1">
                  "{improvement.section}"
                </p>
                <p className="text-sm text-gray-700 mb-1">{improvement.suggestion}</p>
                <p className="text-xs text-gray-600 italic">
                  Why: {improvement.reason}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Keyword Gaps */}
      {keywordGaps.length > 0 && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4">
          <h4 className="font-semibold text-red-900 mb-3 flex items-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4" />
            Missing Keywords
          </h4>
          <div className="flex flex-wrap gap-2">
            {keywordGaps.map((keyword, idx) => (
              <span
                key={idx}
                className="inline-block bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-medium"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
