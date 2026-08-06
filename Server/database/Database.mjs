// database imports
import crypto from 'crypto';
import { promisify } from 'node:util';
import pool, { query, queryOne, withTransaction } from './Pool.mjs';

const scrypt = promisify(crypto.scrypt);

// configuration constants
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const AUDIT_RETENTION_DAYS = 90;
const KEY_LENGTH = 64;

const TAB_FIELDS = ['name', 'color', 'tabOrder', 'isArchived'];
const LIST_FIELDS = ['name', 'columnID', 'listOrder', 'category', 'color'];
const TASK_FIELDS = ['title', 'description', 'isCompleted', 'listID', 'taskOrder', 'category', 'color', 'deadline', 'subtasks'];
const PUBLIC_USER_FIELDS = ['id', 'username', 'displayName', 'role', 'cursorColor'];

const FIELD_DEFINITIONS = {
    name: { column: 'name' },
    color: { column: 'color' },
    category: { column: 'category' },
    tabOrder: { column: 'tab_order' },
    isArchived: { column: 'is_archived', transform: Boolean },
    columnID: { column: 'column_id' },
    listOrder: { column: 'list_order' },
    listID: { column: 'list_id' },
    taskOrder: { column: 'task_order' },
    title: { column: 'title' },
    description: { column: 'description' },
    isCompleted: { column: 'is_completed', transform: Boolean },
    deadline: { column: 'deadline', cast: '::date', transform: value => (value === '' || value === undefined ? null : value) },
    subtasks: { column: 'subtasks', cast: '::jsonb', transform: value => JSON.stringify(value ?? []) }
};

// projection constants
const USER_SELECT = `
    id,
    username,
    display_name AS "displayName",
    role,
    cursor_color AS "cursorColor"
`;

const WORKSPACE_SELECT = `
    w.id,
    w.name,
    w.owner_id AS "ownerID",
    w.category_id AS "categoryID",
    w.created_at AS "createdAt"
`;

const TAB_SELECT = `
    t.id,
    t.workspace_id AS "workspaceID",
    t.name,
    t.color,
    t.tab_order AS "tabOrder",
    t.is_archived AS "isArchived",
    t.updated_at AS "updatedAt"
`;

const COLUMN_SELECT = `
    c.id,
    c.tab_id AS "tabID",
    t.workspace_id AS "workspaceID",
    c.column_index AS "columnIndex"
`;

const COLUMN_FROM = `
    FROM board_columns c
    JOIN tabs t ON t.id = c.tab_id
`;

const LIST_SELECT = `
    l.id,
    l.column_id AS "columnID",
    c.tab_id AS "tabID",
    t.workspace_id AS "workspaceID",
    l.name,
    l.list_order AS "listOrder",
    l.category,
    l.color,
    l.updated_at AS "updatedAt"
`;

const LIST_FROM = `
    FROM lists l
    JOIN board_columns c ON c.id = l.column_id
    JOIN tabs t ON t.id = c.tab_id
`;

const TASK_SELECT = `
    k.id,
    k.list_id AS "listID",
    k.title,
    k.description,
    k.is_completed AS "isCompleted",
    k.task_order AS "taskOrder",
    k.category,
    k.color,
    COALESCE(to_char(k.deadline, 'YYYY-MM-DD'), '') AS deadline,
    k.subtasks,
    k.updated_at AS "updatedAt"
`;

const TASK_FROM = `
    FROM tasks k
    JOIN lists l ON l.id = k.list_id
    JOIN board_columns c ON c.id = l.column_id
    JOIN tabs t ON t.id = c.tab_id
`;

// utility functions
function newID(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
}

function hashSessionID(sessionID) {
    return crypto.createHash('sha256').update(sessionID).digest('hex');
}

function pickFields(source, allowed) {
    const result = {};
    for (const key of allowed) {
        if (source[key] !== undefined) result[key] = source[key];
    }
    return result;
}

function emptyChangeSet() {
    return { tabs: [], columns: [], lists: [], tasks: [] };
}

function badRequest(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

async function derivePassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, KEY_LENGTH);
    return { salt, hash: derived.toString('hex') };
}

function buildAssignments(changes, allowed, startIndex) {
    const assignments = [];
    const values = [];
    let index = startIndex;

    for (const field of allowed) {
        if (changes[field] === undefined) continue;

        const definition = FIELD_DEFINITIONS[field];
        if (!definition) continue;

        assignments.push(`${definition.column} = $${index}${definition.cast ?? ''}`);
        values.push(definition.transform ? definition.transform(changes[field]) : changes[field]);
        index += 1;
    }

    return { assignments, values, nextIndex: index };
}

// normalization functions
async function normalizeColumns(client, tabIDs) {
    const removedColumnIDs = [];
    const renumberedIDs = [];

    for (const tabID of new Set(tabIDs)) {
        const { rows } = await client.query(
            `SELECT c.id, c.column_index,
                    EXISTS (SELECT 1 FROM lists l WHERE l.column_id = c.id) AS occupied
             FROM board_columns c
             WHERE c.tab_id = $1
             ORDER BY c.column_index`,
            [tabID]
        );

        const empty = rows.filter(row => !row.occupied).map(row => row.id);
        const keep = rows.filter(row => row.occupied);

        if (empty.length > 0) {
            await client.query('DELETE FROM board_columns WHERE id = ANY($1::text[])', [empty]);
            removedColumnIDs.push(...empty);
        }

        const moves = [];
        keep.forEach((row, index) => {
            if (row.column_index !== index) moves.push({ id: row.id, index });
        });

        if (moves.length === 0) continue;

        const moveIDs = moves.map(move => move.id);

        await client.query(
            'UPDATE board_columns SET column_index = -1 - column_index WHERE id = ANY($1::text[])',
            [moveIDs]
        );

        await client.query(
            `UPDATE board_columns AS c
             SET column_index = u.column_index
             FROM unnest($1::text[], $2::int[]) AS u(id, column_index)
             WHERE c.id = u.id`,
            [moveIDs, moves.map(move => move.index)]
        );

        renumberedIDs.push(...moveIDs);
    }

    if (renumberedIDs.length === 0) return { removedColumnIDs, updatedColumns: [] };

    const { rows: updatedColumns } = await client.query(
        `SELECT ${COLUMN_SELECT} ${COLUMN_FROM} WHERE c.id = ANY($1::text[]) ORDER BY c.column_index`,
        [renumberedIDs]
    );

    return { removedColumnIDs, updatedColumns };
}

// database classes
class Database {
    constructor() {
        this.startSessionSweep();
    }

    // bootstrap functions
    async bootstrap() {
        const existing = await queryOne('SELECT 1 AS present FROM users WHERE deleted_at IS NULL LIMIT 1');
        if (existing) return;

        const username = process.env.ADMIN_USERNAME;
        const password = process.env.ADMIN_PASSWORD;

        if (!username || !password) {
            console.warn('No active users exist and ADMIN_USERNAME / ADMIN_PASSWORD are unset. Nobody can sign in.');
            return;
        }

        if (password.length < 12) {
            throw new Error('ADMIN_PASSWORD must be at least 12 characters');
        }

        const user = await this.createUser({
            username,
            password,
            displayName: process.env.ADMIN_DISPLAY_NAME ?? username,
            role: 'admin'
        });

        console.log(`Bootstrapped admin account: ${user.username}`);
    }

    // session functions
    startSessionSweep() {
        this.sweepTimer = setInterval(async () => {
            try {
                await query('DELETE FROM sessions WHERE expires_at <= now()');
                await query(
                    `DELETE FROM audit_log WHERE created_at < now() - ($1::int * interval '1 day')`,
                    [AUDIT_RETENTION_DAYS]
                );
            } catch (error) {
                console.error('Maintenance sweep failed:', error.message);
            }
        }, SESSION_SWEEP_INTERVAL_MS);

        this.sweepTimer.unref?.();
    }

    async createSession(userID) {
        const sessionID = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

        await query(
            `INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
            [hashSessionID(sessionID), userID, expiresAt]
        );

        return sessionID;
    }

    async deleteSession(sessionID) {
        const { rowCount } = await query('DELETE FROM sessions WHERE id = $1', [hashSessionID(sessionID)]);
        return rowCount > 0;
    }

    async deleteSessionsForUser(userID) {
        await query('DELETE FROM sessions WHERE user_id = $1', [userID]);
    }

    async getUserBySession(sessionID) {
        return queryOne(
            `SELECT ${USER_SELECT}
             FROM users
             WHERE deleted_at IS NULL
               AND id = (
                 SELECT user_id FROM sessions
                 WHERE id = $1 AND expires_at > now()
             )`,
            [hashSessionID(sessionID)]
        );
    }

    // user functions
    async getUserByUsername(username) {
        return queryOne(
            `SELECT id, username, display_name AS "displayName", role,
                    cursor_color AS "cursorColor", salt, hash
             FROM users
             WHERE lower(username) = lower($1) AND deleted_at IS NULL`,
            [username]
        );
    }

    async getUserByID(userID) {
        return queryOne(`SELECT ${USER_SELECT} FROM users WHERE id = $1 AND deleted_at IS NULL`, [userID]);
    }

    toPublicUser(user) {
        return user ? pickFields(user, PUBLIC_USER_FIELDS) : null;
    }

    // administration functions
    async getAllUsers({ includeDeleted = false } = {}) {
        const { rows } = await query(
            `SELECT u.id, u.username, u.display_name AS "displayName", u.role,
                    u.cursor_color AS "cursorColor", u.created_at AS "createdAt",
                    u.deleted_at AS "deletedAt",
                    (SELECT COUNT(*)::int FROM workspaces w WHERE w.owner_id = u.id AND w.deleted_at IS NULL) AS "ownedWorkspaces",
                    (SELECT COUNT(*)::int FROM memberships m WHERE m.user_id = u.id) AS "memberships"
             FROM users u
             WHERE $1 OR u.deleted_at IS NULL
             ORDER BY u.deleted_at NULLS FIRST, u.created_at`,
            [includeDeleted]
        );
        return rows;
    }

    async getAllWorkspaces({ includeDeleted = false } = {}) {
        const { rows } = await query(
            `SELECT w.id, w.name, w.owner_id AS "ownerID", u.username AS "ownerName",
                    w.created_at AS "createdAt", w.deleted_at AS "deletedAt",
                    (SELECT COUNT(*)::int FROM memberships m WHERE m.workspace_id = w.id) AS "memberCount"
             FROM workspaces w
             LEFT JOIN users u ON u.id = w.owner_id
             WHERE $1 OR w.deleted_at IS NULL
             ORDER BY w.deleted_at NULLS FIRST, w.created_at DESC`,
            [includeDeleted]
        );
        return rows;
    }

    async countAdmins() {
        const row = await queryOne(`SELECT COUNT(*)::int AS total FROM users WHERE role = 'admin' AND deleted_at IS NULL`);
        return row?.total ?? 0;
    }

    async createUser({ username, password, displayName, role = 'member', cursorColor = '#c8502a' }) {
        const { salt, hash } = await derivePassword(password);

        try {
            return await queryOne(
                `INSERT INTO users (id, username, display_name, role, cursor_color, salt, hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 RETURNING id, username, display_name AS "displayName", role,
                           cursor_color AS "cursorColor", created_at AS "createdAt"`,
                [newID('user'), username, displayName, role, cursorColor, salt, hash]
            );
        } catch (error) {
            if (error.code === '23505') {
                const conflict = new Error('That username is already taken');
                conflict.status = 409;
                throw conflict;
            }
            throw error;
        }
    }

    async deleteUser(userID) {
        return withTransaction(async client => {
            const { rows } = await client.query(
                `UPDATE users SET deleted_at = now()
                 WHERE id = $1 AND deleted_at IS NULL
                 RETURNING deleted_at`,
                [userID]
            );

            if (rows.length === 0) return { deleted: false, workspaces: 0 };

            const { rowCount: workspaces } = await client.query(
                'UPDATE workspaces SET deleted_at = $2 WHERE owner_id = $1 AND deleted_at IS NULL',
                [userID, rows[0].deleted_at]
            );

            await client.query('DELETE FROM sessions WHERE user_id = $1', [userID]);

            return { deleted: true, workspaces };
        });
    }

    async restoreUser(userID) {
        return withTransaction(async client => {
            const target = await client.query(
                'SELECT deleted_at FROM users WHERE id = $1 AND deleted_at IS NOT NULL',
                [userID]
            );

            if (target.rowCount === 0) return { restored: false, workspaces: 0 };

            const previous = target.rows[0].deleted_at;

            try {
                await client.query('UPDATE users SET deleted_at = NULL WHERE id = $1', [userID]);
            } catch (error) {
                if (error.code === '23505') {
                    const conflict = new Error('An active user already has that username');
                    conflict.status = 409;
                    throw conflict;
                }
                throw error;
            }

            const { rowCount: workspaces } = await client.query(
                'UPDATE workspaces SET deleted_at = NULL WHERE owner_id = $1 AND deleted_at = $2',
                [userID, previous]
            );

            return { restored: true, workspaces };
        });
    }

    async purgeUser(userID) {
        const { rowCount } = await query(
            'DELETE FROM users WHERE id = $1 AND deleted_at IS NOT NULL',
            [userID]
        );
        return rowCount > 0;
    }

    async restoreWorkspace(workspaceID) {
        const { rowCount } = await query(
            'UPDATE workspaces SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
            [workspaceID]
        );
        return rowCount > 0;
    }

    async purgeWorkspace(workspaceID) {
        const { rowCount } = await query(
            'DELETE FROM workspaces WHERE id = $1 AND deleted_at IS NOT NULL',
            [workspaceID]
        );
        return rowCount > 0;
    }

    // audit functions
    async recordAudit({ actorID, actorName, action, targetType, targetID, detail, ip }) {
        try {
            await query(
                `INSERT INTO audit_log (actor_id, actor_name, action, target_type, target_id, detail, ip)
                 VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
                [
                    actorID ?? null,
                    actorName ?? null,
                    action,
                    targetType ?? null,
                    targetID ?? null,
                    JSON.stringify(detail ?? {}),
                    ip ?? null
                ]
            );
        } catch (error) {
            console.error('Audit write failed:', error.message);
        }
    }

    async getAuditLog({ limit = 100, action = null } = {}) {
        const { rows } = await query(
            `SELECT id, created_at AS "createdAt", actor_id AS "actorID", actor_name AS "actorName",
                    action, target_type AS "targetType", target_id AS "targetID", detail, ip
             FROM audit_log
             WHERE ($2::text IS NULL OR action = $2)
             ORDER BY created_at DESC, id DESC
             LIMIT $1`,
            [Math.min(limit, 500), action]
        );
        return rows;
    }

    async countRecentLoginFailures({ username, ip, minutes = 15 }) {
        const row = await queryOne(
            `SELECT
                 COUNT(*) FILTER (WHERE target_id = lower($1))::int AS "byUsername",
                 COUNT(*) FILTER (WHERE ip = $2)::int AS "byIP"
             FROM audit_log
             WHERE action = 'login.failed'
               AND created_at > now() - ($3::int * interval '1 minute')`,
            [username, ip ?? '', minutes]
        );

        return { byUsername: row?.byUsername ?? 0, byIP: row?.byIP ?? 0 };
    }

    async exportAll() {
        const [users, categories, workspaces, memberships, tabs, columns, lists, tasks] = await Promise.all([
            query(`SELECT id, username, display_name AS "displayName", role,
                          cursor_color AS "cursorColor", created_at AS "createdAt",
                          deleted_at AS "deletedAt"
                   FROM users ORDER BY created_at`),
            query('SELECT id, user_id AS "userID", name, color FROM categories ORDER BY id'),
            query(`SELECT id, name, owner_id AS "ownerID", category_id AS "categoryID",
                          created_at AS "createdAt", deleted_at AS "deletedAt"
                   FROM workspaces ORDER BY created_at`),
            query('SELECT workspace_id AS "workspaceID", user_id AS "userID", role FROM memberships ORDER BY workspace_id'),
            query(`SELECT ${TAB_SELECT} FROM tabs t ORDER BY t.workspace_id, t.tab_order`),
            query(`SELECT ${COLUMN_SELECT} ${COLUMN_FROM} ORDER BY c.tab_id, c.column_index`),
            query(`SELECT ${LIST_SELECT} ${LIST_FROM} ORDER BY l.column_id, l.list_order`),
            query(`SELECT ${TASK_SELECT} ${TASK_FROM} ORDER BY k.list_id, k.task_order`)
        ]);

        return {
            exportedAt: new Date().toISOString(),
            version: 1,
            users: users.rows,
            categories: categories.rows,
            workspaces: workspaces.rows,
            memberships: memberships.rows,
            tabs: tabs.rows,
            columns: columns.rows,
            lists: lists.rows,
            tasks: tasks.rows
        };
    }

    // category functions
    async getCategoriesForUser(userID) {
        const { rows } = await query(
            'SELECT id, user_id AS "userID", name, color FROM categories WHERE user_id = $1 ORDER BY name',
            [userID]
        );
        return rows;
    }

    async getCategory(categoryID) {
        return queryOne('SELECT id, user_id AS "userID", name, color FROM categories WHERE id = $1', [categoryID]);
    }

    async createCategory(userID, name, color) {
        return queryOne(
            `INSERT INTO categories (id, user_id, name, color)
             VALUES ($1, $2, $3, $4)
             RETURNING id, user_id AS "userID", name, color`,
            [newID('cat'), userID, name, color]
        );
    }

    async deleteCategory(categoryID) {
        const { rowCount } = await query('DELETE FROM categories WHERE id = $1', [categoryID]);
        return rowCount > 0;
    }

    // workspace functions
    async getWorkspacesForUser(userID) {
        const { rows } = await query(
            `SELECT ${WORKSPACE_SELECT},
                    m.role AS "memberRole",
                    cat.name AS "categoryName",
                    cat.color AS "categoryColor"
             FROM workspaces w
             JOIN memberships m ON m.workspace_id = w.id
             LEFT JOIN categories cat ON cat.id = w.category_id
             WHERE m.user_id = $1 AND w.deleted_at IS NULL
             ORDER BY w.created_at DESC`,
            [userID]
        );
        return rows;
    }

    async getWorkspace(workspaceID) {
        return queryOne(`SELECT ${WORKSPACE_SELECT} FROM workspaces w WHERE w.id = $1 AND w.deleted_at IS NULL`, [workspaceID]);
    }

    async createWorkspace(userID, name, categoryID) {
        return withTransaction(async client => {
            if (categoryID) {
                const { rowCount } = await client.query(
                    'SELECT 1 FROM categories WHERE id = $1 AND user_id = $2',
                    [categoryID, userID]
                );
                if (rowCount === 0) throw badRequest('That category does not exist');
            }

            const workspaceID = newID('ws');

            const { rows } = await client.query(
                `INSERT INTO workspaces (id, name, owner_id, category_id)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id, name, owner_id AS "ownerID", category_id AS "categoryID", created_at AS "createdAt"`,
                [workspaceID, name, userID, categoryID ?? null]
            );

            await client.query(
                `INSERT INTO memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
                [workspaceID, userID]
            );

            await client.query(
                `INSERT INTO tabs (id, workspace_id, name, color, tab_order)
                 VALUES ($1, $2, 'Main Board', '#6c8ebf', 0)`,
                [newID('tab'), workspaceID]
            );

            const category = categoryID
                ? (await client.query('SELECT name, color FROM categories WHERE id = $1', [categoryID])).rows[0]
                : null;

            return {
                ...rows[0],
                memberRole: 'owner',
                categoryName: category?.name ?? null,
                categoryColor: category?.color ?? null
            };
        });
    }

    async deleteWorkspace(workspaceID) {
        const { rowCount } = await query(
            'UPDATE workspaces SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
            [workspaceID]
        );
        return rowCount > 0;
    }

    // membership functions
    async isMember(workspaceID, userID) {
        const row = await queryOne(
            'SELECT 1 AS present FROM memberships WHERE workspace_id = $1 AND user_id = $2',
            [workspaceID, userID]
        );
        return row !== null;
    }

    async getMembership(workspaceID, userID) {
        return queryOne(
            `SELECT workspace_id AS "workspaceID", user_id AS "userID", role
             FROM memberships WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceID, userID]
        );
    }

    async getMembers(workspaceID) {
        const { rows } = await query(
            `SELECT u.id, u.username, u.display_name AS "displayName", u.role,
                    u.cursor_color AS "cursorColor", m.role AS "memberRole"
             FROM memberships m
             JOIN users u ON u.id = m.user_id
             WHERE m.workspace_id = $1 AND u.deleted_at IS NULL
             ORDER BY m.role = 'owner' DESC, u.display_name`,
            [workspaceID]
        );
        return rows;
    }

    async addMember(workspaceID, userID, role = 'member') {
        return queryOne(
            `INSERT INTO memberships (workspace_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
             RETURNING workspace_id AS "workspaceID", user_id AS "userID", role`,
            [workspaceID, userID, role]
        );
    }

    async removeMember(workspaceID, userID) {
        const { rowCount } = await query(
            `DELETE FROM memberships
             WHERE workspace_id = $1 AND user_id = $2
               AND user_id <> (SELECT owner_id FROM workspaces WHERE id = $1)`,
            [workspaceID, userID]
        );
        return rowCount > 0;
    }

    // board retrieval functions
    async getWorkspaceData(workspaceID) {
        const [tabs, columns, lists, tasks] = await Promise.all([
            query(`SELECT ${TAB_SELECT} FROM tabs t WHERE t.workspace_id = $1 ORDER BY t.tab_order`, [workspaceID]),
            query(`SELECT ${COLUMN_SELECT} ${COLUMN_FROM} WHERE t.workspace_id = $1 ORDER BY c.column_index`, [workspaceID]),
            query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE t.workspace_id = $1 ORDER BY l.list_order`, [workspaceID]),
            query(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE t.workspace_id = $1 ORDER BY k.task_order`, [workspaceID])
        ]);

        return {
            tabs: tabs.rows,
            columns: columns.rows,
            lists: lists.rows,
            tasks: tasks.rows
        };
    }

    // resolution functions
    async getWorkspaceIDForTab(tabID) {
        const row = await queryOne('SELECT workspace_id AS "workspaceID" FROM tabs WHERE id = $1', [tabID]);
        return row?.workspaceID ?? null;
    }

    async getWorkspaceIDForColumn(columnID) {
        const row = await queryOne(
            `SELECT t.workspace_id AS "workspaceID"
             FROM board_columns c JOIN tabs t ON t.id = c.tab_id
             WHERE c.id = $1`,
            [columnID]
        );
        return row?.workspaceID ?? null;
    }

    async getWorkspaceIDForList(listID) {
        const row = await queryOne(
            `SELECT t.workspace_id AS "workspaceID"
             FROM lists l
             JOIN board_columns c ON c.id = l.column_id
             JOIN tabs t ON t.id = c.tab_id
             WHERE l.id = $1`,
            [listID]
        );
        return row?.workspaceID ?? null;
    }

    async getWorkspaceIDForTask(taskID) {
        const row = await queryOne(
            `SELECT t.workspace_id AS "workspaceID"
             FROM tasks k
             JOIN lists l ON l.id = k.list_id
             JOIN board_columns c ON c.id = l.column_id
             JOIN tabs t ON t.id = c.tab_id
             WHERE k.id = $1`,
            [taskID]
        );
        return row?.workspaceID ?? null;
    }

    // tab functions
    async getTab(tabID) {
        return queryOne(`SELECT ${TAB_SELECT} FROM tabs t WHERE t.id = $1`, [tabID]);
    }

    async createTab(workspaceID, fields = {}) {
        return queryOne(
            `INSERT INTO tabs (id, workspace_id, name, color, tab_order)
             VALUES (
                 $1, $2,
                 COALESCE($3, 'New Board'),
                 COALESCE($4, '#6c8ebf'),
                 COALESCE($5, (SELECT COALESCE(MAX(tab_order), -1) + 1 FROM tabs WHERE workspace_id = $2))
             )
             RETURNING id, workspace_id AS "workspaceID", name, color,
                       tab_order AS "tabOrder", is_archived AS "isArchived", updated_at AS "updatedAt"`,
            [newID('tab'), workspaceID, fields.name ?? null, fields.color ?? null, fields.tabOrder ?? null]
        );
    }

    async updateTab(tabID, changes) {
        const { assignments, values, nextIndex } = buildAssignments(changes, TAB_FIELDS, 1);
        if (assignments.length === 0) return this.getTab(tabID);

        return queryOne(
            `UPDATE tabs SET ${assignments.join(', ')}, updated_at = now()
             WHERE id = $${nextIndex}
             RETURNING id, workspace_id AS "workspaceID", name, color,
                       tab_order AS "tabOrder", is_archived AS "isArchived", updated_at AS "updatedAt"`,
            [...values, tabID]
        );
    }

    async deleteTab(tabID) {
        return withTransaction(async client => {
            const removed = emptyChangeSet();

            const { rows } = await client.query(
                `SELECT c.id AS column_id, l.id AS list_id, k.id AS task_id
                 FROM board_columns c
                 LEFT JOIN lists l ON l.column_id = c.id
                 LEFT JOIN tasks k ON k.list_id = l.id
                 WHERE c.tab_id = $1`,
                [tabID]
            );

            const columnIDs = new Set();
            const listIDs = new Set();

            for (const row of rows) {
                if (row.column_id) columnIDs.add(row.column_id);
                if (row.list_id) listIDs.add(row.list_id);
                if (row.task_id) removed.tasks.push(row.task_id);
            }

            const { rowCount } = await client.query('DELETE FROM tabs WHERE id = $1', [tabID]);
            if (rowCount === 0) return emptyChangeSet();

            removed.columns = Array.from(columnIDs);
            removed.lists = Array.from(listIDs);
            removed.tabs.push(tabID);

            return removed;
        });
    }

    // column functions
    async getColumn(columnID) {
        return queryOne(`SELECT ${COLUMN_SELECT} ${COLUMN_FROM} WHERE c.id = $1`, [columnID]);
    }

    async getColumnByIndex(tabID, columnIndex) {
        return queryOne(
            `SELECT ${COLUMN_SELECT} ${COLUMN_FROM} WHERE c.tab_id = $1 AND c.column_index = $2`,
            [tabID, columnIndex]
        );
    }

    async createColumn(tabID, columnIndex) {
        const created = await queryOne(
            `INSERT INTO board_columns (id, tab_id, column_index)
             VALUES ($1, $2, LEAST($3, (SELECT COUNT(*) FROM board_columns WHERE tab_id = $2)))
             ON CONFLICT (tab_id, column_index) DO NOTHING
             RETURNING id`,
            [newID('col'), tabID, columnIndex]
        );

        if (created) return this.getColumn(created.id);

        return this.getColumnByIndex(tabID, columnIndex);
    }

    async deleteColumn(columnID) {
        return withTransaction(async client => {
            const removed = emptyChangeSet();

            const scope = await client.query('SELECT tab_id AS "tabID" FROM board_columns WHERE id = $1', [columnID]);
            if (scope.rowCount === 0) return { removed, columns: [] };

            const { rows } = await client.query(
                `SELECT l.id AS list_id, k.id AS task_id
                 FROM lists l
                 LEFT JOIN tasks k ON k.list_id = l.id
                 WHERE l.column_id = $1`,
                [columnID]
            );

            const listIDs = new Set();

            for (const row of rows) {
                if (row.list_id) listIDs.add(row.list_id);
                if (row.task_id) removed.tasks.push(row.task_id);
            }

            await client.query('DELETE FROM board_columns WHERE id = $1', [columnID]);

            removed.lists = Array.from(listIDs);
            removed.columns.push(columnID);

            const { removedColumnIDs, updatedColumns } = await normalizeColumns(client, [scope.rows[0].tabID]);
            removed.columns.push(...removedColumnIDs);

            return { removed, columns: updatedColumns };
        });
    }

    // list functions
    async getList(listID) {
        return queryOne(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.id = $1`, [listID]);
    }

    async createList(columnID, fields = {}) {
        const created = await queryOne(
            `INSERT INTO lists (id, column_id, name, list_order, category, color)
             VALUES (
                 $1, $2,
                 COALESCE($3, 'New list'),
                 COALESCE($4, (SELECT COALESCE(MAX(list_order), -1) + 1 FROM lists WHERE column_id = $2)),
                 $5, $6
             )
             RETURNING id`,
            [newID('list'), columnID, fields.name ?? null, fields.listOrder ?? null, fields.category ?? null, fields.color ?? null]
        );

        return created ? this.getList(created.id) : null;
    }

    async updateList(listID, changes) {
        const { assignments, values, nextIndex } = buildAssignments(changes, LIST_FIELDS, 1);
        if (assignments.length === 0) return this.getList(listID);

        const updated = await queryOne(
            `UPDATE lists SET ${assignments.join(', ')}, updated_at = now()
             WHERE id = $${nextIndex}
             RETURNING id`,
            [...values, listID]
        );

        return updated ? this.getList(updated.id) : null;
    }

    async deleteList(listID) {
        return withTransaction(async client => {
            const removed = emptyChangeSet();

            const scope = await client.query(
                `SELECT c.tab_id AS "tabID"
                 FROM lists l JOIN board_columns c ON c.id = l.column_id
                 WHERE l.id = $1`,
                [listID]
            );

            if (scope.rowCount === 0) return { removed, columns: [] };

            const { rows } = await client.query('SELECT id FROM tasks WHERE list_id = $1', [listID]);

            const { rowCount } = await client.query('DELETE FROM lists WHERE id = $1', [listID]);
            if (rowCount === 0) return { removed, columns: [] };

            removed.tasks = rows.map(row => row.id);
            removed.lists.push(listID);

            const { removedColumnIDs, updatedColumns } = await normalizeColumns(client, [scope.rows[0].tabID]);
            removed.columns = removedColumnIDs;

            return { removed, columns: updatedColumns };
        });
    }

    async reorderLists(updates) {
        const empty = { lists: [], columns: [], removed: emptyChangeSet() };
        if (!updates || updates.length === 0) return empty;

        const ids = updates.map(update => update.id);
        const columnIDs = updates.map(update => update.columnID);
        const orders = updates.map(update => update.listOrder);

        return withTransaction(async client => {
            const { rows: tabRows } = await client.query(
                `SELECT DISTINCT c.tab_id AS "tabID"
                 FROM board_columns c
                 WHERE c.id = ANY($1::text[])
                    OR c.id IN (SELECT column_id FROM lists WHERE id = ANY($2::text[]))`,
                [columnIDs, ids]
            );

            const { rows: touched } = await client.query(
                `UPDATE lists AS l
                 SET column_id = u.column_id, list_order = u.list_order, updated_at = now()
                 FROM unnest($1::text[], $2::text[], $3::int[]) AS u(id, column_id, list_order)
                 WHERE l.id = u.id
                 RETURNING l.id`,
                [ids, columnIDs, orders]
            );

            if (touched.length === 0) return empty;

            const { removedColumnIDs, updatedColumns } = await normalizeColumns(
                client,
                tabRows.map(row => row.tabID)
            );

            const { rows: lists } = await client.query(
                `SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.id = ANY($1::text[]) ORDER BY l.list_order`,
                [touched.map(row => row.id)]
            );

            const removed = emptyChangeSet();
            removed.columns = removedColumnIDs;

            return { lists, columns: updatedColumns, removed };
        });
    }

    // task functions
    async getTask(taskID) {
        return queryOne(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE k.id = $1`, [taskID]);
    }

    async createTask(listID, fields = {}) {
        const created = await queryOne(
            `INSERT INTO tasks (id, list_id, title, description, task_order, category, color)
             VALUES (
                 $1, $2,
                 COALESCE($3, ''),
                 COALESCE($4, ''),
                 COALESCE($5, (SELECT COALESCE(MAX(task_order), -1) + 1 FROM tasks WHERE list_id = $2)),
                 $6, $7
             )
             RETURNING id`,
            [newID('task'), listID, fields.title ?? null, fields.description ?? null,
             fields.taskOrder ?? null, fields.category ?? null, fields.color ?? null]
        );

        return created ? this.getTask(created.id) : null;
    }

    async updateTask(taskID, changes, expectedUpdatedAt) {
        const applied = pickFields(changes, TASK_FIELDS);
        const { assignments, values, nextIndex } = buildAssignments(applied, TASK_FIELDS, 1);

        if (assignments.length === 0) {
            const record = await this.getTask(taskID);
            return record ? { record } : { error: 'Task not found', status: 404 };
        }

        const conditions = [`id = $${nextIndex}`];
        const params = [...values, taskID];

        if (expectedUpdatedAt !== undefined) {
            conditions.push(`updated_at = $${nextIndex + 1}::timestamptz`);
            params.push(expectedUpdatedAt);
        }

        const updated = await queryOne(
            `UPDATE tasks SET ${assignments.join(', ')}, updated_at = now()
             WHERE ${conditions.join(' AND ')}
             RETURNING id`,
            params
        );

        if (updated) return { record: await this.getTask(updated.id) };

        const current = await this.getTask(taskID);
        if (!current) return { error: 'Task not found', status: 404 };

        return { error: 'This task was changed by someone else', status: 409, record: current };
    }

    async deleteTask(taskID) {
        const removed = emptyChangeSet();
        const { rowCount } = await query('DELETE FROM tasks WHERE id = $1', [taskID]);
        if (rowCount > 0) removed.tasks.push(taskID);
        return removed;
    }

    async reorderTasks(updates) {
        if (!updates || updates.length === 0) return [];

        const ids = updates.map(update => update.id);
        const listIDs = updates.map(update => update.listID);
        const orders = updates.map(update => update.taskOrder);

        const { rows } = await query(
            `UPDATE tasks AS k
             SET list_id = u.list_id, task_order = u.task_order, updated_at = now()
             FROM unnest($1::text[], $2::text[], $3::int[]) AS u(id, list_id, task_order)
             WHERE k.id = u.id
             RETURNING k.id`,
            [ids, listIDs, orders]
        );

        if (rows.length === 0) return [];

        const { rows: records } = await query(
            `SELECT ${TASK_SELECT} ${TASK_FROM} WHERE k.id = ANY($1::text[]) ORDER BY k.task_order`,
            [rows.map(row => row.id)]
        );

        return records;
    }
}

export default new Database();
