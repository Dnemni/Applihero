import { supabase } from '../client';
import type { Profile, Database } from '../types';

type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

export class ProfileService {
  /**
   * Get the current user's profile
   */
  static async getCurrentProfile(): Promise<Profile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  }

  /**
   * Create a new profile (usually called after signup)
   */
  static async createProfile(profile: ProfileInsert): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .insert(profile)
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      return null;
    }

    return data;
  }

  /**
   * Update the current user's profile
   */
  static async updateProfile(updates: ProfileUpdate): Promise<Profile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      return null;
    }

    return data;
  }

  /**
   * Upload resume file to Supabase Storage
   */
  static async uploadResume(file: File): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/resume.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('Error uploading resume:', uploadError);
      return null;
    }

    const { data } = supabase.storage
      .from('resumes')
      .getPublicUrl(fileName);

    // Update profile with resume URL
    await this.updateProfile({ resume_url: data.publicUrl });

    return data.publicUrl;
  }

  /**
   * Upload transcript file to Supabase Storage
   */
  static async uploadTranscript(file: File): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/transcript.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('transcripts')
      .upload(fileName, file, { upsert: true });

    if (uploadError) {
      console.error('Error uploading transcript:', uploadError);
      return null;
    }

    const { data } = supabase.storage
      .from('transcripts')
      .getPublicUrl(fileName);

    // Update profile with transcript URL
    await this.updateProfile({ transcript_url: data.publicUrl });

    return data.publicUrl;
  }

  /**
   * Update notification preferences
   */
  static async updatePreferences(
    emailNotifications: boolean,
    marketingEmails: boolean
  ): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('profiles')
      .update({
        email_notifications: emailNotifications,
        marketing_emails: marketingEmails
      })
      .eq('id', user.id);

    if (error) {
      console.error('Error updating preferences:', error);
      return false;
    }

    return true;
  }

  /**
   * Delete user account (soft delete by setting active to false)
   */
  static async deactivateAccount(): Promise<boolean> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('profiles')
      .update({ active: false })
      .eq('id', user.id);

    if (error) {
      console.error('Error deactivating account:', error);
      return false;
    }

    // Sign out the user
    await supabase.auth.signOut();
    return true;
  }
}
