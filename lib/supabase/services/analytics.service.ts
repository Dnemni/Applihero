import { supabaseAdmin } from '../client';
import type { Job, JobStatus, Database } from '../types';

type JobRow = Database['public']['Tables']['jobs']['Row'];
type QuestionRow = Database['public']['Tables']['questions']['Row'];
type ChatMessageRow = Database['public']['Tables']['chat_messages']['Row'];
type ResumeVersionRow = Database['public']['Tables']['resume_versions']['Row'];
type JobDocumentRow = Database['public']['Tables']['job_documents']['Row'];

// Cover letter type (not in Database types yet, but table exists)
type CoverLetterRow = {
  id: string;
  job_id: string;
  user_id: string;
  content: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export interface ApplicationStats {
  total: number;
  draft: number;
  inProgress: number;
  submitted: number;
  archived: number;
  avgDaysToSubmit: number | null;
  successRate: number | null; // % of submitted apps that got offers/accepted
  interviewRate: number | null; // % of submitted apps that got interviews
}

export interface StatusBreakdown {
  status: string;
  count: number;
  percentage: number;
}

export interface TimelineData {
  period: string;
  created: number;
  submitted: number;
  inProgress: number;
  draft: number;
}

export interface CompanyBreakdown {
  company: string;
  total: number;
  statuses: {
    draft: number;
    inProgress: number;
    submitted: number;
    archived: number;
  };
}

export interface ActivityHeatmap {
  date: string;
  count: number;
}

export interface CompletionRates {
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

export class AnalyticsService {
  /**
   * Get overall application statistics
   */
  static async getApplicationStats(userId: string): Promise<ApplicationStats> {
    const { data: jobs, error } = await supabaseAdmin
      .from('jobs')
      .select('status, created_at, updated_at, submitted_at, outcome, interview_stage')
      .eq('user_id', userId);

    if (error || !jobs) {
      console.error('Error fetching application stats:', error);
      return {
        total: 0,
        draft: 0,
        inProgress: 0,
        submitted: 0,
        archived: 0,
        avgDaysToSubmit: null,
        successRate: null,
        interviewRate: null,
      };
    }

    const jobsTyped = jobs as (JobRow & { outcome?: string | null; interview_stage?: string | null })[];
    const stats = {
      total: jobsTyped.length,
      draft: jobsTyped.filter((j) => j.status === 'Draft').length,
      inProgress: jobsTyped.filter((j) => j.status === 'In Progress').length,
      submitted: jobsTyped.filter((j) => j.status === 'Submitted').length,
      archived: jobsTyped.filter((j) => j.status === 'Archived').length,
      avgDaysToSubmit: null as number | null,
      successRate: null as number | null,
      interviewRate: null as number | null,
    };

    // Calculate average days to submit using submitted_at if available, otherwise fallback to updated_at
    const submittedJobs = jobsTyped.filter((j: JobRow) => j.status === 'Submitted');
    if (submittedJobs.length > 0) {
      const daysToSubmit = submittedJobs
        .map((job: JobRow) => {
          const created = new Date(job.created_at);
          // Use submitted_at if available, otherwise fallback to updated_at
          const jobWithSubmitted = job as JobRow & { submitted_at?: string | null };
          const submittedDate = jobWithSubmitted.submitted_at 
            ? new Date(jobWithSubmitted.submitted_at) 
            : new Date(job.updated_at);
          const diffTime = submittedDate.getTime() - created.getTime();
          return diffTime / (1000 * 60 * 60 * 24); // Convert to days
        })
        .filter((days: number) => days > 0); // Filter out invalid calculations

      if (daysToSubmit.length > 0) {
        stats.avgDaysToSubmit =
          daysToSubmit.reduce((a: number, b: number) => a + b, 0) / daysToSubmit.length;
      }
    }

    // Calculate success rates (only for submitted applications)
    if (stats.submitted > 0) {
      const submittedJobs = jobsTyped.filter((j) => j.status === 'Submitted');
      
      // Interview rate: % of submitted apps that got interviews or offers
      const jobsWithInterviews = submittedJobs.filter(
        (j) => j.outcome === 'interview' || j.outcome === 'offer' || j.outcome === 'accepted' || j.interview_stage !== null
      ).length;
      stats.interviewRate = (jobsWithInterviews / stats.submitted) * 100;

      // Success rate: % of submitted apps that got offers or were accepted
      const successfulJobs = submittedJobs.filter(
        (j) => j.outcome === 'offer' || j.outcome === 'accepted'
      ).length;
      stats.successRate = (successfulJobs / stats.submitted) * 100;
    }

    return stats;
  }

  /**
   * Get status breakdown with percentages
   */
  static async getStatusBreakdown(userId: string): Promise<StatusBreakdown[]> {
    const stats = await this.getApplicationStats(userId);

    if (stats.total === 0) {
      return [];
    }

    const statuses: JobStatus[] = ['Draft', 'In Progress', 'Submitted', 'Archived'];
    const breakdown: StatusBreakdown[] = statuses.map((status) => {
      const count =
        status === 'Draft'
          ? stats.draft
          : status === 'In Progress'
          ? stats.inProgress
          : status === 'Submitted'
          ? stats.submitted
          : stats.archived;

      return {
        status,
        count,
        percentage: stats.total > 0 ? (count / stats.total) * 100 : 0,
      };
    });

    return breakdown.filter((item) => item.count > 0);
  }

  /**
   * Get application timeline grouped by month
   */
  static async getApplicationTimeline(userId: string): Promise<TimelineData[]> {
    const { data: jobs, error } = await supabaseAdmin
      .from('jobs')
      .select('status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !jobs) {
      console.error('Error fetching timeline:', error);
      return [];
    }

    // Group by month
    const timelineMap = new Map<string, TimelineData>();
    const jobsTyped = jobs as JobRow[];

    jobsTyped.forEach((job: JobRow) => {
      const date = new Date(job.created_at);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!timelineMap.has(period)) {
        timelineMap.set(period, {
          period,
          created: 0,
          submitted: 0,
          inProgress: 0,
          draft: 0,
        });
      }

      const data = timelineMap.get(period)!;
      data.created++;

      if (job.status === 'Submitted') {
        data.submitted++;
      } else if (job.status === 'In Progress') {
        data.inProgress++;
      } else if (job.status === 'Draft') {
        data.draft++;
      }
    });

    return Array.from(timelineMap.values());
  }

  /**
   * Get company breakdown
   */
  static async getCompanyBreakdown(userId: string): Promise<CompanyBreakdown[]> {
    const { data: jobs, error } = await supabaseAdmin
      .from('jobs')
      .select('company_name, status')
      .eq('user_id', userId);

    if (error || !jobs) {
      console.error('Error fetching company breakdown:', error);
      return [];
    }

    const companyMap = new Map<string, CompanyBreakdown>();
    const jobsTyped = jobs as JobRow[];

    jobsTyped.forEach((job: JobRow) => {
      const company = job.company_name;
      if (!companyMap.has(company)) {
        companyMap.set(company, {
          company,
          total: 0,
          statuses: {
            draft: 0,
            inProgress: 0,
            submitted: 0,
            archived: 0,
          },
        });
      }

      const data = companyMap.get(company)!;
      data.total++;

      if (job.status === 'Draft') {
        data.statuses.draft++;
      } else if (job.status === 'In Progress') {
        data.statuses.inProgress++;
      } else if (job.status === 'Submitted') {
        data.statuses.submitted++;
      } else if (job.status === 'Archived') {
        data.statuses.archived++;
      }
    });

    return Array.from(companyMap.values()).sort((a, b) => b.total - a.total);
  }

  /**
   * Get activity heatmap for last 30 days
   */
  static async getActivityHeatmap(userId: string, days: number = 30): Promise<ActivityHeatmap[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // First get user's job IDs
    const { data: userJobs } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('user_id', userId);
    const jobIds = (userJobs as JobRow[] | null)?.map((j: JobRow) => j.id) || [];

    if (jobIds.length === 0) {
      // Return empty heatmap if no jobs
      const heatmap: ActivityHeatmap[] = [];
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        heatmap.push({
          date: date.toISOString().split('T')[0],
          count: 0,
        });
      }
      return heatmap;
    }

    // Get all activity from jobs, questions, chat_messages, resume_versions, cover_letters
    const [jobsResult, questionsResult, chatResult, resumeResult, coverLettersResult] = await Promise.all([
      supabaseAdmin
        .from('jobs')
        .select('created_at, updated_at, last_touched_at')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString()),
      supabaseAdmin
        .from('questions')
        .select('created_at, updated_at')
        .in('job_id', jobIds)
        .gte('created_at', startDate.toISOString()),
      supabaseAdmin
        .from('chat_messages')
        .select('created_at')
        .in('job_id', jobIds)
        .gte('created_at', startDate.toISOString()),
      supabaseAdmin
        .from('resume_versions')
        .select('created_at, updated_at')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString()),
      supabaseAdmin
        .from('cover_letters')
        .select('created_at, updated_at')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString()),
    ]);

    // Combine all activity dates
    const activityMap = new Map<string, number>();

    const addActivity = (dateString: string) => {
      const date = new Date(dateString);
      const dateKey = date.toISOString().split('T')[0];
      activityMap.set(dateKey, (activityMap.get(dateKey) || 0) + 1);
    };

    // Add job activities
    (jobsResult.data as JobRow[] | null)?.forEach((job: JobRow) => {
      addActivity(job.created_at);
      if (job.updated_at) addActivity(job.updated_at);
      if (job.last_touched_at) addActivity(job.last_touched_at);
    });

    // Add question activities
    (questionsResult.data as QuestionRow[] | null)?.forEach((q: QuestionRow) => {
      addActivity(q.created_at);
      if (q.updated_at) addActivity(q.updated_at);
    });

    // Add chat activities
    (chatResult.data as ChatMessageRow[] | null)?.forEach((msg: ChatMessageRow) => {
      addActivity(msg.created_at);
    });

    // Add resume activities
    (resumeResult.data as ResumeVersionRow[] | null)?.forEach((rv: ResumeVersionRow) => {
      addActivity(rv.created_at);
      if (rv.updated_at) addActivity(rv.updated_at);
    });

    // Add cover letter activities
    (coverLettersResult.data as CoverLetterRow[] | null)?.forEach((cl: CoverLetterRow) => {
      addActivity(cl.created_at);
      if (cl.updated_at) addActivity(cl.updated_at);
    });

    // Generate array for all days in range
    const heatmap: ActivityHeatmap[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateKey = date.toISOString().split('T')[0];
      heatmap.push({
        date: dateKey,
        count: activityMap.get(dateKey) || 0,
      });
    }

    return heatmap;
  }

  /**
   * Get completion rates for questions, resumes, cover letters, and chat
   */
  static async getCompletionRates(userId: string): Promise<CompletionRates> {
    // First get user's job IDs
    const { data: jobsData } = await supabaseAdmin
      .from('jobs')
      .select('id')
      .eq('user_id', userId);
    const jobIds = (jobsData as JobRow[] | null)?.map((j: JobRow) => j.id) || [];
    const totalJobs = jobIds.length;

    if (jobIds.length === 0) {
      return {
        questions: { total: 0, answered: 0, percentage: 0 },
        resumes: { total: 0, optimized: 0, percentage: 0 },
        coverLetters: { total: 0, generated: 0, percentage: 0 },
        chatMessages: { total: 0 },
      };
    }

    const [questionsResult, resumeResult, chatResult, coverLettersResult] = await Promise.all([
      supabaseAdmin
        .from('questions')
        .select('id, answer_text, status')
        .in('job_id', jobIds),
      supabaseAdmin
        .from('resume_versions')
        .select('job_id')
        .eq('user_id', userId),
      supabaseAdmin.from('chat_messages').select('id').in('job_id', jobIds),
      supabaseAdmin
        .from('cover_letters')
        .select('job_id')
        .eq('user_id', userId),
    ]);

    // Questions
    const questionsData = questionsResult.data as QuestionRow[] | null;
    const totalQuestions = questionsData?.length || 0;
    const answeredQuestions =
      questionsData?.filter((q: QuestionRow) => q.answer_text && q.answer_text.trim().length > 0)
        .length || 0;

    // Resumes - count unique jobs with resume versions
    const resumeData = resumeResult.data as ResumeVersionRow[] | null;
    const uniqueJobsWithResumes = new Set(resumeData?.map((r: ResumeVersionRow) => r.job_id) || []);
    const optimizedResumes = uniqueJobsWithResumes.size;

    // Cover letters - count unique jobs with cover letters
    const coverLettersData = coverLettersResult.data as CoverLetterRow[] | null;
    const uniqueJobsWithCoverLetters = new Set(coverLettersData?.map((c: CoverLetterRow) => c.job_id) || []);
    const coverLetters = uniqueJobsWithCoverLetters.size;

    // Chat messages
    const chatMessages = chatResult.data?.length || 0;

    return {
      questions: {
        total: totalQuestions,
        answered: answeredQuestions,
        percentage: totalQuestions > 0 ? (answeredQuestions / totalQuestions) * 100 : 0,
      },
      resumes: {
        total: totalJobs,
        optimized: optimizedResumes,
        percentage: totalJobs > 0 ? (optimizedResumes / totalJobs) * 100 : 0,
      },
      coverLetters: {
        total: totalJobs,
        generated: coverLetters,
        percentage: totalJobs > 0 ? (coverLetters / totalJobs) * 100 : 0,
      },
      chatMessages: {
        total: chatMessages,
      },
    };
  }
}

