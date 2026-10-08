CREATE TABLE authentication_attempt_windows (
  operation_code text NOT NULL CHECK (operation_code IN ('login', 'account_recovery')),
  key_scope text NOT NULL CHECK (key_scope IN ('network', 'principal')),
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(operation_code, key_scope, key_hash, window_started_at)
);

CREATE INDEX authentication_attempt_cleanup_idx ON authentication_attempt_windows(updated_at);
