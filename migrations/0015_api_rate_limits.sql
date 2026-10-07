CREATE TABLE api_rate_limit_windows (
  firm_id uuid NOT NULL REFERENCES firms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  operation_code text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(firm_id,user_id,operation_code,window_started_at)
);

CREATE INDEX api_rate_limit_cleanup_idx ON api_rate_limit_windows(updated_at);
