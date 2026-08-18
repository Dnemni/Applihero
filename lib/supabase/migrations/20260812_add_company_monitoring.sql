-- Shared source monitoring and per-user alerting.
-- Sources are scanned once, then fanned out to every subscribed user.

ALTER TABLE job_sources
  ADD COLUMN IF NOT EXISTS career_url TEXT,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_interval_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (sync_interval_minutes BETWEEN 15 AND 1440),
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_job_sources_due
  ON job_sources(enabled, next_sync_at)
  WHERE enabled = true;

CREATE TABLE IF NOT EXISTS user_job_source_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES job_sources(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify_email BOOLEAN NOT NULL DEFAULT true,
  min_fit_score INTEGER NOT NULL DEFAULT 45 CHECK (min_fit_score BETWEEN 0 AND 100),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, source_id)
);

CREATE TABLE IF NOT EXISTS discovery_alert_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  discovery_job_id UUID NOT NULL REFERENCES discovery_jobs(id) ON DELETE CASCADE,
  fit_score INTEGER,
  fit_band TEXT NOT NULL,
  notification_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, discovery_job_id)
);

CREATE TABLE IF NOT EXISTS discovery_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'job_matches' CHECK (kind IN ('job_matches', 'source_error')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  job_ids UUID[] NOT NULL DEFAULT '{}',
  read_at TIMESTAMPTZ,
  emailed_at TIMESTAMPTZ,
  email_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE discovery_alert_candidates
  DROP CONSTRAINT IF EXISTS discovery_alert_candidates_notification_id_fkey;
ALTER TABLE discovery_alert_candidates
  ADD CONSTRAINT discovery_alert_candidates_notification_id_fkey
  FOREIGN KEY (notification_id) REFERENCES discovery_notifications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_source_subscriptions_source
  ON user_job_source_subscriptions(source_id, enabled);
CREATE INDEX IF NOT EXISTS idx_alert_candidates_pending
  ON discovery_alert_candidates(user_id, created_at)
  WHERE notification_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_discovery_notifications_user
  ON discovery_notifications(user_id, created_at DESC);

ALTER TABLE user_job_source_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_alert_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own source subscriptions"
  ON user_job_source_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own source subscriptions"
  ON user_job_source_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own source subscriptions"
  ON user_job_source_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own source subscriptions"
  ON user_job_source_subscriptions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own alert candidates"
  ON discovery_alert_candidates FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own discovery notifications"
  ON discovery_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own discovery notifications"
  ON discovery_notifications FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_source_subscriptions_updated_at
  BEFORE UPDATE ON user_job_source_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_discovery_updated_at();

COMMENT ON TABLE user_job_source_subscriptions IS
  'A user follows a shared source; subscribed_at is the alert baseline.';
COMMENT ON TABLE discovery_alert_candidates IS
  'New matching jobs waiting to be grouped into an in-app/email notification.';

INSERT INTO job_sources (provider, external_key, company_name, career_url, config, enabled, featured)
VALUES
  ('greenhouse', 'newsbreak', 'NewsBreak', 'https://job-boards.greenhouse.io/newsbreak', '{"boardToken":"newsbreak"}', true, true),
  ('greenhouse', 'offerup', 'OfferUp', 'https://job-boards.greenhouse.io/offerup', '{"boardToken":"offerup"}', true, true),
  ('greenhouse', 'gemini', 'Gemini', 'https://job-boards.greenhouse.io/gemini', '{"boardToken":"gemini"}', true, true),
  ('greenhouse', 'ada18', 'Ada', 'https://job-boards.greenhouse.io/ada18', '{"boardToken":"ada18"}', true, true),
  ('greenhouse', 'instead', 'Instead', 'https://job-boards.greenhouse.io/instead', '{"boardToken":"instead"}', true, true),
  ('lever', 'palantir', 'Palantir', 'https://jobs.lever.co/palantir', '{"site":"palantir"}', true, true),
  ('ashby', 'notion', 'Notion', 'https://jobs.ashbyhq.com/notion', '{"board":"notion"}', true, true),
  ('ibm', 'careers2', 'IBM', 'https://www.ibm.com/careers/search', '{"appId":"careers","scope":"careers2"}', true, true)
ON CONFLICT (provider, external_key) DO UPDATE SET
  career_url = COALESCE(job_sources.career_url, EXCLUDED.career_url),
  featured = true;
