-- Keep the discovery feed fast by storing only each user's evaluated shortlist.
-- The shared job row remains the canonical detail record, while fit information
-- is calculated during a background company scan instead of on every page load.
CREATE TABLE IF NOT EXISTS user_job_recommendations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  discovery_job_id UUID NOT NULL REFERENCES discovery_jobs(id) ON DELETE CASCADE,
  fit_score INTEGER CHECK (fit_score BETWEEN 0 AND 100),
  fit_band TEXT NOT NULL CHECK (fit_band IN ('strong', 'potential', 'needs_information', 'likely_conflict')),
  eligibility_status TEXT NOT NULL CHECK (eligibility_status IN ('aligned', 'unknown', 'conflict')),
  quick_fit JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  recommended_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, discovery_job_id)
);

CREATE INDEX IF NOT EXISTS idx_user_job_recommendations_feed
  ON user_job_recommendations(user_id, active, fit_score DESC, recommended_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_job_recommendations_source
  ON user_job_recommendations(user_id, source_id, active);

ALTER TABLE user_job_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own job recommendations" ON user_job_recommendations;
CREATE POLICY "Users can view own job recommendations"
  ON user_job_recommendations FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own job recommendations" ON user_job_recommendations;
CREATE POLICY "Users can update own job recommendations"
  ON user_job_recommendations FOR UPDATE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_user_job_recommendations_updated_at ON user_job_recommendations;
CREATE TRIGGER update_user_job_recommendations_updated_at
  BEFORE UPDATE ON user_job_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_discovery_updated_at();

COMMENT ON TABLE user_job_recommendations IS
  'Small, precomputed per-user discovery shortlist. Eligibility and fit are evaluated during source sync.';

NOTIFY pgrst, 'reload schema';
