-- 009 写事件 outbox
-- 用于 novels 及子集合的写镜像：先落事件，再由 worker 幂等应用。

CREATE TABLE IF NOT EXISTS outbox_events (
  id           bigserial PRIMARY KEY,
  event_id     text NOT NULL UNIQUE,
  org_id       text NOT NULL,
  kind         text NOT NULL,
  op           text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox_events (status, available_at);
CREATE INDEX IF NOT EXISTS outbox_kind_idx ON outbox_events (kind, created_at DESC);
