-- nodelit schema

-- user tables
CREATE TABLE IF NOT EXISTS users (
    id           text PRIMARY KEY,
    username     text NOT NULL,
    display_name text NOT NULL,
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    cursor_color text NOT NULL DEFAULT '#c8502a',
    salt         text NOT NULL,
    hash         text NOT NULL,
    created_at   timestamptz(3) NOT NULL DEFAULT now(),
    deleted_at   timestamptz(3)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz(3);

DROP INDEX IF EXISTS users_username_lower_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_active_key
    ON users (lower(username)) WHERE deleted_at IS NULL;

-- session tables
CREATE TABLE IF NOT EXISTS sessions (
    id         text PRIMARY KEY,
    user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

-- category tables
CREATE TABLE IF NOT EXISTS categories (
    id      text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name    text NOT NULL,
    color   text NOT NULL DEFAULT '#c8502a'
);

CREATE INDEX IF NOT EXISTS categories_user_id_idx ON categories (user_id);

-- workspace tables
CREATE TABLE IF NOT EXISTS workspaces (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    owner_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id text REFERENCES categories(id) ON DELETE SET NULL,
    created_at  timestamptz(3) NOT NULL DEFAULT now(),
    deleted_at  timestamptz(3)
);

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS deleted_at timestamptz(3);

CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx ON workspaces (owner_id);
CREATE INDEX IF NOT EXISTS workspaces_category_id_idx ON workspaces (category_id);

CREATE TABLE IF NOT EXISTS memberships (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         text NOT NULL DEFAULT 'member',
    PRIMARY KEY (workspace_id, user_id)
);

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;

ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
    CHECK (role IN ('owner', 'member', 'viewer'));

CREATE INDEX IF NOT EXISTS memberships_user_id_idx ON memberships (user_id);

-- board tables
CREATE TABLE IF NOT EXISTS tabs (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         text NOT NULL DEFAULT 'New Board',
    color        text NOT NULL DEFAULT '#6c8ebf',
    tab_order    integer NOT NULL DEFAULT 0,
    is_archived  boolean NOT NULL DEFAULT false,
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tabs_workspace_id_idx ON tabs (workspace_id);

CREATE TABLE IF NOT EXISTS board_columns (
    id           text PRIMARY KEY,
    tab_id       text NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    column_index integer NOT NULL
);

CREATE INDEX IF NOT EXISTS board_columns_tab_id_idx ON board_columns (tab_id);
CREATE UNIQUE INDEX IF NOT EXISTS board_columns_tab_index_key ON board_columns (tab_id, column_index);

CREATE TABLE IF NOT EXISTS lists (
    id         text PRIMARY KEY,
    column_id  text NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
    name       text NOT NULL DEFAULT 'New list',
    list_order integer NOT NULL DEFAULT 0,
    category   text,
    color      text,
    updated_at timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lists_column_id_idx ON lists (column_id);

CREATE TABLE IF NOT EXISTS tasks (
    id           text PRIMARY KEY,
    list_id      text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title        text NOT NULL DEFAULT '',
    description  text NOT NULL DEFAULT '',
    is_completed boolean NOT NULL DEFAULT false,
    task_order   integer NOT NULL DEFAULT 0,
    category     text,
    color        text,
    deadline     date,
    subtasks     jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_list_id_idx ON tasks (list_id);

-- audit tables
CREATE TABLE IF NOT EXISTS audit_log (
    id          bigserial PRIMARY KEY,
    created_at  timestamptz(3) NOT NULL DEFAULT now(),
    actor_id    text,
    actor_name  text,
    action      text NOT NULL,
    target_type text,
    target_id   text,
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
    ip          text
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_lockout_idx ON audit_log (action, created_at DESC);

-- assignment tables
CREATE TABLE IF NOT EXISTS task_assignees (
    task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS task_assignees_user_id_idx ON task_assignees (user_id);

-- checklist migration
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS checklists jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'subtasks'
    ) THEN
        UPDATE tasks
        SET checklists = jsonb_build_array(
            jsonb_build_object('id', 'cl-legacy', 'name', 'Checklist', 'items', subtasks)
        )
        WHERE subtasks <> '[]'::jsonb AND checklists = '[]'::jsonb;

        ALTER TABLE tasks DROP COLUMN subtasks;
    END IF;
END $$;

-- tag tables
CREATE TABLE IF NOT EXISTS tags (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         text NOT NULL DEFAULT '',
    color        text NOT NULL DEFAULT '#c8502a'
);

ALTER TABLE tags ALTER COLUMN name SET DEFAULT '';

CREATE INDEX IF NOT EXISTS tags_workspace_id_idx ON tags (workspace_id);

DROP INDEX IF EXISTS tags_workspace_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS tags_workspace_named_key
    ON tags (workspace_id, lower(name)) WHERE name <> '';

CREATE TABLE IF NOT EXISTS list_tags (
    list_id text NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    tag_id  text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, tag_id)
);

CREATE TABLE IF NOT EXISTS task_tags (
    task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id  text NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tag_id)
);

CREATE INDEX IF NOT EXISTS list_tags_tag_id_idx ON list_tags (tag_id);
CREATE INDEX IF NOT EXISTS task_tags_tag_id_idx ON task_tags (tag_id);

ALTER TABLE lists DROP COLUMN IF EXISTS category;
ALTER TABLE lists DROP COLUMN IF EXISTS color;
ALTER TABLE tasks DROP COLUMN IF EXISTS category;
ALTER TABLE tasks DROP COLUMN IF EXISTS color;

-- theme columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{"mode":"default","custom":{}}'::jsonb;

-- notation tables
CREATE TABLE IF NOT EXISTS notation_groups (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         text NOT NULL DEFAULT 'New group',
    color        text,
    group_order  integer NOT NULL DEFAULT 0,
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notation_groups_workspace_id_idx ON notation_groups (workspace_id);

CREATE TABLE IF NOT EXISTS notation_pages (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    group_id     text REFERENCES notation_groups(id) ON DELETE SET NULL,
    title        text NOT NULL DEFAULT 'Untitled',
    page_order   integer NOT NULL DEFAULT 0,
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notation_pages_workspace_id_idx ON notation_pages (workspace_id);
CREATE INDEX IF NOT EXISTS notation_pages_group_id_idx ON notation_pages (group_id);

CREATE TABLE IF NOT EXISTS notation_documents (
    page_id    text PRIMARY KEY REFERENCES notation_pages(id) ON DELETE CASCADE,
    state      bytea NOT NULL,
    updated_at timestamptz(3) NOT NULL DEFAULT now()
);

INSERT INTO notation_pages (id, workspace_id, title, page_order)
SELECT 'page-' || w.id, w.id, 'Untitled', 0
FROM workspaces w
WHERE w.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM notation_pages p WHERE p.workspace_id = w.id);

-- notation layout columns
ALTER TABLE notation_pages ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'pageless';

ALTER TABLE notation_pages DROP CONSTRAINT IF EXISTS notation_pages_layout_check;

ALTER TABLE notation_pages ADD CONSTRAINT notation_pages_layout_check
    CHECK (layout IN ('paged', 'pageless'));

-- notation search columns
ALTER TABLE notation_documents ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '';
