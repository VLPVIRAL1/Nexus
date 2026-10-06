ALTER TABLE clients ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

ALTER TABLE tax_years
  ADD CONSTRAINT tax_years_preparation_status_check
  CHECK (preparation_status IN ('not_started','documents_pending','in_preparation','ready_for_review','changes_requested','reviewed_draft','archived'));

ALTER TABLE people
  ADD CONSTRAINT people_role_check CHECK (role IN ('taxpayer','spouse'));

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id),
  active_firm_id uuid NOT NULL REFERENCES firms(id),
  mfa_verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revocation_reason text,
  user_agent_hash text,
  CHECK (idle_expires_at <= absolute_expires_at),
  CHECK (absolute_expires_at > created_at),
  FOREIGN KEY (active_firm_id, user_id) REFERENCES memberships(firm_id, user_id)
);
CREATE INDEX auth_sessions_user_active_idx ON auth_sessions(user_id, active_firm_id, absolute_expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER clients_touch_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER tax_years_touch_updated_at BEFORE UPDATE ON tax_years FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER people_touch_updated_at BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
