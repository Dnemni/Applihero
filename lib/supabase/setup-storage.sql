-- Run this in Supabase SQL Editor to create storage buckets

-- Create the resumes bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- Create the transcripts bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('transcripts', 'transcripts', true)
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for resumes bucket
CREATE POLICY "Users can upload their own resume"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own resume"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own resume"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view resumes"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resumes');

-- Set up RLS policies for transcripts bucket
CREATE POLICY "Users can upload their own transcript"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'transcripts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own transcript"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'transcripts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own transcript"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'transcripts' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view transcripts"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'transcripts');
