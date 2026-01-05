# Enhanced Profile Data Implementation Plan

## Overview
Implement structured profile data extraction and storage for skills, experience, education, and projects. The system will automatically parse uploaded resumes and transcripts to populate these fields, creating a rich profile that can be leveraged for job applications and resume optimization.

## Goals
1. Extract structured data from resume/transcript text after it's parsed
2. Store skills, experience, education, and projects in dedicated tables
3. Support multiple data sources (resume, transcript, LinkedIn, manual)
4. Maintain data provenance and confidence scores
5. Provide UI for viewing and editing structured profile data
6. Use AI to intelligently parse and categorize information

## Database Schema Design

### 1. `profile_skills` Table
Stores individual skills with categorization and proficiency levels.

```sql
CREATE TABLE profile_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  category TEXT, -- 'technical', 'soft', 'language', 'tool', 'framework', 'other'
  proficiency_level TEXT, -- 'beginner', 'intermediate', 'advanced', 'expert'
  years_of_experience INTEGER, -- Optional: how many years using this skill
  source TEXT NOT NULL, -- 'resume', 'transcript', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2), -- 0.00 to 1.00 for AI-parsed data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_name)
);

CREATE INDEX idx_profile_skills_user_id ON profile_skills(user_id);
CREATE INDEX idx_profile_skills_category ON profile_skills(category);
```

**Rationale:**
- Skills are frequently queried and matched against job descriptions
- Category helps organize skills in the UI
- Proficiency level allows for skill leveling
- Source tracking maintains data provenance
- Confidence score helps identify AI-parsed vs. manually entered data

### 2. `profile_experience` Table
Stores work experience history.

```sql
CREATE TABLE profile_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  start_date DATE,
  end_date DATE, -- NULL if current position
  is_current BOOLEAN DEFAULT false,
  location TEXT,
  description TEXT, -- Overall role description
  achievements TEXT[], -- Array of bullet points for achievements
  technologies_used TEXT[], -- Array of technologies/tools used
  source TEXT NOT NULL, -- 'resume', 'transcript', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2),
  linkedin_company_id TEXT, -- For LinkedIn integration
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profile_experience_user_id ON profile_experience(user_id);
CREATE INDEX idx_profile_experience_dates ON profile_experience(start_date DESC, end_date DESC);
CREATE INDEX idx_profile_experience_current ON profile_experience(user_id, is_current) WHERE is_current = true;
```

**Rationale:**
- Experience is critical for resume generation and job matching
- Achievements stored as array for easy bullet point generation
- Technologies used can be cross-referenced with skills
- Date indexing enables chronological sorting

### 3. `profile_education` Table
Stores educational background.

```sql
CREATE TABLE profile_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  degree TEXT, -- 'Bachelor of Science', 'Master of Arts', 'PhD', etc.
  field_of_study TEXT, -- 'Computer Science', 'Business Administration', etc.
  start_date DATE,
  end_date DATE, -- NULL if currently enrolled
  is_current BOOLEAN DEFAULT false,
  gpa DECIMAL(3,2), -- e.g., 3.75
  gpa_scale DECIMAL(3,2) DEFAULT 4.00, -- e.g., 4.0 or 5.0
  honors TEXT[], -- Array of honors, awards, dean's list, etc.
  relevant_coursework TEXT[], -- Array of relevant courses
  description TEXT, -- Additional context
  source TEXT NOT NULL, -- 'resume', 'transcript', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2),
  linkedin_school_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profile_education_user_id ON profile_education(user_id);
CREATE INDEX idx_profile_education_dates ON profile_education(start_date DESC, end_date DESC);
```

**Rationale:**
- Education is essential for entry-level and academic positions
- GPA and honors are often required for applications
- Relevant coursework helps demonstrate specific knowledge areas
- Transcript parsing can auto-populate this

### 4. `profile_projects` Table
Stores personal, academic, or professional projects.

```sql
CREATE TABLE profile_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  description TEXT,
  role TEXT, -- 'Lead Developer', 'Team Member', 'Solo Project', etc.
  start_date DATE,
  end_date DATE, -- NULL if ongoing
  is_ongoing BOOLEAN DEFAULT false,
  technologies_used TEXT[], -- Array of technologies/frameworks used
  achievements TEXT[], -- Array of key accomplishments or features
  project_url TEXT, -- GitHub, portfolio, demo link, etc.
  source TEXT NOT NULL, -- 'resume', 'transcript', 'manual'
  source_confidence DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profile_projects_user_id ON profile_projects(user_id);
CREATE INDEX idx_profile_projects_dates ON profile_projects(start_date DESC, end_date DESC);
```

**Rationale:**
- Projects are highly valuable for demonstrating practical skills
- Often featured prominently on resumes, especially for tech roles
- Technologies used can be cross-referenced with skills
- URLs provide validation and deeper insight

### 5. Update `profiles` Table
Add metadata fields to track parsing status.

```sql
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS profile_data_parsed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_data_sources TEXT[] DEFAULT '{}', -- Array of sources that have been parsed
  ADD COLUMN IF NOT EXISTS profile_completeness_score INTEGER DEFAULT 0; -- 0-100 score
```

**Rationale:**
- Tracks when profile data was last parsed to avoid redundant processing
- Sources array indicates which data sources have been processed
- Completeness score helps guide users to fill in missing information

## AI Parsing Strategy

### Approach: LLM-Based Structured Extraction

**Why LLM over Regex:**
- Resumes have highly variable formats
- Context-aware parsing (e.g., "Python" as skill vs. language vs. snake)
- Can infer categories, proficiency, and relationships
- Handles ambiguity and incomplete information
- Can extract dates in various formats (Jan 2020, 01/2020, 2020-01, etc.)

**LLM Prompt Structure:**
```typescript
const EXTRACTION_PROMPT = `
You are an expert resume parser. Extract structured information from the following resume text and return it in JSON format.

Extract the following information:

1. SKILLS: Identify all skills mentioned, categorize them, and estimate proficiency when indicated.
   - Categories: technical, soft, language, tool, framework, domain_knowledge
   - Proficiency: beginner, intermediate, advanced, expert (only if clearly stated)

2. EXPERIENCE: Extract all work experience entries with:
   - Company name
   - Job title
   - Start date and end date (or "present")
   - Location (if mentioned)
   - Description/summary
   - Achievements (as bullet points)
   - Technologies used

3. EDUCATION: Extract all education entries with:
   - Institution name
   - Degree type and name
   - Field of study
   - Start date and end date (or "present")
   - GPA (if mentioned)
   - Honors/awards
   - Relevant coursework (if listed)

4. PROJECTS: Extract all projects mentioned with:
   - Project name
   - Description
   - Role in project
   - Start date and end date (or "ongoing")
   - Technologies used
   - Key achievements/features
   - URLs (GitHub, demo, etc.)

Return JSON in this exact structure:
{
  "skills": [
    {
      "skill_name": "string",
      "category": "technical|soft|language|tool|framework|domain_knowledge",
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
      "end_date": "YYYY-MM-DD|YYYY-MM|YYYY|null|present",
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
      "degree": "string",
      "field_of_study": "string|null",
      "start_date": "YYYY-MM-DD|YYYY-MM|YYYY|null",
      "end_date": "YYYY-MM-DD|YYYY-MM|YYYY|null|present",
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
      "end_date": "YYYY-MM-DD|YYYY-MM|YYYY|null|ongoing",
      "is_ongoing": boolean,
      "technologies_used": ["string"],
      "achievements": ["string"],
      "project_url": "string|null",
      "confidence": 0.0-1.0
    }
  ]
}

Resume Text:
{resume_text}
`;
```

**Confidence Scoring:**
- 0.9-1.0: Explicit, clearly stated information
- 0.7-0.89: Inferred from strong context clues
- 0.5-0.69: Inferred from weak context or ambiguous
- 0.0-0.49: Highly uncertain, may need verification

## Implementation Flow

### 1. Trigger Points
The parsing should be triggered when:
- User uploads a new resume (after text extraction in `/api/profile/extract-text`)
- User uploads a new transcript (after text extraction in `/api/profile/extract-text`)
- User manually clicks "Re-parse Profile Data" button in profile settings

### 2. API Route: `/api/profile/parse-structured-data`

**Purpose:** Parse resume/transcript text and populate structured data tables.

**Input:**
```typescript
{
  userId: string;
  source: 'resume' | 'transcript'; // Which text to parse
  forceReparse?: boolean; // Override existing data
}
```

**Process:**
1. Fetch the appropriate text (`resume_text` or `transcript_text`) from profiles table
2. Call LLM with extraction prompt
3. Parse LLM JSON response
4. For each category (skills, experience, education, projects):
   - Check for existing entries with same source
   - If `forceReparse=true`, delete existing entries from that source
   - Insert new entries with source and confidence scores
5. Update `profiles.profile_data_parsed_at` and add source to `profile_data_sources[]`
6. Calculate and update `profiles.profile_completeness_score`

**Merge Strategy:**
- **No merge on auto-parse**: Each source maintains its own entries
- **Manual entries always preserved**: Only auto-parsed entries are replaced on re-parse
- **User can manually merge/edit**: UI provides tools to consolidate duplicates

### 3. Integration with Existing Upload Flow

**Current Flow:**
1. User uploads PDF → `/api/profile/extract-text`
2. PDF text extracted → stored in `profiles.resume_text` or `profiles.transcript_text`
3. Done

**Enhanced Flow:**
1. User uploads PDF → `/api/profile/extract-text`
2. PDF text extracted → stored in `profiles.resume_text` or `profiles.transcript_text`
3. **NEW**: Automatically call `/api/profile/parse-structured-data` with the userId and source
4. Structured data extracted and stored in respective tables
5. Done

**Implementation:**
- Modify `/api/profile/extract-text` to make an internal API call or direct service call
- Add error handling to ensure upload succeeds even if parsing fails
- Return both upload status and parsing status to the client

### 4. Completeness Score Calculation

**Algorithm:**
```typescript
function calculateCompletenessScore(userId: string): number {
  const weights = {
    hasSkills: 15,          // Has at least 3 skills
    hasExperience: 25,      // Has at least 1 work experience
    hasEducation: 20,       // Has at least 1 education entry
    hasProjects: 15,        // Has at least 1 project
    hasBio: 10,             // Has a bio filled out
    hasResume: 10,          // Has uploaded resume
    hasTranscript: 5,       // Has uploaded transcript (optional)
  };
  
  let score = 0;
  
  // Check each criterion and add weight if met
  if (skillCount >= 3) score += weights.hasSkills;
  if (experienceCount >= 1) score += weights.hasExperience;
  if (educationCount >= 1) score += weights.hasEducation;
  if (projectCount >= 1) score += weights.hasProjects;
  if (bio && bio.length > 50) score += weights.hasBio;
  if (resume_url) score += weights.hasResume;
  if (transcript_url) score += weights.hasTranscript;
  
  return score;
}
```

## Frontend Implementation

### 1. Profile Page Enhancement (`/app/profile/page.tsx`)

**New Sections:**
- Skills section (categorized, with proficiency indicators)
- Experience timeline (chronological, with expand/collapse)
- Education timeline (chronological)
- Projects showcase (grid or list view)
- Data source indicators (badges showing resume/transcript/manual/LinkedIn)

**Actions:**
- "Re-parse Profile Data" button (triggers re-extraction)
- Edit/Delete individual entries
- Add manual entries
- Merge duplicate entries
- View source confidence scores (in tooltip or expand)

### 2. New Components

**`components/profile/SkillsSection.tsx`**
- Display skills grouped by category
- Pill/badge design with proficiency indicators
- Add/edit/delete skills
- Source badges (small icon: 📄 resume, 📜 transcript, 👤 manual, 💼 LinkedIn)

**`components/profile/ExperienceSection.tsx`**
- Timeline or card layout
- Expandable achievements
- Technology tags
- Edit modal for each entry
- Add new experience button

**`components/profile/EducationSection.tsx`**
- Timeline or card layout
- GPA display (if present)
- Honors/awards list
- Relevant coursework (expandable)
- Edit/add functionality

**`components/profile/ProjectsSection.tsx`**
- Grid or list view
- Technology tags
- Link to project URL
- Achievements/features list
- Edit/add functionality

**`components/profile/DataSourceBadge.tsx`**
- Small badge showing data source
- Tooltip with confidence score and parse date
- Color-coded: resume (blue), transcript (green), manual (gray), LinkedIn (purple)

### 3. API Integration Components

**Service Layer: `lib/supabase/services/profile-data.service.ts`**

```typescript
export class ProfileDataService {
  static async getSkills(userId: string);
  static async addSkill(userId: string, skill: SkillInput);
  static async updateSkill(skillId: string, updates: Partial<SkillInput>);
  static async deleteSkill(skillId: string);
  
  static async getExperience(userId: string);
  static async addExperience(userId: string, experience: ExperienceInput);
  static async updateExperience(expId: string, updates: Partial<ExperienceInput>);
  static async deleteExperience(expId: string);
  
  static async getEducation(userId: string);
  static async addEducation(userId: string, education: EducationInput);
  static async updateEducation(eduId: string, updates: Partial<EducationInput>);
  static async deleteEducation(eduId: string);
  
  static async getProjects(userId: string);
  static async addProject(userId: string, project: ProjectInput);
  static async updateProject(projId: string, updates: Partial<ProjectInput>);
  static async deleteProject(projId: string);
  
  static async parseStructuredData(userId: string, source: 'resume' | 'transcript', forceReparse?: boolean);
  static async getCompletenessScore(userId: string): Promise<number>;
}
```

## Technical Considerations

### 1. Performance
- **LLM API calls can be slow**: Show loading states in UI, consider background processing
- **Large resume text**: Chunk if necessary (though most resumes fit in one prompt)
- **Database queries**: Use proper indexing and consider caching user profile data

### 2. Error Handling
- **LLM parsing failures**: Gracefully handle JSON parse errors, retry with fallback prompt
- **Duplicate detection**: Handle same company/institution from different sources
- **Date parsing**: Handle various date formats, store as DATE type when possible
- **Missing data**: Allow null values, don't block on incomplete information

### 3. Data Privacy
- **User consent**: Inform users that AI will parse their documents
- **Data retention**: Allow users to delete parsed data
- **Source transparency**: Always show where data came from

### 4. Future Enhancements
- **LinkedIn integration**: Parse LinkedIn profile data as another source
- **Conflict resolution UI**: When same data exists from multiple sources, let user choose
- **Skill endorsements**: Track which skills appear in job descriptions user is interested in
- **Auto-suggest improvements**: Use parsed data to suggest profile enhancements

## Testing Strategy

### 1. Unit Tests
- LLM prompt construction
- JSON parsing and validation
- Completeness score calculation
- Date parsing utilities

### 2. Integration Tests
- Full parse flow from upload to database
- API endpoint responses
- Database constraints and cascades

### 3. Manual Testing
- Test with diverse resume formats (single column, two column, modern, traditional)
- Test with various date formats
- Test with incomplete information
- Test with non-English content
- Test merge scenarios

## Migration Plan

### Phase 1: Database Setup
1. Run migration to create new tables
2. Add indices
3. Update types in `lib/supabase/types.ts`

### Phase 2: Backend Implementation
1. Create parsing service (`lib/profile/parser.ts`)
2. Create API route (`/api/profile/parse-structured-data`)
3. Update extract-text API to trigger parsing
4. Create service layer methods

### Phase 3: Frontend Implementation
1. Create new components (Skills, Experience, Education, Projects sections)
2. Update profile page to display structured data
3. Add edit/add/delete functionality
4. Add re-parse button

### Phase 4: Testing & Refinement
1. Test with real resumes
2. Refine LLM prompts based on accuracy
3. Adjust UI based on user feedback
4. Performance optimization

## Success Metrics

- **Parsing Accuracy**: >85% of skills/experience/education correctly extracted
- **User Adoption**: >60% of users have structured profile data within 1 week of resume upload
- **Completeness**: Average profile completeness score >70
- **User Satisfaction**: Users can find and edit their parsed data easily
- **Performance**: Parsing completes within 10 seconds for average resume

## Conclusion

This implementation provides a robust foundation for structured profile data that can be leveraged across the entire Applihero platform. The AI-powered parsing reduces manual data entry while maintaining user control and transparency. The modular design allows for future enhancements like LinkedIn integration and intelligent job matching.
