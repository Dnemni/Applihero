import { supabase } from '../client';
import type { ChatMessage, Database, ChatRole } from '../types';

type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];

export class ChatService {
  /**
   * Get all chat messages for a job
   */
  static async getChatHistory(jobId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching chat history:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Add a message to the chat
   */
  static async addMessage(
    jobId: string,
    role: ChatRole,
    content: string
  ): Promise<ChatMessage | null> {
    const messageData: ChatMessageInsert = {
      job_id: jobId,
      role,
      content
    };

    const { data, error } = await supabase
      .from('chat_messages')
      .insert(messageData as any)
      .select()
      .single();

    if (error) {
      console.error('Error adding chat message:', error);
      return null;
    }

    return data;
  }

  /**
   * Add a user message to the chat
   */
  static async addUserMessage(
    jobId: string,
    content: string
  ): Promise<ChatMessage | null> {
    return this.addMessage(jobId, 'user', content);
  }

  /**
   * Add an assistant message to the chat
   */
  static async addAssistantMessage(
    jobId: string,
    content: string
  ): Promise<ChatMessage | null> {
    return this.addMessage(jobId, 'assistant', content);
  }

  /**
   * Clear all messages for a job (useful for resetting conversation)
   */
  static async clearChatHistory(jobId: string): Promise<boolean> {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .eq('job_id', jobId);

    if (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }

    return true;
  }

  /**
   * Get recent messages (useful for context in LLM calls)
   */
  static async getRecentMessages(
    jobId: string,
    limit: number = 10
  ): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent messages:', error);
      return [];
    }

    // Reverse to get chronological order
    return (data || []).reverse();
  }

  /**
   * Get message count for a job
   */
  static async getMessageCount(jobId: string): Promise<number> {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('job_id', jobId);

    if (error) {
      console.error('Error counting messages:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Initialize chat with system message (if needed)
   */
  static async initializeChat(
    jobId: string,
    systemPrompt?: string
  ): Promise<boolean> {
    // Check if chat already has messages
    const count = await this.getMessageCount(jobId);
    if (count > 0) return true;

    // Add initial assistant greeting
    const greeting = systemPrompt || 
      "Hi! Paste a question from the application or ask how to position your experience.";
    
    const result = await this.addAssistantMessage(jobId, greeting);
    return result !== null;
  }

  /**
   * Send message to RAG-enabled chat API and get response
   */
  static async sendMessage(
    jobId: string,
    userId: string,
    message: string
  ): Promise<string> {
    const response = await fetch(`/api/jobsessions/${jobId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, userId }),
    });

    if (!response.ok) {
      throw new Error(`Chat API error: ${response.status}`);
    }

    const data = await response.json();
    return data.reply;
  }
}
