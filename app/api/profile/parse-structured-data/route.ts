import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/client';
import { parseProfileData, calculateCompletenessScore } from '@/lib/profile/parser';
import type { DataSource, ProfileSkillInsert, ProfileExperienceInsert, ProfileEducationInsert, ProfileProjectInsert } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60; // Allow up to 60 seconds for LLM parsing

/**
 * POST /api/profile/parse-structured-data
 * 
 * Parse resume or transcript text to extract and store structured profile data
 * (skills, experience, education, projects)
 */
export async function POST(req: NextRequest) {
    console.log('[parse-structured-data] API route invoked');
  try {
    const { userId, source, forceReparse } = await req.json();

    // Validate inputs
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!source || !['resume', 'transcript'].includes(source)) {
      return NextResponse.json({ error: 'source must be "resume" or "transcript"' }, { status: 400 });
    }

    // Fetch the profile to get the text
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('resume_text, transcript_text, bio, resume_url, transcript_url, profile_data_sources')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching profile:', profileError);
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get the appropriate text based on source
    const text = source === 'resume' ? profile.resume_text : profile.transcript_text;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ 
        error: `No ${source} text found. Please upload a ${source} first.` 
      }, { status: 400 });
    }

    // Check if already parsed (unless forceReparse is true)
    const dataSources = profile.profile_data_sources || [];
    if (!forceReparse && dataSources.includes(source)) {
      return NextResponse.json({ 
        message: `${source} already parsed. Use forceReparse=true to re-parse.`,
        alreadyParsed: true
      }, { status: 200 });
    }

    console.log(`Parsing ${source} for user ${userId}...`);

    // Parse the text using LLM
    const parsedData = await parseProfileData(text, source as DataSource);
    console.log(`[parse-structured-data] ParsedData:`, parsedData);
    console.log(`Parsed ${source}:`, {
      skills: parsedData.skills.length,
      experience: parsedData.experience.length,
      education: parsedData.education.length,
      projects: parsedData.projects.length,
    });
    console.log(`Profile parsing for user ${userId} (${source}) complete. Structured data inserted.`);

    // If forceReparse, delete existing entries from this source
    if (forceReparse) {
      await Promise.all([
        supabaseAdmin.from('profile_skills').delete().eq('user_id', userId).eq('source', source),
        supabaseAdmin.from('profile_experience').delete().eq('user_id', userId).eq('source', source),
        supabaseAdmin.from('profile_education').delete().eq('user_id', userId).eq('source', source),
        supabaseAdmin.from('profile_projects').delete().eq('user_id', userId).eq('source', source),
      ]);
    }

    // Insert skills
    if (parsedData.skills.length > 0) {
      const skillsToInsert: ProfileSkillInsert[] = parsedData.skills.map(skill => ({
        user_id: userId,
        skill_name: skill.skill_name,
        category: skill.category || null,
        proficiency_level: skill.proficiency_level || null,
        years_of_experience: skill.years_of_experience || null,
        source: source as DataSource,
        source_confidence: skill.confidence,
      }));
      console.log(`[parse-structured-data] Inserting skills:`, skillsToInsert);
      const { error: skillsError } = await supabaseAdmin
        .from('profile_skills')
        .insert(skillsToInsert);
      if (skillsError) {
        console.error('Error inserting skills:', skillsError);
        // Don't fail the whole request, just log the error
      }
    } else {
      console.log('[parse-structured-data] No skills to insert.');
    }

    // Insert experience
    if (parsedData.experience.length > 0) {
      const experienceToInsert: ProfileExperienceInsert[] = parsedData.experience.map(exp => ({
        user_id: userId,
        company_name: exp.company_name,
        job_title: exp.job_title,
        start_date: exp.start_date || null,
        end_date: exp.end_date || null,
        is_current: exp.is_current,
        location: exp.location || null,
        description: exp.description || null,
        achievements: exp.achievements,
        technologies_used: exp.technologies_used,
        source: source as DataSource,
        source_confidence: exp.confidence,
      }));
      console.log(`[parse-structured-data] Inserting experience:`, experienceToInsert);
      const { error: expError } = await supabaseAdmin
        .from('profile_experience')
        .insert(experienceToInsert);
      if (expError) {
        console.error('Error inserting experience:', expError);
      }
    } else {
      console.log('[parse-structured-data] No experience to insert.');
    }

    // Insert education
    if (parsedData.education.length > 0) {
      const educationToInsert: ProfileEducationInsert[] = parsedData.education.map(edu => ({
        user_id: userId,
        institution_name: edu.institution_name,
        degree: edu.degree || null,
        field_of_study: edu.field_of_study || null,
        start_date: edu.start_date || null,
        end_date: edu.end_date || null,
        is_current: edu.is_current,
        gpa: edu.gpa || null,
        gpa_scale: edu.gpa_scale || 4.0,
        honors: edu.honors,
        relevant_coursework: edu.relevant_coursework,
        source: source as DataSource,
        source_confidence: edu.confidence,
      }));
      console.log(`[parse-structured-data] Inserting education:`, educationToInsert);
      const { error: eduError } = await supabaseAdmin
        .from('profile_education')
        .insert(educationToInsert);
      if (eduError) {
        console.error('Error inserting education:', eduError);
      }
    } else {
      console.log('[parse-structured-data] No education to insert.');
    }

    // Insert projects
    if (parsedData.projects.length > 0) {
      const projectsToInsert: ProfileProjectInsert[] = parsedData.projects.map(proj => ({
        user_id: userId,
        project_name: proj.project_name,
        description: proj.description || null,
        role: proj.role || null,
        start_date: proj.start_date || null,
        end_date: proj.end_date || null,
        is_ongoing: proj.is_ongoing,
        technologies_used: proj.technologies_used,
        achievements: proj.achievements,
        project_url: proj.project_url || null,
        source: source as DataSource,
        source_confidence: proj.confidence,
      }));
      console.log(`[parse-structured-data] Inserting projects:`, projectsToInsert);
      const { error: projError } = await supabaseAdmin
        .from('profile_projects')
        .insert(projectsToInsert);
      if (projError) {
        console.error('Error inserting projects:', projError);
      }
    } else {
      console.log('[parse-structured-data] No projects to insert.');
    }

    // Update profile metadata
    const updatedSources = Array.from(new Set([...dataSources, source]));

    // Calculate completeness score
    const { data: counts } = await supabaseAdmin.rpc('get_profile_counts', { p_user_id: userId }).single();
    
    // Fallback if RPC doesn't exist yet - query directly
    const [skillsCount, expCount, eduCount, projCount] = await Promise.all([
      supabaseAdmin.from('profile_skills').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('profile_experience').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('profile_education').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      supabaseAdmin.from('profile_projects').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);

    const completenessScore = calculateCompletenessScore({
      hasSkills: (skillsCount.count || 0) >= 3,
      hasExperience: (expCount.count || 0) >= 1,
      hasEducation: (eduCount.count || 0) >= 1,
      hasProjects: (projCount.count || 0) >= 1,
      hasBio: Boolean(profile.bio && profile.bio.length > 50),
      hasResume: Boolean(profile.resume_url),
      hasTranscript: Boolean(profile.transcript_url),
      skillCount: skillsCount.count || 0,
      experienceCount: expCount.count || 0,
      educationCount: eduCount.count || 0,
      projectCount: projCount.count || 0,
    });

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        profile_data_parsed_at: new Date().toISOString(),
        profile_data_sources: updatedSources,
        profile_completeness_score: completenessScore,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile metadata:', updateError);
    }

    return NextResponse.json({
      success: true,
      parsed: {
        skills: parsedData.skills.length,
        experience: parsedData.experience.length,
        education: parsedData.education.length,
        projects: parsedData.projects.length,
      },
      completenessScore,
      log: `Profile parsing for user ${userId} (${source}) complete. Structured data inserted.`
    });

  } catch (error: any) {
    console.error('Error in parse-structured-data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse structured data' },
      { status: 500 }
    );
  }
}
