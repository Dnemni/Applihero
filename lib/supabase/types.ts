// TypeScript types for Supabase database schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type JobStatus = 'Draft' | 'In Progress' | 'Submitted' | 'Archived';
export type QuestionStatus = 'Not started' | 'Draft' | 'Final';
export type ChatRole = 'user' | 'assistant' | 'system';
export type DocumentType = 'cover_letter' | 'additional_essay' | 'other';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          first_name: string | null;
          last_name: string | null;
          email: string;
          bio: string | null;
          resume_url: string | null;
          transcript_url: string | null;
          resume_text: string | null;
          transcript_text: string | null;
          email_notifications: boolean;
          onboarding_completed: boolean;
          password_set_at: string | null;
          marketing_emails: boolean;
          active: boolean;
          created_at: string;
          updated_at: string;
          onboarding_phase: string | null;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          email: string;
          bio?: string | null;
          resume_url: string | null;
          transcript_url: string | null;
          resume_text: string | null;
          transcript_text: string | null;
          email_notifications?: boolean;
          onboarding_completed?: boolean;
          password_set_at?: string | null;
          marketing_emails?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          onboarding_phase?: string | null;
        };
        Update: {
          id?: string;
          first_name?: string | null;
          last_name?: string | null;
          email?: string;
          bio?: string | null;
          resume_url?: string | null;
          transcript_url?: string | null;
          resume_text?: string | null;
          transcript_text?: string | null;
          email_notifications?: boolean;
          onboarding_completed?: boolean;
          password_set_at?: string | null;
          marketing_emails?: boolean;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
          onboarding_phase?: string | null;
        };
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          job_title: string;
          company_name: string;
          job_description: string | null;
          discovery_job_id: string | null;
          status: JobStatus;
          created_at: string;
          updated_at: string;
          last_touched_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_title: string;
          company_name: string;
          job_description?: string | null;
          discovery_job_id?: string | null;
          status?: JobStatus;
          created_at?: string;
          updated_at?: string;
          last_touched_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          job_title?: string;
          company_name?: string;
          job_description?: string | null;
          discovery_job_id?: string | null;
          status?: JobStatus;
          created_at?: string;
          updated_at?: string;
          last_touched_at?: string;
        };
      };
      job_sources: {
        Row: {
          id: string;
          provider: string;
          external_key: string;
          company_name: string;
          config: Json;
          enabled: boolean;
          last_sync_started_at: string | null;
          last_sync_completed_at: string | null;
          last_sync_error: string | null;
          consecutive_failures: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          external_key: string;
          company_name: string;
          config?: Json;
          enabled?: boolean;
          last_sync_started_at?: string | null;
          last_sync_completed_at?: string | null;
          last_sync_error?: string | null;
          consecutive_failures?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_sources']['Insert']>;
      };
      discovery_jobs: {
        Row: {
          id: string;
          source_id: string;
          source_job_id: string;
          company_name: string;
          title: string;
          description: string;
          description_html: string | null;
          location: string | null;
          workplace_type: string | null;
          employment_type: string | null;
          departments: string[];
          source_url: string;
          apply_url: string;
          source_published_at: string | null;
          source_updated_at: string | null;
          application_deadline: string | null;
          discovered_at: string;
          last_verified_at: string;
          status: 'open' | 'unverified' | 'closed';
          consecutive_misses: number;
          raw_payload: Json;
          parsed_requirements: Json;
          parser_version: string;
          content_hash: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id: string;
          source_job_id: string;
          company_name: string;
          title: string;
          description?: string;
          description_html?: string | null;
          location?: string | null;
          workplace_type?: string | null;
          employment_type?: string | null;
          departments?: string[];
          source_url: string;
          apply_url: string;
          source_published_at?: string | null;
          source_updated_at?: string | null;
          application_deadline?: string | null;
          discovered_at?: string;
          last_verified_at?: string;
          status?: 'open' | 'unverified' | 'closed';
          consecutive_misses?: number;
          raw_payload?: Json;
          parsed_requirements?: Json;
          parser_version?: string;
          content_hash: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['discovery_jobs']['Insert']>;
      };
      job_match_runs: {
        Row: {
          id: string;
          user_id: string;
          discovery_job_id: string;
          profile_hash: string;
          job_hash: string;
          matcher_version: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          discovery_job_id: string;
          profile_hash: string;
          job_hash: string;
          matcher_version: string;
          result: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['job_match_runs']['Insert']>;
      };
      questions: {
        Row: {
          id: string;
          job_id: string;
          question_text: string;
          answer_text: string | null;
          status: QuestionStatus;
          order_index: number | null;
          feedback_score: number | null;
          feedback_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          question_text: string;
          answer_text?: string | null;
          status?: QuestionStatus;
          order_index?: number | null;
          feedback_score?: number | null;
          feedback_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          question_text?: string;
          answer_text?: string | null;
          status?: QuestionStatus;
          order_index?: number | null;
          feedback_score?: number | null;
          feedback_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          job_id: string;
          role: ChatRole;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          role: ChatRole;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          role?: ChatRole;
          content?: string;
          created_at?: string;
        };
      };
      job_documents: {
        Row: {
          id: string;
          job_id: string;
          document_type: DocumentType;
          title: string;
          content: string | null;
          document_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          document_type: DocumentType;
          title: string;
          content?: string | null;
          document_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          document_type?: DocumentType;
          title?: string;
          content?: string | null;
          document_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      resume_versions: {
        Row: {
          id: string;
          job_id: string;
          user_id: string;
          original_text: string;
          optimized_text: string;
          original_file_url: string | null;
          current_url: string | null;
          feedback_score: number | null;
          feedback_text: any | null;
          latex_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          job_id: string;
          user_id: string;
          original_text: string;
          optimized_text: string;
          original_file_url?: string | null;
          current_url?: string | null;
          feedback_score?: number | null;
          feedback_text?: any | null;
          latex_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string;
          user_id?: string;
          original_text?: string;
          optimized_text?: string;
          original_file_url?: string | null;
          current_url?: string | null;
          feedback_score?: number | null;
          feedback_text?: any | null;
          latex_code?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

// Convenience types for application use
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Job = Database['public']['Tables']['jobs']['Row'];
export type Question = Database['public']['Tables']['questions']['Row'];
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type JobDocument = Database['public']['Tables']['job_documents']['Row'];
export type ResumeVersion = Database['public']['Tables']['resume_versions']['Row'];

// Types with relations
export type JobWithQuestions = Job & {
  questions: Question[];
};

export type JobWithDetails = Job & {
  questions: Question[];
  chat_messages: ChatMessage[];
  documents: JobDocument[];
};
