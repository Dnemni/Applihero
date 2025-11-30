# Storage Bucket Setup - Quick Fix

You're getting a "Bucket not found" error because the storage buckets haven't been created yet.

## Quick Fix (2 minutes)

1. **Go to your Supabase dashboard**: https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Open SQL Editor**:
   - Click "SQL Editor" in the left sidebar

3. **Run the storage setup script**:
   - Click "New Query"
   - Open `lib/supabase/setup-storage.sql` from your project
   - Copy ALL the contents
   - Paste into the SQL Editor
   - Click "Run" (bottom right)

4. **Verify it worked**:
   - Go to "Storage" in the left sidebar
   - You should see two buckets: `resumes` and `transcripts`

## What This Script Does

The script:
- ✅ Creates the `resumes` bucket (public)
- ✅ Creates the `transcripts` bucket (public)
- ✅ Sets up Row Level Security (RLS) policies so:
  - Users can only upload/update/delete their own files
  - Anyone can view files (good for sharing resumes)

## After Setup

Once you've run the script:
1. Go back to your profile page
2. Try uploading a resume again
3. The "View current resume" link should now work!

## Troubleshooting

**Error: "relation storage.buckets does not exist"**
- Your Supabase project might be too old
- Create buckets manually:
  1. Go to Storage tab
  2. Click "New bucket"
  3. Name: `resumes`, check "Public bucket", click "Create"
  4. Repeat for `transcripts`

**Error: "Policy already exists"**
- That's OK! It means the policy was already created
- Just continue to the next step

## Need Help?

Check the full setup guide in `SETUP_CHECKLIST.md` step 5.
