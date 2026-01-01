# Implementation Plan: Discovery, Enhanced Profile, Resume Optimizer Redesign, and Analytics

## Current State Analysis

### Existing Architecture

**Database Schema:**
- `profiles`: Basic user info (name, email, bio, resume_url, transcript_url, resume_text, transcript_text)
- `jobs`: Job applications (title, company, description, status)
- `resume_versions`: Resume versions per job (original_text, optimized_text, current_url, latex_code, feedback)
- `questions`, `chat_messages`, `job_documents`: Supporting job application data

**LinkedIn Integration:**
- OAuth authentication working
- Basic profile fields stored: `linkedin_id`, `linkedin_name`, `linkedin_headline`, `linkedin_avatar_url`, `linkedin_raw`
- No structured data extraction (skills, experience, education)

**Resume Optimizer:**
- Text editor + PDF iframe viewer (separate)
- Manual save button (no autosave)
- Template selection exists but only affects PDF generation
- No in-view PDF editing

**Job Applications:**
- Manual creation via form (`/dashboard/new`)
- No LinkedIn job discovery
- No auto-population from LinkedIn

**Analytics:**
- No analytics page exists
- Dashboard shows basic job list with status

---

## Proposed Changes Overview

### 1. Discovery Page with LinkedIn Integration
**Goal:** Browse and add job applications from LinkedIn, auto-populate fields

### 2. Enhanced Profile Data
**Goal:** Parse and store structured data (skills, experience, education) from resume/LinkedIn

### 3. Redesigned Resume Optimizer
**Goal:** In-view PDF editor with autosave and template switching

### 4. Analytics Dashboard
**Goal:** One-page summary of all job applications with insights

---

## Detailed Implementation Plan

---

## 1. DISCOVERY PAGE WITH LINKEDIN INTEGRATION

### 1.1 Database Changes

**New Table: `linkedin_jobs`**
```sql
CREATE TABLE linkedin_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linkedin_job_id TEXT NOT NULL, -- LinkedIn's job posting ID
  job_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  company_linkedin_url TEXT,
  job_description TEXT,
  location TEXT,
  job_type TEXT, -- full-time, part-time, contract, etc.
  posted_date TIMESTAMPTZ,
  application_url TEXT, -- Direct link to apply
  linkedin_url TEXT, -- LinkedIn job posting URL
  salary_range TEXT,
  raw_data JSONB, -- Store full LinkedIn API response
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, linkedin_job_id)
);

CREATE INDEX idx_linkedin_jobs_user_id ON linkedin_jobs(user_id);
CREATE INDEX idx_linkedin_jobs_imported_at ON linkedin_jobs(imported_at DESC);
```

**Update `jobs` table:**
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS linkedin_job_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_url TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_type TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_range TEXT;
```

### 1.2 LinkedIn API Integration

**New API Routes:**

**`/app/api/linkedin/jobs/search/route.ts`**
- Search LinkedIn jobs using LinkedIn API
- Requires LinkedIn access token (from OAuth)
- Returns job listings with full details
- Handle rate limiting and pagination

**`/app/api/linkedin/jobs/[id]/route.ts`**
- Get specific job details from LinkedIn
- Fetch full job description and metadata

**`/app/api/linkedin/jobs/import/route.ts`**
- Import a LinkedIn job into `linkedin_jobs` table
- Optionally create a `jobs` entry immediately

**LinkedIn API Requirements:**
- Need LinkedIn Marketing Developer Platform access
- Or use LinkedIn Job Search API (if available)
- Alternative: Web scraping (not recommended, against ToS)
- **Recommended:** Use LinkedIn's official Job Search API or Partner Program

### 1.3 Frontend: Discovery Page

**New Page: `/app/discovery/page.tsx`**

**Features:**
- Search bar for job titles, companies, locations
- Filters: job type, location, date posted, salary
- LinkedIn job cards showing:
  - Job title, company, location
  - Job description preview
  - Posted date
  - "Add to Applications" button
- Integration with existing job creation flow
- Auto-populate job form when clicking "Add"

**UI Components:**
- `components/discovery/JobSearchBar.tsx`
- `components/discovery/JobFilters.tsx`
- `components/discovery/LinkedInJobCard.tsx`
- `components/discovery/ImportJobModal.tsx`

**Auto-population Flow:**
1. User clicks "Add to Applications" on LinkedIn job
2. Opens modal with pre-filled form (from LinkedIn data)
3. User can edit before creating
4. Creates entry in both `linkedin_jobs` and `jobs` tables

### 1.4 Service Layer

**New Service: `lib/supabase/services/linkedin-jobs.service.ts`**
- `searchLinkedInJobs(query, filters)`
- `importLinkedInJob(linkedinJobId, userId)`
- `getImportedJobs(userId)`
- `linkJobToLinkedIn(jobId, linkedinJobId)`

---

## 2. ENHANCED PROFILE DATA (SKILLS, EXPERIENCE, EDUCATION)

### 2.1 Database Changes

**New Table: `profile_skills`**
```sql
CREATE TABLE profile_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  category TEXT, -- technical, soft, language, etc.
  proficiency_level TEXT, -- beginner, intermediate, advanced, expert
  source TEXT NOT NULL, -- 'resume', 'linkedin', 'manual'
  source_confidence DECIMAL(3,2), -- 0.00 to 1.00 for parsed data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_name, source)
);

CREATE INDEX idx_profile_skills_user_id ON profile_skills(user_id);
CREATE INDEX idx_profile_skills_category ON profile_skills(category);
```

**New Table: `profile_experience`**
```sql
CREATE TABLE profile_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  start_date DATE,
  end_date DATE, -- NULL if current
  is_current BOOLEAN DEFAULT false,
  location TEXT,
  description TEXT,
  achievements TEXT[], -- Array of achievement bullets
  source TEXT NOT NULL, -- 'resume', 'linkedin', 'manual'
  linkedin_company_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profile_experience_user_id ON profile_experience(user_id);
CREATE INDEX idx_profile_experience_dates ON profile_experience(start_date DESC, end_date DESC);
```

**New Table: `profile_education`**
```sql
CREATE TABLE profile_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  degree TEXT, -- Bachelor's, Master's, PhD, etc.
  field_of_study TEXT,
  start_date DATE,
  end_date DATE, -- NULL if current
  is_current BOOLEAN DEFAULT false,
  gpa DECIMAL(3,2),
  honors TEXT[],
  description TEXT,
  source TEXT NOT NULL, -- 'resume', 'linkedin', 'transcript', 'manual'
  linkedin_school_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profile_education_user_id ON profile_education(user_id);
```

**Update `profiles` table:**
```sql
-- Add fields for structured data sync status
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_data_parsed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_data_source TEXT; -- 'resume', 'linkedin', 'both'
```

### 2.2 Parsing Services

**New Service: `lib/profile/parser.ts`**

**Resume Parser:**
- Parse `resume_text` to extract:
  - Skills (from "Skills" section, bullet points)
  - Experience (company, title, dates, descriptions)
  - Education (institution, degree, field, dates, GPA)
- Use regex patterns + LLM for complex parsing
- Store confidence scores

**LinkedIn Parser:**
- Parse `linkedin_raw` JSON from LinkedIn API
- Extract structured data:
  - Skills (from LinkedIn profile)
  - Experience (from positions array)
  - Education (from education array)
- Map LinkedIn data to our schema

**New API Route: `/app/api/profile/parse-structured-data/route.ts`**
- Trigger parsing of resume/LinkedIn data
- Merge data from multiple sources (prioritize manual > LinkedIn > resume)
- Handle conflicts (e.g., same company, different dates)

### 2.3 Frontend: Enhanced Profile View

**Update: `/app/profile/page.tsx`**

**New Sections:**
- Skills section (editable list with categories)
- Experience timeline (editable cards)
- Education timeline (editable cards)
- "Sync from LinkedIn" button
- "Parse from Resume" button
- Source indicators (showing where each item came from)

**New Components:**
- `components/profile/SkillsCard.tsx`
- `components/profile/ExperienceCard.tsx`
- `components/profile/EducationCard.tsx`
- `components/profile/DataSourceBadge.tsx`

---

## 3. REDESIGNED RESUME OPTIMIZER

### 3.1 Database Changes

**Update `resume_versions` table:**
```sql
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS template_name TEXT DEFAULT 'jake';
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS autosave_enabled BOOLEAN DEFAULT true;
ALTER TABLE resume_versions ADD COLUMN IF NOT EXISTS last_autosave_at TIMESTAMPTZ;
```

**New Table: `resume_autosave_history`** (optional, for undo/redo)
```sql
CREATE TABLE resume_autosave_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_version_id UUID NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  optimized_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resume_autosave_history_version ON resume_autosave_history(resume_version_id, created_at DESC);
```

### 3.2 In-View PDF Editor

**Technology Stack:**
- Use `react-pdf` for PDF rendering (already in dependencies)
- Use `pdf-lib` for PDF manipulation (already in dependencies)
- Implement text overlay editing or use canvas-based editing

**New Components:**
- `components/resume-optimizer/PDFEditor.tsx` - Main editor component
- `components/resume-optimizer/PDFViewer.tsx` - PDF display with annotations
- `components/resume-optimizer/TemplateSelector.tsx` - Template switcher
- `components/resume-optimizer/AutosaveIndicator.tsx` - Show autosave status

**Approach Options:**

**Option A: Text-based editing with live PDF preview**
- Keep text editor
- Show PDF preview that updates on change
- Real-time LaTeX compilation (debounced)
- Autosave text changes

**Option B: Canvas-based PDF editing**
- Render PDF as canvas
- Allow direct text editing on PDF
- More complex but better UX
- Requires more development

**Recommended: Option A** (easier, faster to implement)

### 3.3 Autosave Implementation

**Frontend:**
- Debounce text changes (500ms delay)
- Show "Saving..." indicator
- Save to `resume_versions.optimized_text` via API
- Track last autosave timestamp
- Handle network errors gracefully (queue saves)

**API Route: `/app/api/resume-optimizer/[id]/autosave/route.ts`**
- Lightweight endpoint for autosave (only updates text, no PDF generation)
- Returns success/failure
- Fast response time (< 200ms target)

**Update Existing Route: `/app/api/resume-optimizer/[id]/route.ts`**
- Add PATCH method for autosave updates
- Separate from full save (POST) which generates PDF

### 3.4 Template Switching

**Frontend:**
- Template selector dropdown (already exists, enhance it)
- On template change:
  1. Show confirmation if unsaved changes
  2. Update `resume_versions.template_name`
  3. Regenerate PDF preview with new template
  4. Keep same text content, only change formatting

**API Route: `/app/api/resume-optimizer/[id]/preview/route.ts`**
- Generate PDF preview without saving
- Use selected template
- Return signed URL for preview
- Cache previews (optional)

### 3.5 Redesigned UI Layout

**New Layout: `/app/resume-optimizer/page.tsx`**

**Split View Design:**
```
┌─────────────────────────────────────────────────┐
│  Header: Job Selector | Template | Actions      │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│  PDF Preview     │  Text Editor                 │
│  (Live Update)   │  (Autosave enabled)          │
│                  │                              │
│  [Template: Jake]│  [Auto-saved 2s ago]         │
│                  │                              │
└──────────────────┴──────────────────────────────┘
```

**Features:**
- Side-by-side PDF and text editor
- PDF updates in real-time (debounced, ~1s delay)
- Autosave indicator in editor header
- Template selector in header
- "Save Version" button (full save with PDF generation)
- "Download PDF" button

**Components:**
- `components/resume-optimizer/ResumeEditorLayout.tsx` - Main layout
- `components/resume-optimizer/LivePDFPreview.tsx` - PDF preview with auto-refresh
- `components/resume-optimizer/TextEditor.tsx` - Enhanced text editor with autosave
- `components/resume-optimizer/AutosaveStatus.tsx` - Status indicator

---

## 4. ANALYTICS DASHBOARD

### 4.1 Database Changes

**New Table: `application_events`** (optional, for detailed tracking)
```sql
CREATE TABLE application_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'created', 'status_changed', 'question_answered', 'resume_optimized', 'submitted', etc.
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_application_events_job_id ON application_events(job_id);
CREATE INDEX idx_application_events_type ON application_events(event_type);
CREATE INDEX idx_application_events_created_at ON application_events(created_at DESC);
```

**Note:** Can use existing `jobs.last_touched_at` and status changes for basic analytics without this table.

### 4.2 Analytics Service

**New Service: `lib/supabase/services/analytics.service.ts`**

**Functions:**
- `getApplicationStats(userId)` - Overall statistics
- `getStatusBreakdown(userId)` - Count by status
- `getApplicationTimeline(userId)` - Timeline of applications
- `getCompanyBreakdown(userId)` - Applications by company
- `getActivityHeatmap(userId)` - Activity over time
- `getCompletionRates(userId)` - % of questions answered, resumes optimized, etc.

### 4.3 Frontend: Analytics Page

**New Page: `/app/analytics/page.tsx`**

**Sections:**

**1. Overview Cards:**
- Total applications
- Active (In Progress)
- Submitted
- Draft
- Average time to submit
- Success rate (if tracking responses)

**2. Status Distribution:**
- Pie/Donut chart showing status breakdown
- Visual representation of application pipeline

**3. Timeline View:**
- Line/Bar chart showing applications over time
- Grouped by month/week
- Show status changes

**4. Company Breakdown:**
- List of companies applied to
- Count per company
- Status per company

**5. Activity Metrics:**
- Questions answered vs. total
- Resumes optimized vs. total jobs
- Cover letters generated
- Chat messages sent
- Activity heatmap (calendar view)

**6. Performance Insights:**
- Average days from creation to submission
- Most active day of week
- Time spent per application
- Completion rate trends

**UI Components:**
- `components/analytics/StatsCard.tsx`
- `components/analytics/StatusChart.tsx`
- `components/analytics/TimelineChart.tsx`
- `components/analytics/CompanyBreakdown.tsx`
- `components/analytics/ActivityHeatmap.tsx`
- `components/analytics/InsightsPanel.tsx`

**Chart Library:**
- Use `recharts` (add to dependencies) or `chart.js` with `react-chartjs-2`
- Or use simple SVG charts for lightweight solution

### 4.4 API Routes

**New Route: `/app/api/analytics/stats/route.ts`**
- Get all analytics data for current user
- Aggregate from jobs, questions, resume_versions, chat_messages
- Return structured JSON for charts

---

## IMPLEMENTATION ORDER & PRIORITIES

### Phase 1: Foundation (Week 1-2)
1. **Database Schema Updates**
   - Add all new tables and columns
   - Run migrations
   - Update TypeScript types

2. **Enhanced Profile Data**
   - Create parsing services
   - Add profile data tables
   - Update profile page UI
   - **Priority: Medium** (enables better data for other features)

### Phase 2: Core Features (Week 3-4)
3. **Resume Optimizer Redesign**
   - Implement autosave
   - Redesign UI layout
   - Add template switching
   - **Priority: High** (major UX improvement)

4. **Analytics Dashboard**
   - Create analytics service
   - Build analytics page
   - Add charts and visualizations
   - **Priority: High** (user-requested feature)

### Phase 3: Advanced Features (Week 5-6)
5. **Discovery Page**
   - LinkedIn API integration
   - Build discovery UI
   - Implement job import
   - **Priority: Medium** (depends on LinkedIn API access)

---

## TECHNICAL CONSIDERATIONS

### LinkedIn API Access
**Challenge:** LinkedIn's Job Search API may require:
- LinkedIn Marketing Developer Platform membership
- Partner Program access
- Or use unofficial scraping (not recommended)

**Alternatives:**
1. **LinkedIn Job Alerts Integration:** User connects LinkedIn, we fetch their saved jobs
2. **Manual Import:** User pastes LinkedIn job URL, we scrape/parse it
3. **Browser Extension:** Chrome extension to import jobs from LinkedIn
4. **Wait for Official API:** Use placeholder UI until API access is granted

**Recommended Approach:** Start with manual import (paste URL), then add API when available.

### PDF Editing Technology
**Challenge:** True in-view PDF editing is complex

**Solution:** Use hybrid approach:
- Text editor for content (source of truth)
- Live PDF preview (regenerated on change)
- PDF.js for rendering
- LaTeX compilation for generation

**Future Enhancement:** Canvas-based editing if needed.

### Performance
- **Autosave:** Debounce aggressively (500ms-1s)
- **PDF Preview:** Throttle regeneration (1-2s delay)
- **Analytics:** Cache aggregated data, refresh on demand
- **LinkedIn API:** Rate limit requests, cache responses

### Data Migration
- **Existing Users:** Run parsing job to extract structured data from existing resumes
- **Backfill:** Create migration script to parse all existing `resume_text` fields
- **LinkedIn Data:** Parse existing `linkedin_raw` JSON for users who already connected

---

## TESTING STRATEGY

### Unit Tests
- Parsing services (resume, LinkedIn)
- Analytics calculations
- Autosave logic

### Integration Tests
- LinkedIn API integration
- PDF generation with different templates
- Autosave API endpoints

### E2E Tests
- Complete job application flow
- Resume optimizer autosave
- Analytics page data accuracy

---

## DEPENDENCIES TO ADD

```json
{
  "dependencies": {
    "recharts": "^2.10.0",  // For analytics charts
    "date-fns": "^2.30.0",  // Date utilities for analytics
    "debounce": "^1.2.1"    // For autosave debouncing
  }
}
```

---

## UI/UX ENHANCEMENTS

### Discovery Page
- Modern job card design
- Quick preview on hover
- One-click import
- Search with autocomplete

### Resume Optimizer
- Smooth transitions between templates
- Visual autosave feedback
- Undo/redo (future enhancement)
- Keyboard shortcuts

### Analytics
- Interactive charts
- Date range filters
- Export to CSV/PDF
- Shareable insights

---

## SECURITY CONSIDERATIONS

1. **LinkedIn API Tokens:** Store securely, refresh automatically
2. **Rate Limiting:** Prevent abuse of autosave and PDF generation
3. **Data Privacy:** Ensure LinkedIn data is only accessible to user
4. **RLS Policies:** Add RLS for all new tables

---

## FUTURE ENHANCEMENTS

1. **Job Recommendations:** Use parsed skills/experience to suggest jobs
2. **Resume A/B Testing:** Track which resume versions get more responses
3. **Interview Prep:** Use analytics to identify weak areas
4. **Integration with Other Platforms:** Indeed, Glassdoor, etc.
5. **AI-Powered Job Matching:** Match user profile to job requirements

---

## ESTIMATED TIMELINE

- **Phase 1 (Foundation):** 2 weeks
- **Phase 2 (Core Features):** 2 weeks  
- **Phase 3 (Advanced Features):** 2 weeks
- **Total:** ~6 weeks for full implementation

**MVP Version (Essential Features Only):** 3-4 weeks
- Resume Optimizer Redesign (autosave + template switching)
- Analytics Dashboard (basic stats)
- Enhanced Profile (basic parsing)

---

## NOTES

- LinkedIn API integration is the biggest unknown (depends on API access)
- Start with manual import as fallback
- Focus on Resume Optimizer and Analytics first (clear user value)
- Enhanced Profile data enables better features later
- All features should work independently (graceful degradation)