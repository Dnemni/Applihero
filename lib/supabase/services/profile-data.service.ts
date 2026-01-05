/**
 * Profile Data Service
 * 
 * CRUD operations for structured profile data (skills, experience, education, projects)
 */

import { supabase } from '../client';
import type {
  ProfileSkill,
  ProfileExperience,
  ProfileEducation,
  ProfileProject,
  ProfileSkillInsert,
  ProfileExperienceInsert,
  ProfileEducationInsert,
  ProfileProjectInsert,
  ProfileSkillUpdate,
  ProfileExperienceUpdate,
  ProfileEducationUpdate,
  ProfileProjectUpdate,
} from '../types';

export class ProfileDataService {
  // ============ SKILLS ============

  /**
   * Get all skills for a user
   */
  static async getSkills(userId: string): Promise<ProfileSkill[]> {
    const { data, error } = await supabase
      .from('profile_skills')
      .select('*')
      .eq('user_id', userId)
      .order('skill_name');

    if (error) {
      console.error('Error fetching skills:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get skills grouped by category
   */
  static async getSkillsByCategory(userId: string): Promise<Record<string, ProfileSkill[]>> {
    const skills = await this.getSkills(userId);
    
    const grouped: Record<string, ProfileSkill[]> = {};
    skills.forEach((skill) => {
      const category = skill.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(skill);
    });

    return grouped;
  }

  /**
   * Add a new skill (with duplicate check)
   */
  static async addSkill(skill: ProfileSkillInsert): Promise<ProfileSkill | null> {
    // Check for duplicate skill name (case-insensitive)
    const { data: existing } = await supabase
      .from('profile_skills')
      .select('id')
      .eq('user_id', skill.user_id)
      .ilike('skill_name', skill.skill_name)
      .single();

    if (existing) {
      console.log('Skill already exists:', skill.skill_name);
      return null; // Skill already exists
    }

    const { data, error } = await supabase
      .from('profile_skills')
      .insert(skill)
      .select()
      .single();

    if (error) {
      console.error('Error adding skill:', error);
      return null;
    }

    return data;
  }

  /**
   * Update a skill
   */
  static async updateSkill(skillId: string, updates: ProfileSkillUpdate): Promise<ProfileSkill | null> {
    const { data, error } = await supabase
      .from('profile_skills')
      .update(updates)
      .eq('id', skillId)
      .select()
      .single();

    if (error) {
      console.error('Error updating skill:', error);
      return null;
    }

    return data;
  }

  /**
   * Delete a skill
   */
  static async deleteSkill(skillId: string): Promise<boolean> {
    const { error } = await supabase
      .from('profile_skills')
      .delete()
      .eq('id', skillId);

    if (error) {
      console.error('Error deleting skill:', error);
      return false;
    }

    return true;
  }

  // ============ EXPERIENCE ============

  /**
   * Get all work experience for a user
   */
  static async getExperience(userId: string): Promise<ProfileExperience[]> {
    const { data, error } = await supabase
      .from('profile_experience')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching experience:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Add new work experience (with duplicate check)
   */
  static async addExperience(experience: ProfileExperienceInsert): Promise<ProfileExperience | null> {
    // Check for duplicate (same company, title, and start date)
    const { data: existing } = await supabase
      .from('profile_experience')
      .select('id')
      .eq('user_id', experience.user_id)
      .eq('company_name', experience.company_name)
      .eq('job_title', experience.job_title)
      .eq('start_date', experience.start_date || '')
      .single();

    if (existing) {
      console.log('Experience already exists:', experience.company_name, experience.job_title);
      return null; // Experience already exists
    }

    const { data, error } = await supabase
      .from('profile_experience')
      .insert(experience)
      .select()
      .single();

    if (error) {
      console.error('Error adding experience:', error);
      return null;
    }

    return data;
  }

  /**
   * Update work experience
   */
  static async updateExperience(expId: string, updates: ProfileExperienceUpdate): Promise<ProfileExperience | null> {
    // Clean up date strings: convert empty to null, and YYYY-MM to YYYY-MM-01 for database
    const cleanedUpdates = { ...updates };
    if (cleanedUpdates.start_date === '') {
      cleanedUpdates.start_date = null;
    } else if (cleanedUpdates.start_date && /^\d{4}-\d{2}$/.test(cleanedUpdates.start_date)) {
      cleanedUpdates.start_date = `${cleanedUpdates.start_date}-01`;
    }
    if (cleanedUpdates.end_date === '') {
      cleanedUpdates.end_date = null;
    } else if (cleanedUpdates.end_date && /^\d{4}-\d{2}$/.test(cleanedUpdates.end_date)) {
      cleanedUpdates.end_date = `${cleanedUpdates.end_date}-01`;
    }
    
    const { data, error } = await supabase
      .from('profile_experience')
      .update(cleanedUpdates)
      .eq('id', expId)
      .select()
      .single();

    if (error) {
      console.error('Error updating experience:', error);
      return null;
    }

    return data;
  }

  /**
   * Delete work experience
   */
  static async deleteExperience(expId: string): Promise<boolean> {
    const { error } = await supabase
      .from('profile_experience')
      .delete()
      .eq('id', expId);

    if (error) {
      console.error('Error deleting experience:', error);
      return false;
    }

    return true;
  }

  // ============ EDUCATION ============

  /**
   * Get all education for a user
   */
  static async getEducation(userId: string): Promise<ProfileEducation[]> {
    const { data, error } = await supabase
      .from('profile_education')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching education:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Add new education (with duplicate check)
   */
  static async addEducation(education: ProfileEducationInsert): Promise<ProfileEducation | null> {
    // Check for duplicate (same institution, degree, and field of study)
    const { data: existing } = await supabase
      .from('profile_education')
      .select('id')
      .eq('user_id', education.user_id)
      .eq('institution_name', education.institution_name)
      .eq('degree', education.degree || '')
      .eq('field_of_study', education.field_of_study || '')
      .single();

    if (existing) {
      console.log('Education already exists:', education.institution_name, education.degree);
      return null; // Education already exists
    }

    const { data, error } = await supabase
      .from('profile_education')
      .insert(education)
      .select()
      .single();

    if (error) {
      console.error('Error adding education:', error);
      return null;
    }

    return data;
  }

  /**
   * Update education
   */
  static async updateEducation(eduId: string, updates: ProfileEducationUpdate): Promise<ProfileEducation | null> {
    // Clean up date strings: convert empty to null, and YYYY-MM to YYYY-MM-01 for database
    const cleanedUpdates = { ...updates };
    if (cleanedUpdates.start_date === '') {
      cleanedUpdates.start_date = null;
    } else if (cleanedUpdates.start_date && /^\d{4}-\d{2}$/.test(cleanedUpdates.start_date)) {
      cleanedUpdates.start_date = `${cleanedUpdates.start_date}-01`;
    }
    if (cleanedUpdates.end_date === '') {
      cleanedUpdates.end_date = null;
    } else if (cleanedUpdates.end_date && /^\d{4}-\d{2}$/.test(cleanedUpdates.end_date)) {
      cleanedUpdates.end_date = `${cleanedUpdates.end_date}-01`;
    }
    
    const { data, error } = await supabase
      .from('profile_education')
      .update(cleanedUpdates)
      .eq('id', eduId)
      .select()
      .single();

    if (error) {
      console.error('Error updating education:', error);
      return null;
    }

    return data;
  }

  /**
   * Delete education
   */
  static async deleteEducation(eduId: string): Promise<boolean> {
    const { error } = await supabase
      .from('profile_education')
      .delete()
      .eq('id', eduId);

    if (error) {
      console.error('Error deleting education:', error);
      return false;
    }

    return true;
  }

  // ============ PROJECTS ============

  /**
   * Get all projects for a user
   */
  static async getProjects(userId: string): Promise<ProfileProject[]> {
    const { data, error } = await supabase
      .from('profile_projects')
      .select('*')
      .eq('user_id', userId)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Add new project (with duplicate check)
   */
  static async addProject(project: ProfileProjectInsert): Promise<ProfileProject | null> {
    // Check for duplicate (same project name)
    const { data: existing } = await supabase
      .from('profile_projects')
      .select('id')
      .eq('user_id', project.user_id)
      .ilike('project_name', project.project_name)
      .single();

    if (existing) {
      console.log('Project already exists:', project.project_name);
      return null; // Project already exists
    }

    const { data, error } = await supabase
      .from('profile_projects')
      .insert(project)
      .select()
      .single();

    if (error) {
      console.error('Error adding project:', error);
      return null;
    }

    return data;
  }

  /**
   * Update project
   */
  static async updateProject(projId: string, updates: ProfileProjectUpdate): Promise<ProfileProject | null> {
    // Clean up date strings: convert empty to null, and YYYY-MM to YYYY-MM-01 for database
    const cleanedUpdates = { ...updates };
    if (cleanedUpdates.start_date === '') {
      cleanedUpdates.start_date = null;
    } else if (cleanedUpdates.start_date && /^\d{4}-\d{2}$/.test(cleanedUpdates.start_date)) {
      cleanedUpdates.start_date = `${cleanedUpdates.start_date}-01`;
    }
    if (cleanedUpdates.end_date === '') {
      cleanedUpdates.end_date = null;
    } else if (cleanedUpdates.end_date && /^\d{4}-\d{2}$/.test(cleanedUpdates.end_date)) {
      cleanedUpdates.end_date = `${cleanedUpdates.end_date}-01`;
    }
    
    const { data, error } = await supabase
      .from('profile_projects')
      .update(cleanedUpdates)
      .eq('id', projId)
      .select()
      .single();

    if (error) {
      console.error('Error updating project:', error);
      return null;
    }

    return data;
  }

  /**
   * Delete project
   */
  static async deleteProject(projId: string): Promise<boolean> {
    const { error } = await supabase
      .from('profile_projects')
      .delete()
      .eq('id', projId);

    if (error) {
      console.error('Error deleting project:', error);
      return false;
    }

    return true;
  }

  // ============ UTILITY ============

  /**
   * Get all profile data for a user
   */
  static async getAllProfileData(userId: string): Promise<{
    skills: ProfileSkill[];
    experience: ProfileExperience[];
    education: ProfileEducation[];
    projects: ProfileProject[];
  }> {
    const [skills, experience, education, projects] = await Promise.all([
      this.getSkills(userId),
      this.getExperience(userId),
      this.getEducation(userId),
      this.getProjects(userId),
    ]);

    return {
      skills,
      experience,
      education,
      projects,
    };
  }

  /**
   * Trigger re-parsing of profile data from resume or transcript
   */
  static async reparseProfileData(userId: string, source: 'resume' | 'transcript'): Promise<boolean> {
    try {
      const response = await fetch('/api/profile/parse-structured-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          source,
          forceReparse: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Error reparsing profile data:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error reparsing profile data:', error);
      return false;
    }
  }
}
