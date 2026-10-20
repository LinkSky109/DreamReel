-- 008 角色形象状态与备选集合

ALTER TABLE novel_character_states ADD COLUMN IF NOT EXISTS sort_order bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS novel_states_order_idx ON novel_character_states (novel_id, character_id, sort_order);

CREATE TABLE IF NOT EXISTS character_sets (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  provider   text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS character_sets_novel_idx ON character_sets (novel_id, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS world_sets (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  provider   text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS world_sets_novel_idx ON world_sets (novel_id, sort_order) WHERE deleted_at IS NULL;
