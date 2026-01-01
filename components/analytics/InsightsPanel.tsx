'use client';

import React from 'react';
import { Lightbulb, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';

interface CompletionRates {
  questions: {
    total: number;
    answered: number;
    percentage: number;
  };
  resumes: {
    total: number;
    optimized: number;
    percentage: number;
  };
  coverLetters: {
    total: number;
    generated: number;
    percentage: number;
  };
  chatMessages: {
    total: number;
  };
}

interface InsightsPanelProps {
  avgDaysToSubmit: number | null;
  completionRates: CompletionRates;
}

export function InsightsPanel({ avgDaysToSubmit, completionRates }: InsightsPanelProps) {
  const insights = [];

  // Average days to submit
  if (avgDaysToSubmit !== null && avgDaysToSubmit > 0) {
    insights.push({
      icon: Clock,
      title: 'Average Time to Submit',
      value: `${avgDaysToSubmit.toFixed(1)} days`,
      description: avgDaysToSubmit < 7
        ? 'Great! You\'re submitting applications quickly.'
        : avgDaysToSubmit < 14
        ? 'Good pace. Consider optimizing your workflow.'
        : 'Consider streamlining your application process.',
      color: 'blue',
    });
  }

  // Completion rates
  if (completionRates.questions.total > 0) {
    insights.push({
      icon: CheckCircle2,
      title: 'Question Completion',
      value: `${completionRates.questions.percentage.toFixed(0)}%`,
      description:
        completionRates.questions.percentage >= 80
          ? 'Excellent! You\'re answering most questions.'
          : completionRates.questions.percentage >= 50
          ? 'Good progress. Keep answering those questions!'
          : 'Try to answer more application questions.',
      color: 'green',
    });
  }

  if (completionRates.resumes.total > 0) {
    insights.push({
      icon: TrendingUp,
      title: 'Resume Optimization',
      value: `${completionRates.resumes.percentage.toFixed(0)}%`,
      description:
        completionRates.resumes.percentage >= 80
          ? 'Great! You\'re optimizing resumes for most jobs.'
          : completionRates.resumes.percentage >= 50
          ? 'Good! Consider optimizing more resumes.'
          : 'Try optimizing your resume for each application.',
      color: 'purple',
    });
  }

  if (completionRates.coverLetters.total > 0) {
    insights.push({
      icon: Lightbulb,
      title: 'Cover Letters Generated',
      value: `${completionRates.coverLetters.generated} of ${completionRates.coverLetters.total}`,
      description:
        completionRates.coverLetters.percentage >= 50
          ? 'Good! Cover letters can boost your chances.'
          : 'Consider generating cover letters for more applications.',
      color: 'yellow',
    });
  }

  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Insights</h3>
        <div className="flex items-center justify-center h-32 text-gray-500">
          <p>Start applying to see insights</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Insights</h3>
      <div className="space-y-4">
        {insights.map((insight, index) => {
          const Icon = insight.icon;
          const colorClasses = {
            blue: 'bg-blue-100 text-blue-600',
            green: 'bg-green-100 text-green-600',
            purple: 'bg-purple-100 text-purple-600',
            yellow: 'bg-yellow-100 text-yellow-600',
          };

          return (
            <div
              key={index}
              className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${colorClasses[insight.color as keyof typeof colorClasses]} flex items-center justify-center`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900">{insight.title}</p>
                  <p className="text-sm font-bold text-gray-900">{insight.value}</p>
                </div>
                <p className="text-xs text-gray-600">{insight.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

