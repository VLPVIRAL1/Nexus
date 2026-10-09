CREATE TABLE external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  provider_subject text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_code ~ '^[a-z0-9_-]{2,40}$'),
  CHECK (length(provider_subject) BETWEEN 1 AND 512),
  UNIQUE(provider_code, provider_subject),
  UNIQUE(provider_code, user_id)
);

CREATE INDEX external_identities_user_idx ON external_identities(user_id);
CREATE TRIGGER external_identities_touch_updated_at BEFORE UPDATE ON external_identities FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
