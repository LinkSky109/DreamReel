-- 003 小说域：项目、章节切片、角色与形象状态、世界观、季/集、设定图

CREATE TABLE IF NOT EXISTS novels (
  id          text PRIMARY KEY,
  org_id      text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id    text,
  title       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft',
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS novels_org_updated_idx ON novels (org_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS novels_payload_gin ON novels USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS novel_chunks (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  idx        integer NOT NULL DEFAULT 0,
  content    text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (novel_id, idx)
);
CREATE INDEX IF NOT EXISTS novel_chunks_novel_idx ON novel_chunks (novel_id, idx);

CREATE TABLE IF NOT EXISTS novel_characters (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS novel_characters_novel_idx ON novel_characters (novel_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS novel_character_states (
  id           text PRIMARY KEY,
  org_id       text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id     text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  character_id text NOT NULL,
  episode_no   integer NOT NULL,
  appearance   text NOT NULL DEFAULT '',
  equipment    text NOT NULL DEFAULT '',
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (novel_id, character_id, episode_no)
);
CREATE INDEX IF NOT EXISTS novel_states_char_idx ON novel_character_states (novel_id, character_id, episode_no);

CREATE TABLE IF NOT EXISTS novel_world_entities (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  kind       text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS novel_entities_novel_idx ON novel_world_entities (novel_id, kind) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS seasons (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  season_no  integer NOT NULL DEFAULT 1,
  title      text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (novel_id, season_no)
);

CREATE TABLE IF NOT EXISTS episodes (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  season_id  text REFERENCES seasons(id) ON DELETE SET NULL,
  episode_no integer NOT NULL DEFAULT 1,
  title      text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (novel_id, season_id, episode_no)
);
CREATE INDEX IF NOT EXISTS episodes_novel_no_idx ON episodes (novel_id, episode_no);

CREATE TABLE IF NOT EXISTS novel_asset_images (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  novel_id   text NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
  category   text NOT NULL DEFAULT '',
  name       text NOT NULL DEFAULT '',
  status     text NOT NULL DEFAULT 'draft',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS novel_assets_novel_cat_idx ON novel_asset_images (novel_id, category) WHERE deleted_at IS NULL;
