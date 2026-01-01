'use client';

import React from 'react';
import { TrendingUp, Clock, Target, Calendar, Award, Users } from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, eachWeekOfInterval } from 'date-fns';

interface ApplicationStats {
  total: number;
  draft: number;
  inProgress: number;
  submitted: number;
  archived: number;
  avgDaysToSubmit: number | null;
  successRate: number | null;
  interviewRate: number | null;
}

interface SubmissionStatsProps {
  stats: ApplicationStats;
  timeline: Array<{
    period: string;
    created: number;
    submitted: number;
    inProgress: number;
    draft: number;
  }>;
}

export function SubmissionStats({ stats, timeline }: SubmissionStatsProps) {
  // Calculate submission rate
  const submissionRate = stats.total > 0 ? (stats.submitted / stats.total) * 100 : 0;

  // Calculate submissions in last 30 days
  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentSubmissions = timeline
    .filter((t) => {
      const [year, month] = t.period.split('-');
      const periodDate = new Date(parseInt(year), parseInt(month) - 1);
      return periodDate >= thirtyDaysAgo;
    })
    .reduce((sum, t) => sum + t.submitted, 0);

  // Calculate average submissions per week (last 4 weeks)
  const fourWeeksAgo = subDays(new Date(), 28);
  const recentWeeks = timeline.filter((t) => {
    const [year, month] = t.period.split('-');
    const periodDate = new Date(parseInt(year), parseInt(month) - 1);
    return periodDate >= fourWeeksAgo;
  });
  const avgSubmissionsPerWeek =
    recentWeeks.length > 0
      ? recentWeeks.reduce((sum, t) => sum + t.submitted, 0) / recentWeeks.length
      : 0;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Submission Statistics</h3>
      <div className="grid grid-cols-2 gap-4">
        {/* Submission Rate */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              <p className="text-sm font-medium text-gray-700">Submission Rate</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{submissionRate.toFixed(0)}%</p>
          </div>
          <div className="w-full bg-white/60 rounded-full h-2 mb-1">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all"
              style={{ width: `${submissionRate}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-600">
            {stats.submitted} of {stats.total} applications submitted
          </p>
        </div>

        {/* Average Time to Submit */}
        {stats.avgDaysToSubmit !== null && (
          <div className="p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-gray-700">Avg. Time to Submit</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.avgDaysToSubmit.toFixed(1)} days
              </p>
            </div>
            <p className="text-xs text-gray-600">
              {stats.avgDaysToSubmit < 7
                ? 'Excellent pace! 🚀'
                : stats.avgDaysToSubmit < 14
                ? 'Good momentum'
                : 'Consider accelerating'}
            </p>
          </div>
        )}

        {/* Recent Submissions */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <p className="text-sm font-medium text-gray-700">Last 30 Days</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{recentSubmissions}</p>
          </div>
          <p className="text-xs text-gray-600">Submissions this month</p>
        </div>

        {/* Average Per Week */}
        <div className="p-4 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              <p className="text-sm font-medium text-gray-700">Weekly Average</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {avgSubmissionsPerWeek.toFixed(1)}
            </p>
          </div>
          <p className="text-xs text-gray-600">Submissions per week</p>
        </div>

        {/* Interview Rate */}
        {stats.interviewRate !== null && stats.submitted > 0 && (
          <div className="p-4 rounded-lg bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" />
                <p className="text-sm font-medium text-gray-700">Interview Rate</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.interviewRate.toFixed(1)}%
              </p>
            </div>
            <div className="w-full bg-white/60 rounded-full h-2 mb-1">
              <div
                className="bg-amber-600 h-2 rounded-full transition-all"
                style={{ width: `${stats.interviewRate}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600">
              {stats.interviewRate > 0
                ? `${((stats.interviewRate / 100) * stats.submitted).toFixed(0)} of ${stats.submitted} got interviews`
                : 'No interviews yet'}
            </p>
          </div>
        )}

        {/* Success Rate */}
        {stats.successRate !== null && stats.submitted > 0 && (
          <div className="p-4 rounded-lg bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-600" />
                <p className="text-sm font-medium text-gray-700">Success Rate</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {stats.successRate.toFixed(1)}%
              </p>
            </div>
            <div className="w-full bg-white/60 rounded-full h-2 mb-1">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all"
                style={{ width: `${stats.successRate}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600">
              {stats.successRate > 0
                ? `${((stats.successRate / 100) * stats.submitted).toFixed(0)} of ${stats.submitted} got offers`
                : 'Keep applying! 💪'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

