-- 010 小说单一事实源：正文、规划产物、媒体元数据
-- 目标：结构化数据写主 PG；正文与规划结果入 PG；媒体只存元数据。

CREATE TABLE IF NOT EXISTS novel_sources (
  novel_id      text PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
  org_id        text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source_type   text NOT NULL DEFAULT 'text',
  source_ref    text NOT NULL DEFAULT '',
  cleaned_text  text NOT NULL DEFAULT '',
  cleaned_hash  text NOT NULL DEFAULT '',
  encoding      text NOT NULL DEFAULT 'utf-8',
  word_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS novel_sources_org_idx ON novel_sources (org_id);

-- 规划运行与产物（替代本地 plan/*.json）
CREATE TABLE IF NOT EXISTS novel_plan_runs (
  id            text PRIMARY KEY,
  org_id        text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id      text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  cleaned_hash  text NOT NULL DEFAULT '',
  provider      text NOT NULL DEFAULT '',
  model         text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'running',
  stats         jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS novel_plan_runs_novel_idx
  ON novel_plan_runs (novel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS novel_plan_artifacts (
  run_id    text NOT NULL REFERENCES novel_plan_runs(id) ON DELETE CASCADE,
  kind      text NOT NULL,
  payload   jsonb NOT NULL,
  PRIMARY KEY (run_id, kind)
);

-- 媒体元数据：字节存本地/网盘/NAS，PG 只存索引
CREATE TABLE IF NOT EXISTS media_objects (
  id           text PRIMARY KEY,
  org_id       text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id     text REFERENCES novels(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  backend      text NOT NULL DEFAULT 'local',
  storage_key  text NOT NULL,
  url          text NOT NULL DEFAULT '',
  mime         text NOT NULL DEFAULT '',
  size_bytes   bigint NOT NULL DEFAULT 0,
  sha256       text NOT NULL DEFAULT '',
  provider     text NOT NULL DEFAULT '',
  sync_status  text NOT NULL DEFAULT 'local',
  remote_key   text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
CREATE INDEX IF NOT EXISTS media_objects_novel_kind_idx
  ON media_objects (novel_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS media_objects_hash_idx ON media_objects (sha256);

CREATE TABLE IF NOT EXISTS media_sync_jobs (
  id           bigserial PRIMARY KEY,
  org_id       text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  media_id     text NOT NULL REFERENCES media_objects(id) ON DELETE CASCADE,
  target       text NOT NULL,
  status       text NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_sync_jobs_pending_idx
  ON media_sync_jobs (status, created_at);
