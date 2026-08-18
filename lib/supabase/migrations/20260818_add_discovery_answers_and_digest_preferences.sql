-- Reusable, user-confirmed eligibility facts and configurable email digests.

CREATE TABLE IF NOT EXISTS user_discovery_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('work_authorization', 'availability', 'location')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  normalized_value TEXT NOT NULL,
  reuse_approved BOOLEAN NOT NULL DEFAULT false,
  source_job_id UUID REFERENCES discovery_jobs(id) ON DELETE SET NULL,
  provided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, question_key)
);

CREATE INDEX IF NOT EXISTS idx_user_discovery_answers_context
  ON user_discovery_answers(user_id, reuse_approved, question_key);

ALTER TABLE user_discovery_answers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own discovery answers" ON user_discovery_answers;
CREATE POLICY "Users can view own discovery answers"
  ON user_discovery_answers FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own discovery answers" ON user_discovery_answers;
CREATE POLICY "Users can insert own discovery answers"
  ON user_discovery_answers FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own discovery answers" ON user_discovery_answers;
CREATE POLICY "Users can update own discovery answers"
  ON user_discovery_answers FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own discovery answers" ON user_discovery_answers;
CREATE POLICY "Users can delete own discovery answers"
  ON user_discovery_answers FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_discovery_answers_updated_at ON user_discovery_answers;
CREATE TRIGGER update_user_discovery_answers_updated_at
  BEFORE UPDATE ON user_discovery_answers
  FOR EACH ROW EXECUTE FUNCTION update_discovery_updated_at();

CREATE TABLE IF NOT EXISTS user_discovery_preferences (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  digest_frequency_minutes INTEGER NOT NULL DEFAULT 1440
    CHECK (digest_frequency_minutes IN (15, 60, 360, 1440, 10080)),
  minimum_fit_score INTEGER NOT NULL DEFAULT 45 CHECK (minimum_fit_score BETWEEN 0 AND 100),
  last_digest_at TIMESTAMPTZ,
  next_digest_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_discovery_preferences_due
  ON user_discovery_preferences(email_enabled, next_digest_at)
  WHERE email_enabled = true;

ALTER TABLE user_discovery_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own discovery preferences" ON user_discovery_preferences;
CREATE POLICY "Users can view own discovery preferences"
  ON user_discovery_preferences FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own discovery preferences" ON user_discovery_preferences;
CREATE POLICY "Users can insert own discovery preferences"
  ON user_discovery_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own discovery preferences" ON user_discovery_preferences;
CREATE POLICY "Users can update own discovery preferences"
  ON user_discovery_preferences FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_discovery_preferences_updated_at ON user_discovery_preferences;
CREATE TRIGGER update_user_discovery_preferences_updated_at
  BEFORE UPDATE ON user_discovery_preferences
  FOR EACH ROW EXECUTE FUNCTION update_discovery_updated_at();

COMMENT ON TABLE user_discovery_answers IS
  'Dated eligibility answers supplied by the user. reuse_approved controls use for future jobs.';
COMMENT ON TABLE user_discovery_preferences IS
  'Per-user discovery digest cadence and minimum match threshold.';

NOTIFY pgrst, 'reload schema';
