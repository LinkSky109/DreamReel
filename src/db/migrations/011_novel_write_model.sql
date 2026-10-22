-- 011 小说写模型：偏移、季弧线、集稳定逻辑键
-- 设计：季/集按 logical_key / season_no upsert，重排保留既有 id。

ALTER TABLE novel_chunks
  ADD COLUMN IF NOT EXISTS chapter_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS start_offset  integer,
  ADD COLUMN IF NOT EXISTS end_offset    integer,
  ADD COLUMN IF NOT EXISTS cleaned_hash  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS word_count    integer NOT NULL DEFAULT 0;

ALTER TABLE seasons
  ADD COLUMN IF NOT EXISTS arc_name           text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS goal               text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS acts               jsonb,
  ADD COLUMN IF NOT EXISTS ending_hook        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS estimated_episodes integer,
  ADD COLUMN IF NOT EXISTS plan_provider      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS chapter_start      integer,
  ADD COLUMN IF NOT EXISTS chapter_end        integer;

-- 旧的严格唯一约束会阻止软删除后重建同 season_no；改为部分唯一索引
ALTER TABLE seasons DROP CONSTRAINT IF EXISTS seasons_novel_id_season_no_key;
CREATE UNIQUE INDEX IF NOT EXISTS seasons_novel_no_uq
  ON seasons (novel_id, season_no) WHERE deleted_at IS NULL;

ALTER TABLE episodes
  ADD COLUMN IF NOT EXISTS chapter_start     integer,
  ADD COLUMN IF NOT EXISTS chapter_end       integer,
  ADD COLUMN IF NOT EXISTS start_offset      integer,
  ADD COLUMN IF NOT EXISTS end_offset        integer,
  ADD COLUMN IF NOT EXISTS estimated_seconds numeric(8,2),
  ADD COLUMN IF NOT EXISTS short_source      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cleaned_hash      text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS outline           jsonb,
  ADD COLUMN IF NOT EXISTS screenplay        jsonb,
  ADD COLUMN IF NOT EXISTS target_seconds    integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS status            text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS logical_key       text NOT NULL DEFAULT '';

-- 回填 logical_key：优先 season_no + episode_no；无季时退回集号
UPDATE episodes e
SET logical_key = CASE
  WHEN e.season_id IS NULL THEN 'e' || e.episode_no
  ELSE 's' || COALESCE((SELECT s.season_no FROM seasons s WHERE s.id = e.season_id), 0) || ':e' || e.episode_no
END
WHERE e.logical_key = '';

CREATE UNIQUE INDEX IF NOT EXISTS episodes_novel_logical_uq
  ON episodes (novel_id, logical_key) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS episodes_novel_status_idx
  ON episodes (novel_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS episodes_season_order_idx
  ON episodes (novel_id, season_id, episode_no) WHERE deleted_at IS NULL;
