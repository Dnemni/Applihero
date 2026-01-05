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
export type DataSource = 'resume' | 'transcript' | 'linkedin' | 'manual';
export type SkillCategory = 'technical' | 'soft' | 'language' | 'tool' | 'framework' | 'domain_knowledge' | 'other';
export type ProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

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
          profile_data_parsed_at: string | null;
          profile_data_sources: string[];
          profile_completeness_score: number;
          linkedin_id: string | null;
          linkedin_name: string | null;
          linkedin_headline: string | null;
          linkedin_avatar_url: string | null;
          linkedin_raw: any | null;
          linkedin_connected_at: string | null;
        };
        Insert: {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
          email: string;
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
          profile_data_parsed_at?: string | null;
          profile_data_sources?: string[];
          profile_completeness_score?: number;
          linkedin_id?: string | null;
          linkedin_name?: string | null;
          linkedin_headline?: string | null;
          linkedin_avatar_url?: string | null;
          linkedin_raw?: any | null;
          linkedin_connected_at?: string | null;
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
          profile_data_parsed_at?: string | null;
          profile_data_sources?: string[];
          profile_completeness_score?: number;
          linkedin_id?: string | null;
          linkedin_name?: string | null;
          linkedin_headline?: string | null;
          linkedin_avatar_url?: string | null;
          linkedin_raw?: any | null;
          linkedin_connected_at?: string | null;
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
          submitted_at: string | null;
          outcome: string | null;
          interview_stage: string | null;
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
          submitted_at?: string | null;
          outcome?: string | null;
          interview_stage?: string | null;
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
          submitted_at?: string | null;
          outcome?: string | null;
          interview_stage?: string | null;
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
      profile_skills: {
        Row: {
          id: string;
          user_id: string;
          skill_name: string;
          category: SkillCategory | null;
          proficiency_level: ProficiencyLevel | null;
          years_of_experience: number | null;
          source: DataSource;
          source_confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          skill_name: string;
          category?: SkillCategory | null;
          proficiency_level?: ProficiencyLevel | null;
          years_of_experience?: number | null;
          source: DataSource;
          source_confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          skill_name?: string;
          category?: SkillCategory | null;
          proficiency_level?: ProficiencyLevel | null;
          years_of_experience?: number | null;
          source?: DataSource;
          source_confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      profile_experience: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          job_title: string;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
          location: string | null;
          description: string | null;
          achievements: string[];
          technologies_used: string[];
          source: DataSource;
          source_confidence: number | null;
          linkedin_company_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          job_title: string;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          location?: string | null;
          description?: string | null;
          achievements?: string[];
          technologies_used?: string[];
          source: DataSource;
          source_confidence?: number | null;
          linkedin_company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          job_title?: string;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          location?: string | null;
          description?: string | null;
          achievements?: string[];
          technologies_used?: string[];
          source?: DataSource;
          source_confidence?: number | null;
          linkedin_company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      profile_education: {
        Row: {
          id: string;
          user_id: string;
          institution_name: string;
          degree: string | null;
          field_of_study: string | null;
          start_date: string | null;
          end_date: string | null;
          is_current: boolean;
          gpa: number | null;
          gpa_scale: number;
          honors: string[];
          relevant_coursework: string[];
          description: string | null;
          source: DataSource;
          source_confidence: number | null;
          linkedin_school_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          institution_name: string;
          degree?: string | null;
          field_of_study?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          gpa?: number | null;
          gpa_scale?: number;
          honors?: string[];
          relevant_coursework?: string[];
          description?: string | null;
          source: DataSource;
          source_confidence?: number | null;
          linkedin_school_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          institution_name?: string;
          degree?: string | null;
          field_of_study?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_current?: boolean;
          gpa?: number | null;
          gpa_scale?: number;
          honors?: string[];
          relevant_coursework?: string[];
          description?: string | null;
          source?: DataSource;
          source_confidence?: number | null;
          linkedin_school_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      profile_projects: {
        Row: {
          id: string;
          user_id: string;
          project_name: string;
          description: string | null;
          role: string | null;
          start_date: string | null;
          end_date: string | null;
          is_ongoing: boolean;
          technologies_used: string[];
          achievements: string[];
          project_url: string | null;
          source: DataSource;
          source_confidence: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_name: string;
          description?: string | null;
          role?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_ongoing?: boolean;
          technologies_used?: string[];
          achievements?: string[];
          project_url?: string | null;
          source: DataSource;
          source_confidence?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          project_name?: string;
          description?: string | null;
          role?: string | null;
          start_date?: string | null;
          end_date?: string | null;
          is_ongoing?: boolean;
          technologies_used?: string[];
          achievements?: string[];
          project_url?: string | null;
          source?: DataSource;
          source_confidence?: number | null;
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
export type ProfileSkill = Database['public']['Tables']['profile_skills']['Row'];
export type ProfileExperience = Database['public']['Tables']['profile_experience']['Row'];
export type ProfileEducation = Database['public']['Tables']['profile_education']['Row'];
export type ProfileProject = Database['public']['Tables']['profile_projects']['Row'];

// Insert types
export type ProfileSkillInsert = Database['public']['Tables']['profile_skills']['Insert'];
export type ProfileExperienceInsert = Database['public']['Tables']['profile_experience']['Insert'];
export type ProfileEducationInsert = Database['public']['Tables']['profile_education']['Insert'];
export type ProfileProjectInsert = Database['public']['Tables']['profile_projects']['Insert'];

// Update types
export type ProfileSkillUpdate = Database['public']['Tables']['profile_skills']['Update'];
export type ProfileExperienceUpdate = Database['public']['Tables']['profile_experience']['Update'];
export type ProfileEducationUpdate = Database['public']['Tables']['profile_education']['Update'];
export type ProfileProjectUpdate = Database['public']['Tables']['profile_projects']['Update'];

// Types with relations
export type JobWithQuestions = Job & {
  questions: Question[];
};

export type JobWithDetails = Job & {
  questions: Question[];
  chat_messages: ChatMessage[];
  documents: JobDocument[];
};

export type ProfileWithData = Profile & {
  skills: ProfileSkill[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
  projects: ProfileProject[];
};

// Parsed data structure from LLM
export interface ParsedProfileData {
  skills: Array<{
    skill_name: string;
    category?: SkillCategory;
    proficiency_level?: ProficiencyLevel;
    years_of_experience?: number;
    confidence: number;
  }>;
  experience: Array<{
    company_name: string;
    job_title: string;
    start_date?: string;
    end_date?: string;
    is_current: boolean;
    location?: string;
    description?: string;
    achievements: string[];
    technologies_used: string[];
    confidence: number;
  }>;
  education: Array<{
    institution_name: string;
    degree?: string;
    field_of_study?: string;
    start_date?: string;
    end_date?: string;
    is_current: boolean;
    gpa?: number;
    gpa_scale?: number;
    honors: string[];
    relevant_coursework: string[];
    confidence: number;
  }>;
  projects: Array<{
    project_name: string;
    description?: string;
    role?: string;
    start_date?: string;
    end_date?: string;
    is_ongoing: boolean;
    technologies_used: string[];
    achievements: string[];
    project_url?: string;
    confidence: number;
  }>;
}
