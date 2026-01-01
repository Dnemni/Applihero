'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Header } from '@/components/header';
import { StatsCard } from '@/components/analytics/StatsCard';
import { StatusChart } from '@/components/analytics/StatusChart';
import { TimelineChart } from '@/components/analytics/TimelineChart';
import { CompanyBreakdown } from '@/components/analytics/CompanyBreakdown';
import { ActivityHeatmap } from '@/components/analytics/ActivityHeatmap';
import { InsightsPanel } from '@/components/analytics/InsightsPanel';
import { SubmissionStats } from '@/components/analytics/SubmissionStats';
import {
  Briefcase,
  FileText,
  CheckCircle2,
  Clock,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import type {
  ApplicationStats,
  StatusBreakdown,
  TimelineData,
  CompanyBreakdown as CompanyBreakdownType,
  ActivityHeatmap as ActivityHeatmapType,
  CompletionRates,
} from '@/lib/supabase/services/analytics.service';

interface AnalyticsData {
  overview: ApplicationStats;
  statusBreakdown: StatusBreakdown[];
  timeline: TimelineData[];
  companyBreakdown: CompanyBreakdownType[];
  activityHeatmap: ActivityHeatmapType[];
  completionRates: CompletionRates;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  async function checkAuthAndLoadData() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setRedirecting(true);
      setTimeout(() => router.push('/login'), 1500);
      return;
    }

    await loadAnalytics(user.id);
  }

  async function loadAnalytics(userId: string) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/analytics/stats?userId=${userId}`);
      if (!response.ok) {
        throw new Error('Failed to load analytics');
      }
      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err: any) {
      console.error('Error loading analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
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
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col">
        <Header showDashboard />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col">
        <Header showDashboard />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-medium text-gray-900 mb-2">Error loading analytics</p>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  await loadAnalytics(user.id);
                }
              }}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { overview, statusBreakdown, timeline, companyBreakdown, activityHeatmap, completionRates } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex flex-col">
      <Header showDashboard />

      <div className="max-w-7xl mx-auto px-8 py-12 flex-1 w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Analytics Dashboard</h1>
          <p className="text-lg text-gray-600">
            Track your job application progress and performance
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <StatsCard
            title="Total Applications"
            value={overview.total}
            icon={Briefcase}
          />
          <StatsCard
            title="In Progress"
            value={overview.inProgress}
            subtitle={`${statusBreakdown.find((s) => s.status === 'In Progress')?.percentage.toFixed(1) || 0}% of total`}
            icon={TrendingUp}
          />
          <StatsCard
            title="Submitted"
            value={overview.submitted}
            subtitle={`${statusBreakdown.find((s) => s.status === 'Submitted')?.percentage.toFixed(1) || 0}% of total`}
            icon={CheckCircle2}
          />
          <StatsCard
            title="Draft"
            value={overview.draft}
            subtitle={`${statusBreakdown.find((s) => s.status === 'Draft')?.percentage.toFixed(1) || 0}% of total`}
            icon={FileText}
          />
          {overview.avgDaysToSubmit !== null && (
            <StatsCard
              title="Avg. Time to Submit"
              value={`${overview.avgDaysToSubmit.toFixed(1)} days`}
              icon={Clock}
            />
          )}
          <StatsCard
            title="Chat Messages"
            value={completionRates.chatMessages.total}
            subtitle="AI coaching interactions"
            icon={MessageSquare}
          />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <StatusChart data={statusBreakdown} />
          <TimelineChart data={timeline} />
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CompanyBreakdown data={companyBreakdown} />
          <div className="space-y-6">
            <ActivityHeatmap data={activityHeatmap} />
            <SubmissionStats stats={overview} timeline={timeline} />
          </div>
        </div>

        {/* Insights */}
        <div className="mb-6">
          <InsightsPanel
            avgDaysToSubmit={overview.avgDaysToSubmit}
            completionRates={completionRates}
          />
        </div>

        {/* Completion Rates Section */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Completion Rates</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Questions</p>
                <p className="text-lg font-bold text-gray-900">
                  {completionRates.questions.percentage.toFixed(0)}%
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all"
                  style={{ width: `${completionRates.questions.percentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {completionRates.questions.answered} of {completionRates.questions.total} answered
              </p>
            </div>

            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Resumes Optimized</p>
                <p className="text-lg font-bold text-gray-900">
                  {completionRates.resumes.percentage.toFixed(0)}%
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${completionRates.resumes.percentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {completionRates.resumes.optimized} of {completionRates.resumes.total} optimized
              </p>
            </div>

            <div className="p-4 rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Cover Letters</p>
                <p className="text-lg font-bold text-gray-900">
                  {completionRates.coverLetters.percentage.toFixed(0)}%
                </p>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all"
                  style={{ width: `${completionRates.coverLetters.percentage}%` }}
                ></div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {completionRates.coverLetters.generated} of {completionRates.coverLetters.total} generated
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

