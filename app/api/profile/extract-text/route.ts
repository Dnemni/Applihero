import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { PDFExtract } from 'pdf.js-extract';

interface ParsedResumeData {
  skills: Array<{
    name: string;
    category?: string;
    proficiency_level?: string;
    years_of_experience?: number;
  }>;
  workExperience: Array<{
    company_name: string;
    job_title: string;
    start_date?: string;
    end_date?: string;
    is_current?: boolean;
    location?: string;
    description?: string;
    achievements?: string[];
    skills_used?: string[];
  }>;
  education: Array<{
    institution_name: string;
    degree?: string;
    field_of_study?: string;
    start_date?: string;
    end_date?: string;
    is_current?: boolean;
    gpa?: string;
    honors?: string[];
    description?: string;
  }>;
}

interface ParsedTranscriptData {
  courses: Array<{
    course_code?: string;
    course_name: string;
    grade?: string;
    credits?: number;
    term?: string;
    year?: string;
  }>;
  education: Array<{
    institution_name: string;
    degree?: string;
    field_of_study?: string;
    gpa?: string;
    total_credits?: number;
    courses?: Array<{
      course_code?: string;
      course_name: string;
      grade?: string;
      credits?: number;
      term?: string;
      year?: string;
    }>;
  }>;
}

/**
 * Extract structured data from resume text using OpenAI
 */
async function extractResumeData(resumeText: string): Promise<ParsedResumeData> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Extract structured information from the following resume text. Return a JSON object with the following structure:
{
  "skills": [
    {
      "name": "skill name",
      "category": "technical|soft|language|certification",
      "proficiency_level": "beginner|intermediate|advanced|expert",
      "years_of_experience": number
    }
  ],
  "workExperience": [
    {
      "company_name": "company name",
      "job_title": "job title",
      "start_date": "YYYY-MM-DD or YYYY-MM",
      "end_date": "YYYY-MM-DD or YYYY-MM or null if current",
      "is_current": boolean,
      "location": "city, state/country",
      "description": "full job description",
      "achievements": ["achievement 1", "achievement 2"],
      "skills_used": ["skill1", "skill2"]
    }
  ],
  "education": [
    {
      "institution_name": "school/university name",
      "degree": "degree type (e.g., Bachelor of Science)",
      "field_of_study": "major/field",
      "start_date": "YYYY-MM-DD or YYYY-MM",
      "end_date": "YYYY-MM-DD or YYYY-MM or null if current",
      "is_current": boolean,
      "gpa": "GPA if mentioned",
      "honors": ["honor 1", "honor 2"],
      "description": "additional details"
    }
  ]
}

Resume text:
${resumeText}

Return ONLY valid JSON, no additional text or markdown formatting.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a resume parsing expert. Extract structured data from resumes and return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  return JSON.parse(content) as ParsedResumeData;
}

/**
 * Extract structured data from transcript text using OpenAI
 */
async function extractTranscriptData(transcriptText: string): Promise<ParsedTranscriptData> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Extract structured information from the following transcript text. Return a JSON object with the following structure:
{
  "education": [
    {
      "institution_name": "school/university name",
      "degree": "degree type (e.g., Bachelor of Science)",
      "field_of_study": "major/field",
      "gpa": "GPA if mentioned",
      "total_credits": number,
      "courses": [
        {
          "course_code": "e.g., CS101",
          "course_name": "full course name",
          "grade": "letter grade or percentage",
          "credits": number,
          "term": "Fall|Spring|Summer|Winter",
          "year": "YYYY"
        }
      ]
    }
  ]
}

Transcript text:
${transcriptText}

Return ONLY valid JSON, no additional text or markdown formatting.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a transcript parsing expert. Extract structured data from academic transcripts and return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;

  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  return JSON.parse(content) as ParsedTranscriptData;
}

/**
 * Convert letter grade to GPA points
 */
function gradeToGpaPoints(grade: string | null | undefined): number | null {
  if (!grade) return null;

  const gradeUpper = grade.trim().toUpperCase();
  const gradeMap: Record<string, number> = {
    'A+': 4.0, 'A': 4.0, 'A-': 3.7,
    'B+': 3.3, 'B': 3.0, 'B-': 2.7,
    'C+': 2.3, 'C': 2.0, 'C-': 1.7,
    'D+': 1.3, 'D': 1.0, 'D-': 0.7,
    'F': 0.0,
  };

  return gradeMap[gradeUpper] || null;
}

/**
 * Populate education and courses tables with transcript data
 */
async function populateTranscriptData(userId: string, transcriptText: string): Promise<void> {
  // Extract structured data using OpenAI
  const parsedData = await extractTranscriptData(transcriptText);

  try {
    // For each education entry in the transcript
    for (const edu of parsedData.education || []) {
      // Check if education record exists for this institution
      const { data: existingEdu } = await (supabaseAdmin.from('education') as any)
        .select('id')
        .eq('user_id', userId)
        .eq('institution_name', edu.institution_name)
        .limit(1)
        .single();

      let educationId: string;

      if (existingEdu) {
        // Update existing education record with transcript data
        await (supabaseAdmin.from('education') as any)
          .update({
            gpa: edu.gpa || existingEdu.gpa,
          })
          .eq('id', existingEdu.id);
        educationId = existingEdu.id;
        console.log(`Updated education record for ${edu.institution_name}`);
      } else {
        // Create new education record
        const { data: newEdu, error: insertError } = await (supabaseAdmin.from('education') as any)
          .insert({
            user_id: userId,
            institution_name: edu.institution_name,
            degree: edu.degree || null,
            field_of_study: edu.field_of_study || null,
            gpa: edu.gpa || null,
          })
          .select('id')
          .single();

        if (insertError || !newEdu) {
          throw new Error(`Failed to create education record: ${insertError?.message}`);
        }
        educationId = newEdu.id;
        console.log(`Created education record for ${edu.institution_name}`);
      }

      // Delete existing courses for this education record
      await (supabaseAdmin.from('courses') as any)
        .delete()
        .eq('education_id', educationId);

      // Insert courses into courses table
      if (edu.courses && edu.courses.length > 0) {
        const coursesData = edu.courses.map(course => ({
          user_id: userId,
          education_id: educationId,
          course_code: course.course_code || null,
          course_name: course.course_name,
          grade: course.grade || null,
          credits: course.credits || null,
          term: course.term || null,
          year: course.year || null,
          gpa_points: gradeToGpaPoints(course.grade),
          course_description: null, // Will be populated later with web search/AI
          learning_materials: null, // Will be populated later with web search/AI
          prerequisites: [], // Will be populated later if available
        }));

        const { error: coursesError, data: insertedCourses } = await (supabaseAdmin.from('courses') as any)
          .insert(coursesData)
          .select('id, course_code, course_name');

        if (coursesError) {
          console.error('Error inserting courses:', coursesError);
          throw coursesError;
        }

        console.log(`Inserted ${coursesData.length} courses for ${edu.institution_name}`);

        // Enrich courses with descriptions and learning materials (async, don't await)
        if (insertedCourses && insertedCourses.length > 0) {
          enrichCoursesWithMaterials(insertedCourses).catch((error) => {
            console.error('Error enriching courses with materials:', error);
            // Don't throw - enrichment failure shouldn't block transcript processing
          });
        }
      }
    }

    console.log(`Processed ${parsedData.education?.length || 0} education entries from transcript`);
  } catch (dbError: any) {
    console.error('Error populating transcript data:', dbError);
    throw dbError;
  }
}

/**
 * Enrich courses with descriptions and learning materials using AI
 */
async function enrichCoursesWithMaterials(courses: Array<{ id: string; course_code: string | null; course_name: string }>): Promise<void> {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.warn('OpenAI API key not configured, skipping course enrichment');
    return;
  }

  // Process courses in batches to avoid rate limits
  for (const course of courses) {
    try {
      const courseIdentifier = course.course_code || course.course_name;
      const prompt = `Provide information about the following academic course. Return a JSON object with:
{
  "course_description": "Brief description of what this course covers (2-3 sentences)",
  "learning_materials": "Common textbooks, online resources, or learning materials typically used for this course. List 2-3 key resources.",
  "prerequisites": ["prerequisite course code 1", "prerequisite course code 2"]
}

Course: ${courseIdentifier}

If you don't have specific information, provide general information based on the course name. Return ONLY valid JSON.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert in academic course information. Provide helpful course descriptions and learning resources.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        console.warn(`Failed to enrich course ${courseIdentifier}:`, await response.text());
        continue;
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        continue;
      }

      const enrichment = JSON.parse(content);

      // Update the course with enriched data
      await (supabaseAdmin.from('courses') as any)
        .update({
          course_description: enrichment.course_description || null,
          learning_materials: enrichment.learning_materials || null,
          prerequisites: enrichment.prerequisites || [],
        })
        .eq('id', course.id);

      console.log(`Enriched course ${courseIdentifier} with materials`);
    } catch (error: any) {
      console.error(`Error enriching course ${course.course_code || course.course_name}:`, error);
      // Continue with next course
    }
  }
}

/**
 * Normalize date string to PostgreSQL DATE format
 * Handles YYYY-MM-DD, YYYY-MM, and YYYY formats
 */
function normalizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;

  // If it's already a full date (YYYY-MM-DD), return as is
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // If it's YYYY-MM, add the first day of the month
  if (/^\d{4}-\d{2}$/.test(dateStr)) {
    return `${dateStr}-01`;
  }

  // If it's just YYYY, use January 1st
  if (/^\d{4}$/.test(dateStr)) {
    return `${dateStr}-01-01`;
  }

  // If it doesn't match any pattern, return null
  console.warn(`Invalid date format: ${dateStr}, returning null`);
  return null;
}

/**
 * Populate resume data tables from extracted text
 */
async function populateResumeData(userId: string, resumeText: string): Promise<void> {
  // Extract structured data using OpenAI
  const parsedData = await extractResumeData(resumeText);

  // Update parsing status to processing
  await (supabaseAdmin.from('resume_parsing_status') as any)
    .upsert({
      user_id: userId,
      status: 'processing',
      raw_text: resumeText,
    }, {
      onConflict: 'user_id',
    });

  try {
    // Delete existing data for this user
    await (supabaseAdmin.from('profile_skills') as any).delete().eq('user_id', userId);
    await (supabaseAdmin.from('work_experience') as any).delete().eq('user_id', userId);
    await (supabaseAdmin.from('education') as any).delete().eq('user_id', userId);

    console.log('Parsed data counts:', {
      skills: parsedData.skills?.length || 0,
      workExperience: parsedData.workExperience?.length || 0,
      education: parsedData.education?.length || 0,
    });

    // Insert skills
    if (parsedData.skills && parsedData.skills.length > 0) {
      const skillsData = parsedData.skills.map(skill => ({
        user_id: userId,
        skill_name: skill.name,
        category: skill.category || null,
        proficiency_level: skill.proficiency_level || null,
        years_of_experience: skill.years_of_experience || null,
      }));
      const { error: skillsError } = await (supabaseAdmin.from('profile_skills') as any).insert(skillsData);
      if (skillsError) {
        console.error('Error inserting skills:', skillsError);
        throw skillsError;
      }
      console.log(`Inserted ${skillsData.length} skills`);
    }

    // Insert work experience
    if (parsedData.workExperience && parsedData.workExperience.length > 0) {
      console.log('Work experience data to insert:', JSON.stringify(parsedData.workExperience, null, 2));
      const workData = parsedData.workExperience.map(work => ({
        user_id: userId,
        company_name: work.company_name,
        job_title: work.job_title,
        start_date: normalizeDate(work.start_date),
        end_date: work.is_current ? null : normalizeDate(work.end_date),
        is_current: work.is_current || false,
        location: work.location || null,
        description: work.description || null,
        achievements: work.achievements || [],
        skills_used: work.skills_used || [],
      }));
      console.log('Mapped work data:', JSON.stringify(workData, null, 2));
      const { error: workError, data: workInsertData } = await (supabaseAdmin.from('work_experience') as any).insert(workData).select();
      if (workError) {
        console.error('Error inserting work experience:', workError);
        throw workError;
      }
      console.log(`Inserted ${workData.length} work experience entries:`, workInsertData);
    } else {
      console.log('No work experience data to insert');
    }

    // Insert education
    if (parsedData.education && parsedData.education.length > 0) {
      console.log('Education data to insert:', JSON.stringify(parsedData.education, null, 2));
      const educationData = parsedData.education.map(edu => ({
        user_id: userId,
        institution_name: edu.institution_name,
        degree: edu.degree || null,
        field_of_study: edu.field_of_study || null,
        start_date: normalizeDate(edu.start_date),
        end_date: edu.is_current ? null : normalizeDate(edu.end_date),
        is_current: edu.is_current || false,
        gpa: edu.gpa || null,
        honors: edu.honors || [],
        description: edu.description || null,
      }));
      console.log('Mapped education data:', JSON.stringify(educationData, null, 2));
      const { error: educationError, data: educationInsertData } = await (supabaseAdmin.from('education') as any).insert(educationData).select();
      if (educationError) {
        console.error('Error inserting education:', educationError);
        throw educationError;
      }
      console.log(`Inserted ${educationData.length} education entries:`, educationInsertData);
    } else {
      console.log('No education data to insert');
    }

    // Update parsing status to completed
    await (supabaseAdmin.from('resume_parsing_status') as any)
      .update({
        status: 'completed',
        parsed_at: new Date().toISOString(),
        parsing_metadata: {
          skills_count: parsedData.skills?.length || 0,
          work_experience_count: parsedData.workExperience?.length || 0,
          education_count: parsedData.education?.length || 0,
        },
      })
      .eq('user_id', userId);
  } catch (dbError: any) {
    // Update parsing status to failed
    await (supabaseAdmin.from('resume_parsing_status') as any)
      .update({
        status: 'failed',
        error_message: dbError.message,
      })
      .eq('user_id', userId);
    throw dbError;
  }
}

/**
 * POST /api/profile/extract-text
 * 
 * Extracts text from uploaded PDF and stores in profile
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;
    const fileType = formData.get('fileType') as string;

    if (!file || !userId || !fileType) {
      return NextResponse.json({
        error: "Missing file, userId, or fileType"
      }, { status: 400 });
    }

    if (fileType !== 'resume' && fileType !== 'transcript') {
      return NextResponse.json({
        error: "fileType must be 'resume' or 'transcript'"
      }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract text from PDF using pdf.js-extract
    const pdfExtract = new PDFExtract();
    const options = {}; // Use default options, worker is handled automatically
    const data = await pdfExtract.extractBuffer(buffer, options);

    // Combine text from all pages
    const extractedText = data.pages
      .map(page => page.content.map(item => item.str).join(' '))
      .join('\n\n');

    if (!extractedText || extractedText.trim().length === 0) {
      return NextResponse.json({
        error: "Could not extract text from PDF"
      }, { status: 400 });
    }

    // Save text to profile
    const updateData = fileType === 'resume'
      ? { resume_text: extractedText }
      : { transcript_text: extractedText };

    const { error: updateError } = await (supabaseAdmin.from('profiles') as any)
      .update(updateData)
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json({
        error: "Failed to save extracted text"
      }, { status: 500 });
    }

    // If this is a resume, populate structured data tables
    if (fileType === 'resume') {
      try {
        await populateResumeData(userId, extractedText);
      } catch (populateError: any) {
        console.error('Error populating resume data:', populateError);
        // Don't fail the request if population fails - text extraction succeeded
      }
    }

    // If this is a transcript, populate education table with courses and grades
    if (fileType === 'transcript') {
      try {
        await populateTranscriptData(userId, extractedText);
      } catch (populateError: any) {
        console.error('Error populating transcript data:', populateError);
        // Don't fail the request if population fails - text extraction succeeded
      }
    }

    return NextResponse.json({
      success: true,
      textLength: extractedText.length,
      message: `Extracted ${extractedText.length} characters from ${fileType}`
    });

  } catch (err: any) {
    console.error("Extract text error:", err);
    return NextResponse.json({
      error: err.message || "Server error"
    }, { status: 500 });
  }
}
