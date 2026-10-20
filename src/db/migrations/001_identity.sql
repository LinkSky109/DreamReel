-- 001 身份与租户
-- 约定：业务主键沿用现有字符串 id；所有租户表带 org_id；软删除 + 乐观锁版本。

CREATE TABLE IF NOT EXISTS organizations (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  slug        text NOT NULL,
  plan        text NOT NULL DEFAULT 'free',
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  version     integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_unique
  ON organizations (lower(slug)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS users (
  id            text PRIMARY KEY,
  org_id        text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email         text NOT NULL,
  password_hash text,
  name          text,
  role          text NOT NULL DEFAULT 'member',
  status        text NOT NULL DEFAULT 'active',
  profile       jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,
  version       integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_org_email_unique
  ON users (org_id, lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS users_org_status_idx ON users (org_id, status);

CREATE TABLE IF NOT EXISTS memberships (
  id         text PRIMARY KEY,
  org_id     text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  version    integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships (user_id);
