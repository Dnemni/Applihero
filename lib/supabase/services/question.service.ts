import { supabase } from '../client';
import type { Question, Database, QuestionStatus } from '../types';

type QuestionInsert = Database['public']['Tables']['questions']['Insert'];
type QuestionUpdate = Database['public']['Tables']['questions']['Update'];

export class QuestionService {
  /**
   * Get all questions for a job
   */
  static async getQuestionsForJob(jobId: string): Promise<Question[]> {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('job_id', jobId)
      .order('order_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching questions:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get a single question by ID
   */
  static async getQuestionById(questionId: string): Promise<Question | null> {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .single();

    if (error) {
      console.error('Error fetching question:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new question
   */
  static async createQuestion(
    jobId: string,
    questionText: string,
    orderIndex?: number
  ): Promise<Question | null> {
    const questionData: QuestionInsert = {
      job_id: jobId,
      question_text: questionText,
      order_index: orderIndex || null,
      status: 'Not started'
    };

    const { data, error } = await supabase
      .from('questions')
      .insert(questionData as any)
      .select()
      .single();

    if (error) {
      console.error('Error creating question:', error);
      return null;
    }

    return data;
  }

  /**
   * Update a question
   */
  static async updateQuestion(
    questionId: string,
    updates: QuestionUpdate
  ): Promise<Question | null> {
    const { data, error } = await supabase
      .from('questions')
      // @ts-expect-error - Supabase type inference issue
      .update(updates)
      .eq('id', questionId)
      .select()
      .single();

    if (error) {
      console.error('Error updating question:', error);
      return null;
    }

    return data;
  }

  /**
   * Update question text
   */
  static async updateQuestionText(
    questionId: string,
    questionText: string
  ): Promise<boolean> {
    const { error } = await supabase
      .from('questions')
      // @ts-expect-error - Supabase type inference issue
      .update({ question_text: questionText })
      .eq('id', questionId);

    if (error) {
      console.error('Error updating question text:', error);
      return false;
    }

    return true;
  }

  /**
   * Save answer for a question
   */
  static async saveAnswer(
    questionId: string,
    answerText: string,
    status?: QuestionStatus
  ): Promise<boolean> {
    const updates: QuestionUpdate = {
      answer_text: answerText,
      ...(status && { status })
    };

    const { error } = await supabase
      .from('questions')
      // @ts-expect-error - Supabase type inference issue
      .update(updates)
      .eq('id', questionId);

    if (error) {
      console.error('Error saving answer:', error);
      return false;
    }

    return true;
  }

  /**
   * Update question status
   */
  static async updateQuestionStatus(
    questionId: string,
    status: QuestionStatus
  ): Promise<boolean> {
    const { error } = await supabase
      .from('questions')
      // @ts-expect-error - Supabase type inference issue
      .update({ status })
      .eq('id', questionId);

    if (error) {
      console.error('Error updating question status:', error);
      return false;
    }

    return true;
  }

  /**
   * Delete a question
   */
  static async deleteQuestion(questionId: string): Promise<boolean> {
    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', questionId);

    if (error) {
      console.error('Error deleting question:', error);
      return false;
    }

    return true;
  }

  /**
   * Reorder questions
   */
  static async reorderQuestions(
    jobId: string,
    questionIds: string[]
  ): Promise<boolean> {
    // Update order_index for each question
    const updates = questionIds.map((id, index) => 
      supabase
        .from('questions')
        // @ts-expect-error - Supabase type inference issue
        .update({ order_index: index })
        .eq('id', id)
        .eq('job_id', jobId)
    );

    try {
      await Promise.all(updates);
      return true;
    } catch (error) {
      console.error('Error reordering questions:', error);
      return false;
    }
  }

  /**
   * Get question count by status for a job
   */
  static async getQuestionStats(jobId: string): Promise<{
    total: number;
    notStarted: number;
    draft: number;
    final: number;
  }> {
    const { data, error } = await supabase
      .from('questions')
      .select('status')
      .eq('job_id', jobId);

    if (error || !data) {
      console.error('Error fetching question stats:', error);
      return { total: 0, notStarted: 0, draft: 0, final: 0 };
    }

    const questions = data as any[];
    return {
      total: questions.length,
      notStarted: questions.filter(q => q.status === 'Not started').length,
      draft: questions.filter(q => q.status === 'Draft').length,
      final: questions.filter(q => q.status === 'Final').length
    };
  }
}
