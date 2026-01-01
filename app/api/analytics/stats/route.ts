import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/lib/supabase';
import { AnalyticsService } from '@/lib/supabase/services';

/**
 * GET /api/analytics/stats
 * 
 * Get all analytics data for the current user
 * Aggregates data from jobs, questions, resume_versions, chat_messages, job_documents
 */
export async function GET(req: NextRequest) {
  try {
    // Get userId from query params (sent from frontend)
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Get all analytics data in parallel
    const [
      overview,
      statusBreakdown,
      timeline,
      companyBreakdown,
      activityHeatmap,
      completionRates,
    ] = await Promise.all([
      AnalyticsService.getApplicationStats(userId),
      AnalyticsService.getStatusBreakdown(userId),
      AnalyticsService.getApplicationTimeline(userId),
      AnalyticsService.getCompanyBreakdown(userId),
      AnalyticsService.getActivityHeatmap(userId, 30),
      AnalyticsService.getCompletionRates(userId),
    ]);

    return NextResponse.json({
      overview,
      statusBreakdown,
      timeline,
      companyBreakdown,
      activityHeatmap,
      completionRates,
    });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

