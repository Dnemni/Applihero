
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
  previousFeedback?: any;
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
  const { content, jobDescription, settings, userId, jobId, previousFeedback } = params;

  // Retrieve contextual chunks
  const ctx = await retrieveContext({
    userId,
    jobId,
    query: `Analyze cover letter feedback for ${jobDescription}`,
    matchCount: 6,
  });

  const contextStr = ctx.map((c) => c.content).join("\n---\n");

  const systemPrompt = `You are a professional career advisor providing expert feedback. Your feedback quality determines the score:
- Exceptional letters (90-100): Compelling writing, highly relevant, specific examples, strong connection to role, professional tone
- Strong letters (80-89): Good relevance, mostly specific, clear value proposition, minor tweaks possible
- Good letters (60-79): Decent foundation, some generics mixed with specifics, needs improvement areas clear
- Adequate letters (40-59): Attempts relevance but mostly generic, significant improvements needed
- Weak letters (0-39): Lacks relevance, vague, no clear value proposition, needs major rework

Feedback quality should match letter quality: excellent letters get mostly praise with minor suggestions, weak letters get constructive critique. No arbitrary quotas.
${previousFeedback ? 'Track progress: Note if previous concerns have been addressed. Acknowledge improvements explicitly. Build on prior feedback.' : ''}`;

  const previousFeedbackContext = previousFeedback 
    ? `\n\nPREVIOUS FEEDBACK (for context and to track improvements):\n${typeof previousFeedback === 'object' && previousFeedback.suggestions ? previousFeedback.suggestions.join('\n') : JSON.stringify(previousFeedback)}`
    : '';

  const userPrompt = `Analyze this cover letter and provide expert feedback. Score should reflect actual quality (90-100 only for exceptional letters that are compelling, highly relevant, and well-executed).

COVER LETTER:
${content}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE BACKGROUND:
${contextStr}${previousFeedbackContext}

OUTPUT REQUIREMENTS:
- Return 5-8 feedback points (balance naturally based on quality, not quota).
- Each point ONE line, max 180 characters.
- CRITICAL: Extract exact phrases DIRECTLY FROM THE LETTER and put them in quotes.
- Format positive feedback: "✓ \"<exact phrase from letter>\" — why this works. <impact>"
- Format constructive: "\"<exact phrase from letter>\" — <issue>. Fix: <specific recommendation>"
- Use exact background facts only. If missing, advise to add or remove.
- If previous feedback exists: Note if the issue was addressed ("✓ Previously improved: ..."). Acknowledge progress.
- QUOTES MUST BE VERBATIM FROM THE COVER LETTER TEXT - copy exact wording, do not paraphrase.

SCORING GUIDELINES (Be honest, not generous):
- 90-100: Exceptional fit for role. Compelling narrative. Multiple specific, relevant examples. Strong writing. Clear why this candidate should be hired.
- 80-89: Strong letter. Good relevance, specific details, clear value. Minor polish needed (phrasing, structure, one example).
- 60-79: Decent foundation. Mix of specific and generic. Needs 1-2 significant improvements (more examples, stronger opening, clearer fit).
- 40-59: Mediocre. Mostly generic or unclear connection to role. Needs major work (specific examples, relevance, voice).
- 0-39: Weak. Vague, irrelevant, or confusing. Needs complete rethinking.

Strength Indicators (0-100):
- Relevance: Demonstrates knowledge of THIS role and company. References job description. Shows fit.
- Professionalism: Grammar, tone, formatting, structure. Does it feel ready to send?
- Clarity: Easy to understand. Clear what you bring and why. Logical flow.
- Impact: Memorable. Compelling. Would make hiring manager want to interview? Emotional resonance.

CRITICAL: For scores 90-100, require EVIDENCE:
- Compelling narrative (not just list of skills)
- Multiple highly specific, verified examples from background
- Clear, authentic voice
- Strong writing with no grammar/clarity issues
- Unmistakable fit for THIS job (not generic)

Return JSON only:
{
  "score": <0-100>,
  "suggestions": [
    "✓ \"strength\" — impact",
    "\"area\" — diagnosis. Fix: recommendation",
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
      temperature: 0.6, // Slightly higher for nuanced, honest assessment
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
    score: 72,
    suggestions: [
      "✓ \"Strong foundation in programming languages\" — demonstrates relevant skills, showcasing your potential to contribute effectively.",
      "\"Passionate about technology\" — too generic. Fix: Replace with specific projects or achievements that show your genuine passion.",
      "✓ \"My experience with AI-powered tools\" — specific and relevant to the role requirements.",
      "\"Seeking a role where I can grow\" — vague. Fix: Be specific about what aspects of THIS company and role align with your goals.",
      "✓ \"Contributed to a team project\" — good, but could strengthen: Add specific measurable outcomes or impact.",
    ],
    scores: {
      relevance: 75,
      professionalism: 82,
      clarity: 78,
      impact: 68,
    },
  };
}