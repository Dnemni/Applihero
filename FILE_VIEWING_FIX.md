# File Viewing Fix - Implementation Summary

## Problem
The "View current resume" link was showing a 404 error because:
1. The bucket didn't exist (fixed by running `setup-storage.sql`)
2. We were storing full URLs that might not work correctly
3. For private files, we need signed URLs that are generated on-demand

## Solution Implemented

### 1. **Changed Storage Strategy**
Instead of storing full URLs in the database, we now:
- Store only the **file path** (e.g., `user-id/resume.pdf`)
- Generate **signed URLs on-demand** when the user clicks "View"
- Signed URLs expire after 1 hour (secure and temporary access)

### 2. **Updated ProfileService** (`lib/supabase/services/profile.service.ts`)

#### Modified Upload Methods:
```typescript
// Before: stored full URL
await this.updateProfile({ resume_url: data.publicUrl });

// After: stores just the path
await this.updateProfile({ resume_url: fileName });
```

#### Added New Methods:
- `getResumeUrl(filePath)` - Generates signed URL for resume
- `getTranscriptUrl(filePath)` - Generates signed URL for transcript

These methods:
- Check if the path is already a URL (backward compatibility)
- Generate a signed URL that expires in 1 hour
- Fallback to public URL if signing fails

### 3. **Updated Profile Page** (`app/profile/page.tsx`)

#### Changed Links to Buttons:
```typescript
// Before: direct link
<a href={profile.resume_url}>View current resume</a>

// After: button with onClick
<button onClick={handleViewResume}>View current resume</button>
```

#### Added Handler Functions:
```typescript
async function handleViewResume() {
  const url = await ProfileService.getResumeUrl(profile.resume_url);
  if (url) {
    window.open(url, '_blank');
  }
}
```

## How It Works Now

1. **Upload**:
   - User uploads resume → File saved to `resumes/{user-id}/resume.pdf`
   - Database stores path: `{user-id}/resume.pdf`

2. **View**:
   - User clicks "View current resume"
   - ProfileService generates a signed URL valid for 1 hour
   - Opens in new tab with secure, temporary access

## Benefits

✅ **Secure**: URLs expire after 1 hour
✅ **Flexible**: Works with both public and private buckets
✅ **Reliable**: Generates fresh URLs each time
✅ **Backward Compatible**: Still works with old full URLs in database
✅ **Better UX**: User doesn't see long ugly URLs

## Storage Bucket Setup

Make sure you've run `lib/supabase/setup-storage.sql` to create:
- `resumes` bucket (public)
- `transcripts` bucket (public)
- All necessary RLS policies

## Testing

1. Upload a resume on the profile page
2. Click "View current resume"
3. Should open in a new tab successfully
4. Check the URL - it should have a `token` parameter (the signed URL)

## Database Migration Note

If you have existing profiles with full URLs stored:
- The system will still work! 
- `getResumeUrl()` checks if it's already a URL and returns it
- New uploads will use the path-based approach
- No manual migration needed

## Next Steps

Consider:
- Adding a download button (in addition to view)
- Showing file size and upload date
- Adding file preview (if needed)
- Adding progress indicator for large files
