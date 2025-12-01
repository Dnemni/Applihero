import { supabase } from '../client';
import type { Job, JobWithQuestions, Database, JobStatus } from '../types';

type JobInsert = Database['public']['Tables']['jobs']['Insert'];
type JobUpdate = Database['public']['Tables']['jobs']['Update'];

export class JobService {
  /**
   * Get all jobs for the current user
   */
  static async getAllJobs(): Promise<Job[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('user_id', user.id)
      .order('last_touched_at', { ascending: false });

    if (error) {
      console.error('Error fetching jobs:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a single job by ID with all related data
   */
  static async getJobById(jobId: string): Promise<JobWithQuestions | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        questions (*)
      `)
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching job:', error);
      return null;
    }

    return data as JobWithQuestions;
  }

  /**
   * Create a new job application
   */
  static async createJob(
    jobTitle: string,
    companyName: string,
    jobDescription?: string
  ): Promise<Job | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const jobData: JobInsert = {
      user_id: user.id,
      job_title: jobTitle,
      company_name: companyName,
      job_description: jobDescription || null,
      status: 'Draft'
    };

    const { data, error } = await supabase
      .from('jobs')
      .insert(jobData as any)
      .select()
      .single();

    if (error) {
      console.error('Error creating job:', error);
      return null;
    }

    return data;
  }

  /**
   * Update a job
   */
  static async updateJob(jobId: string, updates: JobUpdate): Promise<Job | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error} = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', jobId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job:', error);
      return null;
    }

    return data;
  }

  /**
   * Update job status
   */
  static async updateJobStatus(jobId: string, status: JobStatus): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data, error } = await supabase
      .from('jobs')
      .update({ status })
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating job status:', error);
      return false;
    }

    return true;
  }

  /**
   * Delete a job (and all related data via CASCADE)
   */
  static async deleteJob(jobId: string): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting job:', error);
      return false;
    }

    return true;
  }

  /**
   * Get job statistics for dashboard
   */
  static async getJobStats(): Promise<{
    total: number;
    draft: number;
    inProgress: number;
    submitted: number;
  }> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { total: 0, draft: 0, inProgress: 0, submitted: 0 };

    const { data, error } = await supabase
      .from('jobs')
      .select('status')
      .eq('user_id', user.id);

    if (error || !data) {
      console.error('Error fetching job stats:', error);
      return { total: 0, draft: 0, inProgress: 0, submitted: 0 };
    }

    const jobs = data as any[];
    return {
      total: jobs.length,
      draft: jobs.filter(j => j.status === 'Draft').length,
      inProgress: jobs.filter(j => j.status === 'In Progress').length,
      submitted: jobs.filter(j => j.status === 'Submitted').length
    };
  }
}
