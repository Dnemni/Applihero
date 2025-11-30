# Supabase Setup Checklist

## ✅ Completed

- [x] Database schema designed and created (`lib/supabase/schema.sql`)
- [x] TypeScript types defined (`lib/supabase/types.ts`)
- [x] Supabase client configured (`lib/supabase/client.ts`)
- [x] ProfileService created with all methods
- [x] JobService created with all methods
- [x] QuestionService created with all methods
- [x] ChatService created with all methods
- [x] Service index file created
- [x] Main index file created
- [x] Setup documentation written
- [x] Database schema diagram created
- [x] Quick reference guide created
- [x] Environment template created
- [x] Supabase package installed

## 🔲 Next Steps (Do These)

### 1. Supabase Project Setup
- [ ] Go to [supabase.com](https://supabase.com) and create an account
- [ ] Click "New Project"
- [ ] Choose organization and set project name
- [ ] Set database password (save it somewhere safe!)
- [ ] Wait for project to finish setting up (~2 minutes)

### 2. Get Your Credentials
- [ ] In Supabase dashboard, go to Settings > API
- [ ] Copy your Project URL
- [ ] Copy your `anon` public key
- [ ] Create `.env.local` from `.env.example`
- [ ] Paste credentials into `.env.local`

### 3. Run Database Schema
- [ ] In Supabase dashboard, go to SQL Editor
- [ ] Click "New Query"
- [ ] Open `lib/supabase/schema.sql` in your code editor
- [ ] Copy the entire contents
- [ ] Paste into Supabase SQL Editor
- [ ] Click "Run" (bottom right)
- [ ] Verify no errors appear

### 4. Add Profile Auto-Creation
- [ ] In Supabase SQL Editor, create a new query
- [ ] Add this code:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, email_notifications, marketing_emails, active)
  VALUES (NEW.id, NEW.email, true, false, true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```
- [ ] Run it

### 5. Set Up Storage Buckets and Policies
- [ ] In Supabase dashboard, go to SQL Editor
- [ ] Click "New Query"
- [ ] Open `lib/supabase/setup-storage.sql` in your code editor
- [ ] Copy the entire contents
- [ ] Paste into Supabase SQL Editor
- [ ] Click "Run"
- [ ] Verify no errors appear
- [ ] Go to Storage tab and confirm you see `resumes` and `transcripts` buckets

**Note:** The script creates public buckets for resumes and transcripts. If you need to add the job-documents bucket later, create it manually in the Storage tab.

### 7. Configure Authentication
- [ ] In Supabase dashboard, go to Authentication > Providers
- [ ] Verify Email provider is enabled
- [ ] Optional: Configure email templates in Authentication > Email Templates
- [ ] Optional: Enable additional providers (Google, GitHub, etc.)

### 8. Test Your Setup
- [ ] Try signing up a test user through your app
- [ ] Check if profile was auto-created in Database > profiles table
- [ ] Try creating a test job
- [ ] Try uploading a resume

## 🔧 Configuration Files

Make sure these files exist:

- [ ] `.env.local` (with your Supabase credentials)
- [ ] `.gitignore` includes `.env.local`

## 📝 Environment Variables

Your `.env.local` should look like:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 🎯 Verify Everything Works

Run these checks:

### 1. Tables Created
- [ ] Go to Database > Tables in Supabase
- [ ] Verify you see: profiles, jobs, questions, chat_messages, job_documents

### 2. RLS Enabled
- [ ] Click on each table
- [ ] Check "RLS enabled" shows green checkmark

### 3. Storage Buckets Created
- [ ] Go to Storage
- [ ] Verify you see: resumes, transcripts, job-documents

### 4. Environment Variables Set
- [ ] Run `npm run dev`
- [ ] No Supabase connection errors in console

### 5. Authentication Works
- [ ] Try to sign up a new user
- [ ] Check profile was created automatically
- [ ] Try to sign in
- [ ] Try to sign out

## 🚀 Integration Checklist

Now integrate with your existing pages:

### Dashboard Page
- [ ] Import `JobService`
- [ ] Replace `mockJobs` with `JobService.getAllJobs()`
- [ ] Add loading state
- [ ] Add error handling

### New Job Page
- [ ] Import `JobService`
- [ ] Handle form submission with `JobService.createJob()`
- [ ] Redirect to job page on success
- [ ] Add error handling

### Job Workspace Page
- [ ] Import `JobService` and `QuestionService`
- [ ] Load job data with `JobService.getJobById()`
- [ ] Load questions with `QuestionService.getQuestionsForJob()`
- [ ] Update chat and answer editor components to use real data

### Chat Component
- [ ] Import `ChatService`
- [ ] Initialize chat on mount
- [ ] Load chat history
- [ ] Send messages to database
- [ ] Add loading/error states

### Answer Editor Component
- [ ] Import `QuestionService`
- [ ] Load questions from database
- [ ] Save answers to database
- [ ] Handle add/edit/delete operations
- [ ] Add loading/error states

### Profile Page
- [ ] Import `ProfileService`
- [ ] Load profile data
- [ ] Handle profile updates
- [ ] Handle file uploads
- [ ] Handle preference updates

### Login Page
- [ ] Import `supabase`
- [ ] Handle login with `supabase.auth.signInWithPassword()`
- [ ] Redirect on success
- [ ] Show errors

### Signup Page
- [ ] Import `supabase`
- [ ] Handle signup with `supabase.auth.signUp()`
- [ ] Show email confirmation message
- [ ] Handle errors

## 📚 Documentation

Make sure you've read:

- [ ] `SUPABASE_SETUP.md` - Full setup guide
- [ ] `DATABASE_SCHEMA.md` - Schema documentation
- [ ] `QUICK_REFERENCE.md` - Code examples
- [ ] `lib/supabase/README.md` - Detailed usage guide

## 🎉 You're Done!

Once all checkboxes are checked, your Supabase backend is fully set up and ready to use!

## 🆘 Troubleshooting

If something doesn't work:

1. Check `.env.local` has correct credentials
2. Verify all tables exist in Supabase dashboard
3. Check RLS policies are enabled
4. Check browser console for errors
5. Check Supabase dashboard Logs for errors
6. Read the troubleshooting section in `lib/supabase/README.md`

## 📞 Getting Help

If you're stuck:
- Check Supabase documentation: https://supabase.com/docs
- Check Supabase Discord: https://discord.supabase.com
- Review the error messages carefully
- Check the Logs tab in Supabase dashboard
