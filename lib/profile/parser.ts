/**
 * Profile Data Parser
 * 
 * Extracts structured data (skills, experience, education, projects) from resume/transcript text
 * using LLM-based parsing for maximum flexibility and accuracy.
 */

import OpenAI from 'openai';
import type { DataSource } from '../supabase/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ParsedProfileData {
  skills: Array<{
    skill_name: string;
    category?: 'technical' | 'soft' | 'language' | 'tool' | 'framework' | 'domain_knowledge' | 'other';
    proficiency_level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
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

/**
 * Parse resume or transcript text to extract structured profile data
 */
export async function parseProfileData(
  text: string,
  source: DataSource
): Promise<ParsedProfileData> {
  const prompt = buildExtractionPrompt(text, source);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume and document parser. You extract structured information and return only valid JSON with no additional text or markdown formatting.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2, // Lower temperature for more consistent extraction
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    console.log('[parseProfileData] Raw LLM response:', responseText);
    let parsed: ParsedProfileData;
    try {
      parsed = JSON.parse(responseText) as ParsedProfileData;
    } catch (err) {
      console.error('[parseProfileData] JSON.parse error:', err, 'Response:', responseText);
      throw new Error('LLM did not return valid JSON');
    }
    console.log('[parseProfileData] Parsed object:', parsed);
    // Validate and sanitize the parsed data
    const sanitized = validateAndSanitize(parsed);
    console.log('[parseProfileData] Sanitized object:', sanitized);
    return sanitized;
  } catch (error) {
    console.error('Error parsing profile data:', error);
    throw new Error(`Failed to parse profile data: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Build the extraction prompt for the LLM
 */
function buildExtractionPrompt(text: string, source: DataSource): string {
  const sourceContext = source === 'resume' 
    ? 'This is a resume/CV document.' 
    : 'This is an academic transcript.';

  return `You are an expert resume and document parser. Extract structured information from the following ${source} text and return it in JSON format.

${sourceContext}

Extract the following information:

1. SKILLS: Identify all skills mentioned, categorize them, and estimate proficiency when indicated.
   - Categories: technical, soft, language, tool, framework, domain_knowledge, other
   - Proficiency: beginner, intermediate, advanced, expert (only if clearly stated or can be strongly inferred)
   - Years of experience: extract if mentioned (e.g., "5+ years of Python")

2. EXPERIENCE: Extract all work experience entries with:
   - Company name
   - Job title
   - Start date and end date (parse various formats to YYYY-MM-DD, YYYY-MM, or YYYY; use "present" for current)
   - Location (if mentioned)
   - Description/summary
   - Achievements (as separate bullet points)
   - Technologies used (extract from description or achievements)

3. EDUCATION: Extract all education entries with:
   - Institution name
   - Degree type and name (e.g., "Bachelor of Science in Computer Science")
   - Field of study
   - Start date and end date (or "present")
   - GPA (if mentioned, e.g., 3.75)
   - GPA scale (if mentioned, default to 4.0)
   - Honors/awards (Dean's List, Cum Laude, scholarships, etc.)
   - Relevant coursework (if listed)

4. PROJECTS: Extract all projects mentioned with:
   - Project name
   - Description
   - Role in project (if mentioned)
   - Start date and end date (or "ongoing")
   - Technologies used
   - Key achievements/features
   - URLs (GitHub, demo, etc.)

IMPORTANT GUIDELINES:
- For dates: Parse various formats (Jan 2020, 01/2020, 2020-01, January 2020) into standardized format
- For "present", "current", "now": use null for end_date and set is_current/is_ongoing to true
- Set confidence scores (0.0-1.0) based on:
  - 0.9-1.0: Explicit, clearly stated information
  - 0.7-0.89: Inferred from strong context clues
  - 0.5-0.69: Inferred from weak context or ambiguous
  - Below 0.5: Don't include (too uncertain)
- Extract technologies from bullet points and descriptions
- Separate achievements from general descriptions
- If information is missing or unclear, use null (don't make up data)
- Be conservative with proficiency levels - only include if clearly stated

Return ONLY valid JSON in this exact structure (no markdown, no explanations):

{
  "skills": [
    {
      "skill_name": "string",
      "category": "technical|soft|language|tool|framework|domain_knowledge|other",
      "proficiency_level": "beginner|intermediate|advanced|expert|null",
      "years_of_experience": number|null,
      "confidence": 0.0-1.0
    }
  ],
  "experience": [
    {
      "company_name": "string",
      "job_title": "string",
      "start_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "end_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "is_current": boolean,
      "location": "string|null",
      "description": "string|null",
      "achievements": ["string"],
      "technologies_used": ["string"],
      "confidence": 0.0-1.0
    }
  ],
  "education": [
    {
      "institution_name": "string",
      "degree": "string|null",
      "field_of_study": "string|null",
      "start_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "end_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "is_current": boolean,
      "gpa": number|null,
      "gpa_scale": number|null,
      "honors": ["string"],
      "relevant_coursework": ["string"],
      "confidence": 0.0-1.0
    }
  ],
  "projects": [
    {
      "project_name": "string",
      "description": "string|null",
      "role": "string|null",
      "start_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "end_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "is_ongoing": boolean,
      "technologies_used": ["string"],
      "achievements": ["string"],
      "project_url": "string|null",
      "confidence": 0.0-1.0
    }
  ]
}

Document Text:
${text}
`;
}

/**
 * Validate and sanitize parsed data
 */

function normalizeDateString(date: any): string | undefined {
  if (!date || typeof date !== 'string') return undefined;
  // YYYY-MM-DD (already valid)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  // YYYY-MM (add -01)
  if (/^\d{4}-\d{2}$/.test(date)) return date + '-01';
  // YYYY (add -01-01)
  if (/^\d{4}$/.test(date)) return date + '-01-01';
  // Otherwise, return undefined (invalid)
  return undefined;
}

function validateAndSanitize(data: any): ParsedProfileData {
  const result: ParsedProfileData = {
    skills: [],
    experience: [],
    education: [],
    projects: [],
  };

  // Validate skills
  if (Array.isArray(data.skills)) {
    result.skills = data.skills
      .filter((skill: any) => skill.skill_name && typeof skill.skill_name === 'string')
      .map((skill: any) => ({
        skill_name: skill.skill_name.trim(),
        category: validateCategory(skill.category),
        proficiency_level: validateProficiency(skill.proficiency_level),
        years_of_experience: validateNumber(skill.years_of_experience),
        confidence: validateConfidence(skill.confidence),
      }));
  }

  // Validate experience
  if (Array.isArray(data.experience)) {
    result.experience = data.experience
      .filter((exp: any) => exp.company_name && exp.job_title)
      .map((exp: any) => ({
        company_name: exp.company_name.trim(),
        job_title: exp.job_title.trim(),
        start_date: normalizeDateString(exp.start_date),
        end_date: normalizeDateString(exp.end_date),
        is_current: Boolean(exp.is_current),
        location: exp.location?.trim() || undefined,
        description: exp.description?.trim() || undefined,
        achievements: Array.isArray(exp.achievements) ? exp.achievements.filter((a: any) => typeof a === 'string') : [],
        technologies_used: Array.isArray(exp.technologies_used) ? exp.technologies_used.filter((t: any) => typeof t === 'string') : [],
        confidence: validateConfidence(exp.confidence),
      }));
  }

  // Validate education
  if (Array.isArray(data.education)) {
    result.education = data.education
      .filter((edu: any) => edu.institution_name)
      .map((edu: any) => ({
        institution_name: edu.institution_name.trim(),
        degree: edu.degree?.trim() || undefined,
        field_of_study: edu.field_of_study?.trim() || undefined,
        start_date: normalizeDateString(edu.start_date),
        end_date: normalizeDateString(edu.end_date),
        is_current: Boolean(edu.is_current),
        gpa: validateNumber(edu.gpa),
        gpa_scale: validateNumber(edu.gpa_scale),
        honors: Array.isArray(edu.honors) ? edu.honors.filter((h: any) => typeof h === 'string') : [],
        relevant_coursework: Array.isArray(edu.relevant_coursework) ? edu.relevant_coursework.filter((c: any) => typeof c === 'string') : [],
        confidence: validateConfidence(edu.confidence),
      }));
  }

  // Validate projects
  if (Array.isArray(data.projects)) {
    result.projects = data.projects
      .filter((proj: any) => proj.project_name)
      .map((proj: any) => ({
        project_name: proj.project_name.trim(),
        description: proj.description?.trim() || undefined,
        role: proj.role?.trim() || undefined,
        start_date: normalizeDateString(proj.start_date),
        end_date: normalizeDateString(proj.end_date),
        is_ongoing: Boolean(proj.is_ongoing),
        technologies_used: Array.isArray(proj.technologies_used) ? proj.technologies_used.filter((t: any) => typeof t === 'string') : [],
        achievements: Array.isArray(proj.achievements) ? proj.achievements.filter((a: any) => typeof a === 'string') : [],
        project_url: proj.project_url?.trim() || undefined,
        confidence: validateConfidence(proj.confidence),
      }));
  }

  return result;
}

/**
 * Validate skill category
 */
function validateCategory(category: any): 'technical' | 'soft' | 'language' | 'tool' | 'framework' | 'domain_knowledge' | 'other' | undefined {
  const validCategories = ['technical', 'soft', 'language', 'tool', 'framework', 'domain_knowledge', 'other'];
  return validCategories.includes(category) ? category : undefined;
}

/**
 * Validate proficiency level
 */
function validateProficiency(proficiency: any): 'beginner' | 'intermediate' | 'advanced' | 'expert' | undefined {
  const validLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  return validLevels.includes(proficiency) ? proficiency : undefined;
}

/**
 * Validate numeric value
 */
function validateNumber(value: any): number | undefined {
  const num = Number(value);
  return !isNaN(num) && isFinite(num) ? num : undefined;
}

/**
 * Validate confidence score
 */
function validateConfidence(confidence: any): number {
  const num = Number(confidence);
  if (isNaN(num) || !isFinite(num)) return 0.5;
  return Math.max(0, Math.min(1, num)); // Clamp between 0 and 1
}

/**
 * Calculate profile completeness score (0-100)
 */
export function calculateCompletenessScore(profileData: {
  hasSkills: boolean;
  hasExperience: boolean;
  hasEducation: boolean;
  hasProjects: boolean;
  hasBio: boolean;
  hasResume: boolean;
  hasTranscript: boolean;
  skillCount: number;
  experienceCount: number;
  educationCount: number;
  projectCount: number;
}): number {
  const weights = {
    hasSkills: 15,      // Has at least 3 skills
    hasExperience: 25,  // Has at least 1 work experience
    hasEducation: 20,   // Has at least 1 education entry
    hasProjects: 15,    // Has at least 1 project
    hasBio: 10,         // Has a bio filled out
    hasResume: 10,      // Has uploaded resume
    hasTranscript: 5,   // Has uploaded transcript (optional)
  };

  let score = 0;

  if (profileData.skillCount >= 3) score += weights.hasSkills;
  if (profileData.experienceCount >= 1) score += weights.hasExperience;
  if (profileData.educationCount >= 1) score += weights.hasEducation;
  if (profileData.projectCount >= 1) score += weights.hasProjects;
  if (profileData.hasBio) score += weights.hasBio;
  if (profileData.hasResume) score += weights.hasResume;
  if (profileData.hasTranscript) score += weights.hasTranscript;

  return score;
}
