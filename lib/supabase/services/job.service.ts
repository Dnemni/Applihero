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
        questions (*),
        referrals (*)
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

    const { data, error } = await supabase
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

  /**
   * Create a referral for a job
   */
  static async createReferral(
    jobId: string,
    referralData: {
      person_name: string;
      company?: string | null;
      title?: string | null;
      linkedin_url?: string | null;
      relation?: string | null;
    }
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Verify the job belongs to the user
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (!job) {
      console.error('Job not found or access denied');
      return false;
    }

    const { error } = await supabase
      .from('referrals')
      .insert({
        job_id: jobId,
        person_name: referralData.person_name,
        company: referralData.company || null,
        title: referralData.title || null,
        linkedin_url: referralData.linkedin_url || null,
        relation: referralData.relation || null,
      });

    if (error) {
      console.error('Error creating referral:', error);
      return false;
    }

    return true;
  }

  /**
   * Get referral for a job
   */
  static async getReferral(jobId: string): Promise<any | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Verify the job belongs to the user
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (!job) {
      console.error('Job not found or access denied');
      return null;
    }

    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('job_id', jobId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching referral:', error);
      return null;
    }

    return data;
  }

  /**
   * Update referral for a job
   */
  static async updateReferral(
    jobId: string,
    referralData: {
      person_name?: string | null;
      company?: string | null;
      title?: string | null;
      linkedin_url?: string | null;
      relation?: string | null;
    }
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Verify the job belongs to the user
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (!job) {
      console.error('Job not found or access denied');
      return false;
    }

    // Check if referral exists
    const { data: existingReferral } = await supabase
      .from('referrals')
      .select('id')
      .eq('job_id', jobId)
      .maybeSingle();

    if (existingReferral) {
      // Update existing referral
      const updateData: any = {
        linkedin_url: referralData.linkedin_url || null,
        relation: referralData.relation || null,
      };
      // Include person_name if provided
      if (referralData.person_name) {
        updateData.person_name = referralData.person_name;
      }
      if (referralData.company !== undefined) {
        updateData.company = referralData.company || null;
      }
      if (referralData.title !== undefined) {
        updateData.title = referralData.title || null;
      }

      const { error } = await supabase
        .from('referrals')
        .update(updateData)
        .eq('job_id', jobId);

      if (error) {
        console.error('Error updating referral:', error);
        return false;
      }
    } else {
      // Create new referral (person_name is required)
      if (!referralData.person_name) {
        console.error('person_name is required to create a new referral');
        return false;
      }
      const { error } = await supabase
        .from('referrals')
        .insert({
          job_id: jobId,
          person_name: referralData.person_name,
          linkedin_url: referralData.linkedin_url || null,
          relation: referralData.relation || null,
        });

      if (error) {
        console.error('Error creating referral:', error);
        return false;
      }
    }

    return true;
  }
}
