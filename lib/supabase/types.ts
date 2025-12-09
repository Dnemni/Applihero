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
          status?: JobStatus;
          created_at?: string;
          updated_at?: string;
          last_touched_at?: string;
        };
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
