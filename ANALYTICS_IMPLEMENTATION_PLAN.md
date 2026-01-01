# Analytics Dashboard Implementation Plan

## Overview
Implement a comprehensive analytics dashboard that provides insights into job application activity, completion rates, and performance metrics.

## Architecture

### Data Sources
- `jobs` table - Job applications with status, dates, company
- `questions` table - Application questions with status
- `resume_versions` table - Resume optimization activity
- `chat_messages` table - AI coaching activity
- `job_documents` table - Cover letters and documents

### Implementation Steps

## Step 1: Analytics Service (`lib/supabase/services/analytics.service.ts`)

### Functions to Implement:

1. **`getApplicationStats(userId: string)`**
   - Total applications count
   - Count by status (Draft, In Progress, Submitted, Archived)
   - Average time to submit (for submitted jobs)
   - Return: `{ total, draft, inProgress, submitted, archived, avgDaysToSubmit }`

2. **`getStatusBreakdown(userId: string)`**
   - Count of jobs by each status
   - Return: `Array<{ status: string, count: number, percentage: number }>`

3. **`getApplicationTimeline(userId: string)`**
   - Group applications by month/week
   - Show creation dates and status changes
   - Return: `Array<{ period: string, created: number, submitted: number, ... }>`

4. **`getCompanyBreakdown(userId: string)`**
   - List all companies with application counts
   - Status per company
   - Return: `Array<{ company: string, total: number, statuses: {...} }>`

5. **`getActivityHeatmap(userId: string)`**
   - Activity by day (last 30 days or configurable)
   - Count of actions per day
   - Return: `Array<{ date: string, count: number }>`

6. **`getCompletionRates(userId: string)`**
   - Questions answered vs total
   - Resumes optimized vs total jobs
   - Cover letters generated
   - Chat messages sent
   - Return: `{ questions, resumes, coverLetters, chatMessages }`

## Step 2: API Route (`/app/api/analytics/stats/route.ts`)

### Implementation:
- GET endpoint that aggregates all analytics data
- Uses AnalyticsService methods
- Returns structured JSON for frontend
- Handles authentication (current user only)

### Response Structure:
```typescript
{
  overview: ApplicationStats,
  statusBreakdown: StatusBreakdown[],
  timeline: TimelineData[],
  companyBreakdown: CompanyBreakdown[],
  activityHeatmap: ActivityHeatmap[],
  completionRates: CompletionRates
}
```

## Step 3: Frontend Components

### 3.1 Main Analytics Page (`/app/analytics/page.tsx`)
- Client component
- Fetches data from API route
- Layout similar to dashboard page
- Uses Header component
- Loading and error states

### 3.2 Component Structure:

**`components/analytics/StatsCard.tsx`**
- Reusable card for displaying a single stat
- Props: `title`, `value`, `subtitle?`, `icon?`, `trend?`
- Styling consistent with dashboard cards

**`components/analytics/StatusChart.tsx`**
- Pie/Donut chart using recharts
- Shows status distribution
- Color-coded by status
- Interactive (hover for details)

**`components/analytics/TimelineChart.tsx`**
- Line/Bar chart showing applications over time
- Grouped by month
- Multiple series (created, submitted, etc.)
- Date range selector (optional)

**`components/analytics/CompanyBreakdown.tsx`**
- Table or list view
- Shows company name, total applications, status breakdown
- Sortable/filterable
- Click to view jobs for that company

**`components/analytics/ActivityHeatmap.tsx`**
- Calendar-style heatmap
- Shows activity by day
- Color intensity based on activity level
- Tooltip on hover

**`components/analytics/InsightsPanel.tsx`**
- Performance insights section
- Average days to submit
- Most active day of week
- Completion rate trends
- Tips/recommendations

## Step 4: Dependencies

### Add to package.json:
```json
{
  "dependencies": {
    "recharts": "^2.10.0",
    "date-fns": "^2.30.0"
  }
}
```

## Step 5: Styling & UX

### Design Principles:
- Match existing dashboard style (gradient background, card-based layout)
- Use consistent color scheme (indigo/purple gradients)
- Responsive design (mobile-friendly)
- Loading skeletons
- Empty states with helpful messages

### Color Scheme:
- Draft: Gray
- In Progress: Blue
- Submitted: Green
- Archived: Gray (lighter)

## Step 6: Navigation

### Add to Header:
- Link to analytics page in navigation
- Or add button on dashboard page

## Implementation Order:

1. ✅ Install dependencies (recharts, date-fns)
2. ✅ Create AnalyticsService with all functions
3. ✅ Create API route
4. ✅ Create main analytics page
5. ✅ Create StatsCard component
6. ✅ Create StatusChart component
7. ✅ Create TimelineChart component
8. ✅ Create CompanyBreakdown component
9. ✅ Create ActivityHeatmap component
10. ✅ Create InsightsPanel component
11. ✅ Add navigation link
12. ✅ Test with real data
13. ✅ Handle edge cases (no data, errors)

## Edge Cases to Handle:

- No jobs yet (empty state)
- No questions/resumes (0% completion)
- Single job (avoid division by zero)
- Date calculations (handle null dates)
- Large datasets (pagination/limiting)

## Testing Considerations:

- Test with 0 jobs
- Test with 1 job
- Test with many jobs (performance)
- Test with various statuses
- Test date calculations
- Test completion rate calculations

