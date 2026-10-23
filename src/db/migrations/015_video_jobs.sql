-- 015 长任务持久化：video_jobs
-- 设计见 docs/adr/0005-video-job-persistence.md
-- 回滚：DROP TABLE video_jobs;（仅在新表无业务依赖时执行）

CREATE TABLE IF NOT EXISTS video_jobs (
  id                text PRIMARY KEY,
  user_id           text NOT NULL,
  project_id        text NOT NULL,
  type              text NOT NULL DEFAULT 'video_batch',
  status            text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  shot_ids          jsonb NOT NULL DEFAULT '[]'::jsonb,
  style_id          text,
  idempotency_key   text,
  total             integer NOT NULL DEFAULT 0,
  completed         integer NOT NULL DEFAULT 0,
  message           text NOT NULL DEFAULT '',
  error_code        text,
  error_message     text,
  attempt           integer NOT NULL DEFAULT 0,
  max_attempts      integer NOT NULL DEFAULT 3,
  cancel_requested  boolean NOT NULL DEFAULT false,
  worker_id         text,
  lease_expires_at  timestamptz,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz
);

-- 幂等：同一用户、同一类型、同一 key 只建一个任务
CREATE UNIQUE INDEX IF NOT EXISTS video_jobs_idempotency_uq
  ON video_jobs (user_id, type, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 领取队列
CREATE INDEX IF NOT EXISTS video_jobs_queue_idx
  ON video_jobs (status, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS video_jobs_project_idx
  ON video_jobs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS video_jobs_lease_idx
  ON video_jobs (lease_expires_at)
  WHERE status = 'running';
