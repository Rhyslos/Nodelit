-- nodelit schema
-- every statement is idempotent so this can run on every boot

-- user tables
CREATE TABLE IF NOT EXISTS users (
    id           text PRIMARY KEY,
    username     text NOT NULL,
    display_name text NOT NULL,
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    cursor_color text NOT NULL DEFAULT '#c8502a',
    salt         text NOT NULL,
    hash         text NOT NULL,
    created_at   timestamptz(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_key ON users (lower(username));

-- session tables
-- id holds the sha-256 of the cookie value, never the value itself,
-- so a leaked database dump cannot be replayed as a live session
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
    created_at  timestamptz(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_owner_id_idx ON workspaces (owner_id);
CREATE INDEX IF NOT EXISTS workspaces_category_id_idx ON workspaces (category_id);

CREATE TABLE IF NOT EXISTS memberships (
    workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    PRIMARY KEY (workspace_id, user_id)
);

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

-- named board_columns to avoid confusion with information_schema.columns.
-- workspace is reachable through tab_id, so it is not stored again here.
CREATE TABLE IF NOT EXISTS board_columns (
    id           text PRIMARY KEY,
    tab_id       text NOT NULL REFERENCES tabs(id) ON DELETE CASCADE,
    column_index integer NOT NULL
);

CREATE INDEX IF NOT EXISTS board_columns_tab_id_idx ON board_columns (tab_id);
CREATE UNIQUE INDEX IF NOT EXISTS board_columns_tab_index_key ON board_columns (tab_id, column_index);

-- tab and workspace are reachable through column_id, so they are not stored again here
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
