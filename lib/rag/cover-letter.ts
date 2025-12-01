
import { openai } from "@/lib/supabase/client";
import { retrieveContext } from "./retrieval";

type TemplateGenerationParams = {
  jobTitle: string;
  company: string;
  jobDescription: string;
  userProfile: any;
  userId: string;
  jobId: string;
  templateStyle: "complete" | "outline";
  settings?: {
    tone?: "professional" | "enthusiastic" | "confident";
    formality?: number;
    length?: "concise" | "standard" | "detailed";
    focus?: string[];
  };
};

type AnalysisParams = {
  content: string;
  jobDescription: string;
  settings: any;
  userId: string;
  jobId: string;
};

type AnalysisResult = {
  score: number;
  suggestions: string[];
  scores: {
    relevance: number;
    professionalism: number;
    clarity: number;
    impact: number;
  };
};


export async function queryCoverLetterTemplates(params: TemplateGenerationParams) {
  const { jobTitle, company, jobDescription, userProfile, userId, jobId, templateStyle } = params;

  console.log('[RAG Cover Letter] Starting template generation for:', jobTitle, 'at', company, '- Style:', templateStyle);

  // Retrieve contextual chunks from resume/job description
  const ctx = await retrieveContext({
    userId,
    jobId,
    query: `Generate cover letter for ${jobTitle} at ${company}`,
    matchCount: 8,
  });

  console.log('[RAG Cover Letter] Retrieved', ctx.length, 'context chunks');
  const contextStr = ctx.map((c) => c.content).join("\n---\n");

  const systemPrompt = `You are an expert career coach who writes cover letters using ONLY factual information from provided documents. You NEVER invent, infer, or elaborate beyond what is explicitly stated. You are extremely cautious and literal - if a detail is not explicitly in the context, you do not include it. You would rather write a shorter, more generic letter than make up a single false detail.`;

  const isOutline = templateStyle === "outline";
  const templateType = isOutline ? "TEMPLATES (outlines with placeholders)" : "COMPLETE LETTERS";
  
  // Build tone and length guidance
  const toneGuidance = {
    professional: "formal, polished, business-like tone",
    enthusiastic: "energetic, passionate, excited tone showing genuine interest",
    confident: "assertive, self-assured tone highlighting strengths"
  }[params.settings?.tone || "professional"];
  
  const lengthGuidance = {
    concise: "brief and to-the-point (150-200 words)",
    standard: "standard length (250-350 words)",
    detailed: "comprehensive and thorough (400-500 words)"
  }[params.settings?.length || "standard"];
  
  const formalityLevel = params.settings?.formality || 70;
  const focusAreas = params.settings?.focus || ["skills", "experience"];
  
  const userPrompt = `You are creating personalized cover letters based on a candidate's actual background. Generate 3 UNIQUE, CREATIVE cover letter ${templateType}.

CANDIDATE BACKGROUND:
Name: ${userProfile?.first_name} ${userProfile?.last_name}
Bio: ${userProfile?.bio || "N/A"}

JOB DETAILS:
Position: ${jobTitle} at ${company}
Job Description: ${jobDescription}

ACTUAL CANDIDATE INFORMATION FROM RESUME, TRANSCRIPT & BIO:
${contextStr}

STYLE REQUIREMENTS (STRICTLY FOLLOW THESE):
- Tone: ${toneGuidance}
- Formality Level: ${formalityLevel}/100 (${formalityLevel > 80 ? "very formal" : formalityLevel > 60 ? "moderately formal" : formalityLevel > 40 ? "balanced casual-formal" : "casual and conversational"})
- Length: ${lengthGuidance}
- Focus Areas: ${focusAreas.join(", ")} - emphasize these aspects heavily
${focusAreas.includes("skills") ? "- Lead with technical capabilities and tools" : ""}
${focusAreas.includes("experience") ? "- Highlight past roles, internships, and work history" : ""}
${focusAreas.includes("culture-fit") ? "- Connect personal values and interests with company culture" : ""}
${focusAreas.includes("achievements") ? "- Showcase measurable results and accomplishments" : ""}

CRITICAL - NO GENERIC TEMPLATES:
- DO NOT use cookie-cutter structures like "Opening Hook / Technical Skills / Relevant Experience / Company Fit / Closing"
- DO NOT use the same paragraph structure or sections across all 3 templates
- Each template should have a COMPLETELY DIFFERENT structure and flow
- BE CREATIVE with how you organize information - not every letter needs the same sections
- Some letters can start with a story, others with a bold statement, others with a question
- Vary sentence structure, paragraph length, and organization dramatically
- Make each template feel like it was written by a different person with a different style

CRITICAL - ONLY USE EXACT FACTS FROM CONTEXT (THIS IS MANDATORY):
- READ THE CONTEXT CAREFULLY - every project, course, company, and achievement mentioned MUST appear exactly in the context
- DO NOT combine concepts from context to create new ideas (e.g., if context mentions "Python" and "likes outdoors" separately, DO NOT invent "outdoor Python app")
- DO NOT make logical inferences or connections that aren't explicitly stated
- DO NOT describe projects or experiences in more detail than what's in the context
- If the context says "worked on a web application", DO NOT elaborate what the app did unless stated
- If you cannot find enough specific information in the context, write LESS or use [PLACEHOLDER]
- VERIFY: Before including ANY specific detail, ask yourself "Is this EXACT detail stated in the context above?"
- Better to be vague and generic than to make up a single detail (Can include brackets to remind the user to go more in depth)
- When in doubt, LEAVE IT OUT

EXAMPLES OF WHAT NOT TO DO:
❌ Context says "Python, Java" + "likes hiking" → DO NOT write "built hiking app in Python"
❌ Context says "group project" → DO NOT write "led a team of 5 students"  
❌ Context says "internship at Company X" → DO NOT write "increased efficiency by 30%" unless that exact metric is stated
❌ Context mentions technologies A, B, C separately → DO NOT write "integrated A with B to achieve C"

WHAT TO DO INSTEAD:
✅ Only mention projects by their exact names/descriptions from the resume, bio, transcript, and job description contexts
✅ Only mention technologies that are explicitly listed
✅ Only mention achievements with the exact metrics stated
✅ Use general statements when specifics aren't in context: "worked on software projects" instead of inventing project details

Create 3 DRASTICALLY DIFFERENT approaches (not just "skills/experience/story"):
Think outside the box - be creative with structure, opening, organization, and emphasis. Examples:
- Start with a personal anecdote from the context
- Open with a question or bold statement
- Use a problem-solution structure
- Write as a narrative journey
- Lead with the company's mission and connect backward
- Emphasize numbers and metrics throughout
- Focus on a single transformative project/experience
- Create a conversational, dialogue-like tone

For each template:
- Title: Creative, not generic
- Preview: First 100 characters
- Full content following the style requirements above
- Match score (0-100)

Format as JSON array with this structure:
[
  {
    "id": "template-1",
    "title": "Skills-Focused Approach",
    "preview": "Dear Hiring Manager, I am writing to...",
    "fullContent": ${isOutline ? `"Dear Hiring Manager,\n\n**Opening Hook**\n[Write 1-2 sentences about why you're excited about this ${jobTitle} role at ${company}. Mention something specific about the company's mission or products.]\n\n**Technical Skills**\n[Highlight 2-3 relevant technical skills from: Python, Java, JavaScript, etc. Give a brief example of how you've used each.]\n\n**Relevant Experience**\n[Describe a project or internship where you demonstrated these skills. Include specific outcomes or metrics if possible.]\n\n**Company Fit**\n[Explain why you're specifically interested in ${company}. Reference their values, products, or mission.]\n\n**Closing**\n[Express enthusiasm and indicate your availability for an interview.]\n\nBest regards,\n${userProfile?.first_name} ${userProfile?.last_name}"` : `"Dear Hiring Manager,\n\n[Full letter content here with actual details from context - 250-350 words]\n\nSincerely,\n${userProfile?.first_name} ${userProfile?.last_name}"`},
    "matchScore": 85
  },
  ...
]

${isOutline ? "Make the templates clear, actionable outlines that guide the user without writing everything for them." : "Make the letters professional, personalized, and compelling using specific details from the job description and resume context above."}`;

  try {
    console.log('[RAG Cover Letter] Calling OpenAI for template generation...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature = more literal, less creative/hallucination
    });

    const text = completion.choices[0].message?.content || "";
    console.log('[RAG Cover Letter] OpenAI response received, parsing JSON...');
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const templates = JSON.parse(jsonMatch[0]);
      console.log('[RAG Cover Letter] Successfully parsed', templates.length, 'templates');
      return templates;
    } else {
      console.error('[RAG Cover Letter] No JSON array found in response');
    }
  } catch (error) {
    console.error("[RAG Cover Letter] Error generating cover letter templates:", error);
  }

  // Fallback templates if parsing fails
  return [
      {
        id: "template-1",
        title: "Professional & Direct",
        preview: "I am writing to express my strong interest in the " + jobTitle + " position...",
        fullContent: `Dear Hiring Manager,

I am writing to express my strong interest in the ${jobTitle} position at ${company}. With my background and skills, I am confident I can contribute meaningfully to your team.

[Your experience and qualifications here]

I am excited about the opportunity to bring my expertise to ${company} and contribute to your mission.

Best regards,
${userProfile?.first_name} ${userProfile?.last_name}`,
        matchScore: 80,
      },
      {
        id: "template-2",
        title: "Skills-Emphasized",
        preview: "As a skilled professional with expertise in the field, I am excited to apply...",
        fullContent: `Dear Hiring Manager,

As a skilled professional with relevant expertise, I am excited to apply for the ${jobTitle} position at ${company}. My technical background aligns perfectly with your requirements.

[Your skills and technical expertise here]

I look forward to the opportunity to discuss how my skills can benefit ${company}.

Sincerely,
${userProfile?.first_name} ${userProfile?.last_name}`,
        matchScore: 85,
      },
      {
        id: "template-3",
        title: "Culture-Focused",
        preview: "I have long admired " + company + "'s commitment to innovation...",
        fullContent: `Dear Hiring Manager,

I have long admired ${company}'s commitment to innovation and excellence. The ${jobTitle} position represents an ideal opportunity to align my career with an organization I deeply respect.

[Your values and cultural fit here]

I am excited about the possibility of contributing to ${company}'s continued success.

Warm regards,
${userProfile?.first_name} ${userProfile?.last_name}`,
        matchScore: 78,
      },
    ];
}

export async function analyzeCoverLetter(params: AnalysisParams) {
  const { content, jobDescription, settings, userId, jobId } = params;

  // Retrieve contextual chunks
  const ctx = await retrieveContext({
    userId,
    jobId,
    query: `Analyze cover letter feedback for ${jobDescription}`,
    matchCount: 6,
  });

  const contextStr = ctx.map((c) => c.content).join("\n---\n");

  const systemPrompt = `You are a professional career advisor. Provide concise, high-signal feedback grounded ONLY in the provided background. Quote exact fragments, diagnose the issue, and give a concrete fix. Be direct and professional, not conversational.`;

  const userPrompt = `Analyze this cover letter and provide concise, structured feedback.

COVER LETTER:
${content}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE BACKGROUND (resume, transcript, bio):
${contextStr}

OUTPUT REQUIREMENTS (STRICT):
- Return 4–6 suggestions.
- Each suggestion must be ONE line, max 180 characters.
- Structure each suggestion like: "\"<quoted phrase from letter>\" — <diagnosis>. Fix: <specific recommendation using actual background>."
- Only use facts present in the background; if missing, advise to add [specific evidence from background] or remove the claim.

EXAMPLES (STYLE ONLY, DO NOT REUSE CONTENT):
- "\"passionate about sustainability\" — generic. Fix: cite [course/project from transcript/resume] that demonstrates this, e.g., 'Through [course], I…'"
- "\"various projects\" — vague. Fix: name [project from resume] and outcome: 'Built X using Y; improved Z by N%.'"
- "\"strong programming skills\" — unsupported. Fix: list skills from background: 'Proficient in A, B, C via [course/project].'"

Return JSON only:
{
  "score": <0-100>,
  "suggestions": [
    "\"<quote>\" — <diagnosis>. Fix: <concise recommendation using background>",
    "..."
  ],
  "scores": { "relevance": <0-100>, "professionalism": <0-100>, "clarity": <0-100>, "impact": <0-100> }
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more factual feedback
    });

    const text = completion.choices[0].message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("Error analyzing cover letter:", error);
  }

  // Fallback
  return {
    score: 79,
    suggestions: [
      "Consider adding specific examples of your achievements",
      "Strengthen your opening paragraph to grab attention",
      "Connect your skills more explicitly to job requirements",
      "Include measurable results or metrics from past work",
    ],
    scores: {
      relevance: 80,
      professionalism: 85,
      clarity: 75,
      impact: 78,
    },
  };
}