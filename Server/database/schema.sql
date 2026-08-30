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
    CHECK (role IN ('owner', 'member', 'viewer')) NOT VALID;

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
    CHECK (layout IN ('paged', 'pageless')) NOT VALID;

-- notation search columns
ALTER TABLE notation_documents ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '';

-- tab group tables
CREATE TABLE IF NOT EXISTS tab_groups (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         text NOT NULL DEFAULT 'New group',
    color        text NOT NULL DEFAULT '#6c8ebf',
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tab_groups_workspace_id_idx ON tab_groups (workspace_id);

ALTER TABLE tabs ADD COLUMN IF NOT EXISTS group_id text;

ALTER TABLE tabs DROP CONSTRAINT IF EXISTS tabs_group_id_fkey;

ALTER TABLE tabs ADD CONSTRAINT tabs_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES tab_groups(id) ON DELETE SET NULL NOT VALID;

CREATE INDEX IF NOT EXISTS tabs_group_id_idx ON tabs (group_id);

-- tag scope columns
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tab_id text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_id text;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_tab_id_fkey;

ALTER TABLE tags ADD CONSTRAINT tags_tab_id_fkey
    FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_group_id_fkey;

ALTER TABLE tags ADD CONSTRAINT tags_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES tab_groups(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_single_scope_check;

ALTER TABLE tags ADD CONSTRAINT tags_single_scope_check
    CHECK (tab_id IS NULL OR group_id IS NULL) NOT VALID;

CREATE INDEX IF NOT EXISTS tags_tab_id_idx ON tags (tab_id);
CREATE INDEX IF NOT EXISTS tags_group_id_idx ON tags (group_id);

DROP INDEX IF EXISTS tags_workspace_named_key;

CREATE UNIQUE INDEX IF NOT EXISTS tags_scope_named_key
    ON tags (workspace_id, COALESCE(tab_id, ''), COALESCE(group_id, ''), lower(name))
    WHERE name <> '';

-- calendar tables
CREATE TABLE IF NOT EXISTS availability_slots (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot_start   timestamptz(3) NOT NULL,
    PRIMARY KEY (workspace_id, user_id, slot_start)
);

CREATE INDEX IF NOT EXISTS availability_slots_workspace_start_idx
    ON availability_slots (workspace_id, slot_start);

CREATE TABLE IF NOT EXISTS meetings (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title        text NOT NULL DEFAULT 'Meeting',
    description  text NOT NULL DEFAULT '',
    starts_at    timestamptz(3) NOT NULL,
    ends_at      timestamptz(3) NOT NULL,
    created_by   text REFERENCES users(id) ON DELETE SET NULL,
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_workspace_start_idx ON meetings (workspace_id, starts_at);

-- colour normalisation
UPDATE users SET cursor_color = lower(cursor_color) WHERE cursor_color <> lower(cursor_color);
UPDATE categories SET color = lower(color) WHERE color <> lower(color);
UPDATE tabs SET color = lower(color) WHERE color <> lower(color);
UPDATE tab_groups SET color = lower(color) WHERE color <> lower(color);
UPDATE tags SET color = lower(color) WHERE color <> lower(color);
UPDATE notation_groups SET color = lower(color) WHERE color IS NOT NULL AND color <> lower(color);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cursor_color_check;
ALTER TABLE users ADD CONSTRAINT users_cursor_color_check
    CHECK (cursor_color ~ '^#[0-9a-f]{6}$') NOT VALID;

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_color_check;
ALTER TABLE categories ADD CONSTRAINT categories_color_check
    CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID;

ALTER TABLE tabs DROP CONSTRAINT IF EXISTS tabs_color_check;
ALTER TABLE tabs ADD CONSTRAINT tabs_color_check
    CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID;

ALTER TABLE tab_groups DROP CONSTRAINT IF EXISTS tab_groups_color_check;
ALTER TABLE tab_groups ADD CONSTRAINT tab_groups_color_check
    CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID;

ALTER TABLE tags DROP CONSTRAINT IF EXISTS tags_color_check;
ALTER TABLE tags ADD CONSTRAINT tags_color_check
    CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID;

ALTER TABLE notation_groups DROP CONSTRAINT IF EXISTS notation_groups_color_check;
ALTER TABLE notation_groups ADD CONSTRAINT notation_groups_color_check
    CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$') NOT VALID;

-- saved palette columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS palette jsonb NOT NULL DEFAULT '[]'::jsonb;

-- notation image tables
CREATE TABLE IF NOT EXISTS notation_images (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    uploaded_by  text REFERENCES users(id) ON DELETE SET NULL,
    mime         text NOT NULL,
    byte_size    integer NOT NULL,
    width        integer NOT NULL,
    height       integer NOT NULL,
    created_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notation_images_workspace_id_idx ON notation_images (workspace_id);

ALTER TABLE notation_images DROP CONSTRAINT IF EXISTS notation_images_mime_check;

ALTER TABLE notation_images ADD CONSTRAINT notation_images_mime_check
    CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')) NOT VALID;

CREATE TABLE IF NOT EXISTS notation_image_data (
    image_id text PRIMARY KEY REFERENCES notation_images(id) ON DELETE CASCADE,
    bytes    bytea NOT NULL
);

-- notation subgroup columns
ALTER TABLE notation_groups ADD COLUMN IF NOT EXISTS parent_id text;

ALTER TABLE notation_groups DROP CONSTRAINT IF EXISTS notation_groups_parent_id_fkey;

ALTER TABLE notation_groups ADD CONSTRAINT notation_groups_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES notation_groups(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE notation_groups DROP CONSTRAINT IF EXISTS notation_groups_parent_self_check;

ALTER TABLE notation_groups ADD CONSTRAINT notation_groups_parent_self_check
    CHECK (parent_id IS NULL OR parent_id <> id) NOT VALID;

CREATE INDEX IF NOT EXISTS notation_groups_parent_id_idx ON notation_groups (parent_id);

-- task history columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at timestamptz(3) NOT NULL DEFAULT now();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz(3);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id text;

UPDATE tasks SET created_at = updated_at WHERE created_at > updated_at;

UPDATE tasks SET completed_at = updated_at WHERE is_completed AND completed_at IS NULL;

UPDATE tasks SET completed_at = NULL WHERE NOT is_completed AND completed_at IS NOT NULL;

UPDATE tasks AS k
SET workspace_id = t.workspace_id
FROM lists l
JOIN board_columns c ON c.id = l.column_id
JOIN tabs t ON t.id = c.tab_id
WHERE l.id = k.list_id AND k.workspace_id IS DISTINCT FROM t.workspace_id;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_workspace_id_fkey;

ALTER TABLE tasks ADD CONSTRAINT tasks_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE NOT VALID;

CREATE INDEX IF NOT EXISTS tasks_workspace_created_idx
    ON tasks (workspace_id, created_at);

CREATE INDEX IF NOT EXISTS tasks_workspace_completed_idx
    ON tasks (workspace_id, completed_at) WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_workspace_deadline_idx
    ON tasks (workspace_id, deadline) WHERE deadline IS NOT NULL AND is_completed = false;
