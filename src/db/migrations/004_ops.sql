-- 004 运维域：审计日志与幂等键

-- 审计日志只追加；prev_hash/hash 形成哈希链，便于防篡改校验。
CREATE TABLE IF NOT EXISTS audit_logs (
  id            bigserial PRIMARY KEY,
  org_id        text NOT NULL,
  actor_id      text,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text,
  request_id    text,
  ip            text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash     text,
  hash          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_org_time_idx ON audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs (resource_type, resource_id);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         text PRIMARY KEY,
  scope       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'pending',
  status_code integer,
  response    jsonb,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idempotency_keys_expiry_idx ON idempotency_keys (expires_at);
