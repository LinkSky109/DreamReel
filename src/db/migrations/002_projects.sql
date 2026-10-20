-- 002 创作域：项目、成员、角色、场景、镜头
-- 迁移期策略：高频查询字段提升为列，其余字段放 payload(jsonb)，保证旧数据可原样回放。

CREATE TABLE IF NOT EXISTS projects (
  id          text PRIMARY KEY,
  org_id      text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id    text,
  name        text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft',
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS projects_org_updated_idx ON projects (org_id, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS projects_org_owner_idx ON projects (org_id, owner_id);
CREATE INDEX IF NOT EXISTS projects_payload_gin ON projects USING gin (payload jsonb_path_ops);

CREATE TABLE IF NOT EXISTS project_members (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members (user_id);

CREATE TABLE IF NOT EXISTS characters (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS characters_project_idx ON characters (project_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS scenes (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS scenes_project_idx ON scenes (project_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shots (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idx        integer NOT NULL DEFAULT 0,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS shots_project_idx ON shots (project_id, idx) WHERE deleted_at IS NULL;
