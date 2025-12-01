-- Migration: Add referrals table for job application referrals
-- Run this in your Supabase SQL editor

-- Referrals Table
-- Stores referral information for job applications
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  relation TEXT, -- How you know them (e.g., "Former colleague", "College friend", "Met at conference")
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_referrals_job_id ON referrals(job_id);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Referrals policies
CREATE POLICY "Users can view referrals for their jobs"
  ON referrals FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = referrals.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert referrals for their jobs"
  ON referrals FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = referrals.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can update referrals for their jobs"
  ON referrals FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = referrals.job_id AND jobs.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete referrals for their jobs"
  ON referrals FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM jobs WHERE jobs.id = referrals.job_id AND jobs.user_id = auth.uid()
  ));

-- Trigger for updated_at
CREATE TRIGGER update_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE referrals IS 'Stores referral information for job applications';
COMMENT ON COLUMN referrals.person_name IS 'Name of the person providing the referral';
COMMENT ON COLUMN referrals.company IS 'Company where the referrer works';
COMMENT ON COLUMN referrals.title IS 'Job title of the referrer';
COMMENT ON COLUMN referrals.linkedin_url IS 'LinkedIn profile URL of the referrer';
COMMENT ON COLUMN referrals.relation IS 'How the user knows the referrer (e.g., "Former colleague", "College friend")';

