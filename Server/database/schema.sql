-- nodelit schema
--
-- This file runs on every server start, so it must only ever ADD things:
--   * CREATE TABLE / INDEX ... IF NOT EXISTS, ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   * constraints through pg_temp.add_constraint (adds only when missing)
--   * one-off data fixes inside a run-once step: IF pg_temp.run_once('<id>') THEN ... END IF
-- DROP, TRUNCATE, DELETE, RENAME, type changes and UPDATEs outside run-once steps are
-- rejected by modules/SchemaGuard.mjs before anything runs, so a bad edit fails the deploy
-- instead of touching production data.

-- schema bookkeeping
CREATE TABLE IF NOT EXISTS schema_steps (
    id         text PRIMARY KEY,
    applied_at timestamptz(3) NOT NULL DEFAULT now()
);

-- helpers that only exist while this script runs
CREATE OR REPLACE FUNCTION pg_temp.add_constraint(target regclass, constraint_name text, definition text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = target AND conname = constraint_name
    ) THEN
        EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', target, constraint_name, definition);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.run_once(step text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO schema_steps (id) VALUES (step) ON CONFLICT (id) DO NOTHING;
    RETURN FOUND;
END $$;

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

SELECT pg_temp.add_constraint('memberships', 'memberships_role_check',
    $c$CHECK (role IN ('owner', 'member', 'viewer')) NOT VALID$c$);

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
    deadline     date,
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

-- checklist columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS checklists jsonb NOT NULL DEFAULT '[]'::jsonb;

-- tag tables
CREATE TABLE IF NOT EXISTS tags (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         text NOT NULL DEFAULT '',
    color        text NOT NULL DEFAULT '#c8502a'
);

ALTER TABLE tags ALTER COLUMN name SET DEFAULT '';

CREATE INDEX IF NOT EXISTS tags_workspace_id_idx ON tags (workspace_id);

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

-- gives workspaces made before notation existed their first page
DO $$
BEGIN
    IF pg_temp.run_once('2026-notation-first-page') THEN
        INSERT INTO notation_pages (id, workspace_id, title, page_order)
        SELECT 'page-' || w.id, w.id, 'Untitled', 0
        FROM workspaces w
        WHERE w.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM notation_pages p WHERE p.workspace_id = w.id);
    END IF;
END $$;

-- notation layout columns
ALTER TABLE notation_pages ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'pageless';

SELECT pg_temp.add_constraint('notation_pages', 'notation_pages_layout_check',
    $c$CHECK (layout IN ('paged', 'pageless')) NOT VALID$c$);

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

SELECT pg_temp.add_constraint('tabs', 'tabs_group_id_fkey',
    $c$FOREIGN KEY (group_id) REFERENCES tab_groups(id) ON DELETE SET NULL NOT VALID$c$);

CREATE INDEX IF NOT EXISTS tabs_group_id_idx ON tabs (group_id);

-- tag scope columns
ALTER TABLE tags ADD COLUMN IF NOT EXISTS tab_id text;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_id text;

SELECT pg_temp.add_constraint('tags', 'tags_tab_id_fkey',
    $c$FOREIGN KEY (tab_id) REFERENCES tabs(id) ON DELETE CASCADE NOT VALID$c$);

SELECT pg_temp.add_constraint('tags', 'tags_group_id_fkey',
    $c$FOREIGN KEY (group_id) REFERENCES tab_groups(id) ON DELETE CASCADE NOT VALID$c$);

SELECT pg_temp.add_constraint('tags', 'tags_single_scope_check',
    $c$CHECK (tab_id IS NULL OR group_id IS NULL) NOT VALID$c$);

CREATE INDEX IF NOT EXISTS tags_tab_id_idx ON tags (tab_id);
CREATE INDEX IF NOT EXISTS tags_group_id_idx ON tags (group_id);

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

SELECT pg_temp.add_constraint('meetings', 'meetings_time_order_check',
    $c$CHECK (ends_at > starts_at) NOT VALID$c$);

-- colour normalisation (lowercases colours saved before colours were checked)
DO $$
BEGIN
    IF pg_temp.run_once('2026-lowercase-colours') THEN
        UPDATE users SET cursor_color = lower(cursor_color) WHERE cursor_color <> lower(cursor_color);
        UPDATE categories SET color = lower(color) WHERE color <> lower(color);
        UPDATE tabs SET color = lower(color) WHERE color <> lower(color);
        UPDATE tab_groups SET color = lower(color) WHERE color <> lower(color);
        UPDATE tags SET color = lower(color) WHERE color <> lower(color);
        UPDATE notation_groups SET color = lower(color) WHERE color IS NOT NULL AND color <> lower(color);
    END IF;
END $$;

SELECT pg_temp.add_constraint('users', 'users_cursor_color_check',
    $c$CHECK (cursor_color ~ '^#[0-9a-f]{6}$') NOT VALID$c$);

SELECT pg_temp.add_constraint('categories', 'categories_color_check',
    $c$CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID$c$);

SELECT pg_temp.add_constraint('tabs', 'tabs_color_check',
    $c$CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID$c$);

SELECT pg_temp.add_constraint('tab_groups', 'tab_groups_color_check',
    $c$CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID$c$);

SELECT pg_temp.add_constraint('tags', 'tags_color_check',
    $c$CHECK (color ~ '^#[0-9a-f]{6}$') NOT VALID$c$);

SELECT pg_temp.add_constraint('notation_groups', 'notation_groups_color_check',
    $c$CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$') NOT VALID$c$);

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

SELECT pg_temp.add_constraint('notation_images', 'notation_images_mime_check',
    $c$CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')) NOT VALID$c$);

CREATE TABLE IF NOT EXISTS notation_image_data (
    image_id text PRIMARY KEY REFERENCES notation_images(id) ON DELETE CASCADE,
    bytes    bytea NOT NULL
);

-- notation subgroup columns
ALTER TABLE notation_groups ADD COLUMN IF NOT EXISTS parent_id text;

SELECT pg_temp.add_constraint('notation_groups', 'notation_groups_parent_id_fkey',
    $c$FOREIGN KEY (parent_id) REFERENCES notation_groups(id) ON DELETE SET NULL NOT VALID$c$);

SELECT pg_temp.add_constraint('notation_groups', 'notation_groups_parent_self_check',
    $c$CHECK (parent_id IS NULL OR parent_id <> id) NOT VALID$c$);

CREATE INDEX IF NOT EXISTS notation_groups_parent_id_idx ON notation_groups (parent_id);

-- task history columns
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at timestamptz(3) NOT NULL DEFAULT now();
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz(3);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workspace_id text;

-- fills the history columns for tasks made before they existed
DO $$
BEGIN
    IF pg_temp.run_once('2026-task-history-backfill') THEN
        UPDATE tasks SET created_at = updated_at WHERE created_at > updated_at;
        UPDATE tasks SET completed_at = updated_at WHERE is_completed AND completed_at IS NULL;
        UPDATE tasks SET completed_at = NULL WHERE NOT is_completed AND completed_at IS NOT NULL;

        UPDATE tasks AS k
        SET workspace_id = t.workspace_id
        FROM lists l
        JOIN board_columns c ON c.id = l.column_id
        JOIN tabs t ON t.id = c.tab_id
        WHERE l.id = k.list_id AND k.workspace_id IS DISTINCT FROM t.workspace_id;
    END IF;
END $$;

SELECT pg_temp.add_constraint('tasks', 'tasks_workspace_id_fkey',
    $c$FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE NOT VALID$c$);

CREATE INDEX IF NOT EXISTS tasks_workspace_created_idx
    ON tasks (workspace_id, created_at);

CREATE INDEX IF NOT EXISTS tasks_workspace_completed_idx
    ON tasks (workspace_id, completed_at) WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tasks_workspace_deadline_idx
    ON tasks (workspace_id, deadline) WHERE deadline IS NOT NULL AND is_completed = false;

-- tracked task tables
CREATE TABLE IF NOT EXISTS tracked_tasks (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    task_id      text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    created_at   timestamptz(3) NOT NULL DEFAULT now(),
    created_by   text REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (workspace_id, task_id)
);

CREATE INDEX IF NOT EXISTS tracked_tasks_workspace_created_idx
    ON tracked_tasks (workspace_id, created_at);

-- discord integration tables
CREATE TABLE IF NOT EXISTS workspace_discord (
    workspace_id  text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    webhook_url   text,
    guild_id      text,
    post_kanban   boolean NOT NULL DEFAULT true,
    post_meetings boolean NOT NULL DEFAULT true,
    sync_events   boolean NOT NULL DEFAULT true,
    updated_by    text REFERENCES users(id) ON DELETE SET NULL,
    updated_at    timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meeting_discord_events (
    meeting_id text PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE,
    guild_id   text NOT NULL,
    event_id   text NOT NULL,
    created_at timestamptz(3) NOT NULL DEFAULT now()
);

-- discord connected workspace (one row naming the single workspace that posts to Discord)
CREATE TABLE IF NOT EXISTS discord_connection (
    id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    workspace_id text REFERENCES workspaces(id) ON DELETE SET NULL,
    updated_by   text REFERENCES users(id) ON DELETE SET NULL,
    updated_at   timestamptz(3) NOT NULL DEFAULT now()
);

-- carries over an existing per-workspace setup the first time this runs
INSERT INTO discord_connection (id, workspace_id)
SELECT 1, workspace_id FROM workspace_discord
WHERE webhook_url IS NOT NULL OR guild_id IS NOT NULL
ORDER BY updated_at DESC
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- archive columns: deleting moves things here instead of removing them.
-- archived_via names the item that was archived; everything archived along with it
-- (a list's tasks, a board's lists and tasks) shares that id, so a restore brings it all back.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz(3);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_via text;

ALTER TABLE lists ADD COLUMN IF NOT EXISTS archived_at timestamptz(3);
ALTER TABLE lists ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE lists ADD COLUMN IF NOT EXISTS archived_via text;
ALTER TABLE lists ADD COLUMN IF NOT EXISTS archive_origin jsonb;

ALTER TABLE tabs ADD COLUMN IF NOT EXISTS archived_at timestamptz(3);
ALTER TABLE tabs ADD COLUMN IF NOT EXISTS archived_by text;
ALTER TABLE tabs ADD COLUMN IF NOT EXISTS archived_via text;

ALTER TABLE notation_pages ADD COLUMN IF NOT EXISTS archived_at timestamptz(3);
ALTER TABLE notation_pages ADD COLUMN IF NOT EXISTS archived_by text;

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS archived_at timestamptz(3);
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS archived_by text;

CREATE INDEX IF NOT EXISTS tasks_archived_via_idx ON tasks (archived_via) WHERE archived_via IS NOT NULL;
CREATE INDEX IF NOT EXISTS lists_archived_via_idx ON lists (archived_via) WHERE archived_via IS NOT NULL;

-- boards archived before the Archive page existed join it, together with their lists and tasks
DO $$
BEGIN
    IF pg_temp.run_once('2026-archive-legacy-boards') THEN
        UPDATE tabs SET archived_at = updated_at, archived_via = id
        WHERE is_archived AND archived_at IS NULL;

        UPDATE lists AS l SET archived_at = t.archived_at, archived_via = t.id
        FROM board_columns c JOIN tabs t ON t.id = c.tab_id
        WHERE c.id = l.column_id AND t.archived_via = t.id AND l.archived_at IS NULL;

        UPDATE tasks AS k SET archived_at = l.archived_at, archived_via = l.archived_via
        FROM lists l
        WHERE l.id = k.list_id AND l.archived_via IS NOT NULL AND k.archived_at IS NULL;
    END IF;
END $$;
