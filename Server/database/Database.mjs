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
const MAX_PAGES_PER_WORKSPACE = 500;
const MAX_GROUPS_PER_WORKSPACE = 100;

export const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const TAB_FIELDS = ['name', 'color', 'tabOrder', 'isArchived', 'groupID'];
const TAB_GROUP_FIELDS = ['name', 'color'];
const LIST_FIELDS = ['name', 'columnID', 'listOrder'];
const TASK_FIELDS = ['title', 'description', 'isCompleted', 'listID', 'taskOrder', 'deadline', 'checklists'];
const NOTATION_GROUP_FIELDS = ['name', 'color', 'groupOrder'];
const NOTATION_PAGE_FIELDS = ['title', 'groupID', 'pageOrder', 'layout'];
const PUBLIC_USER_FIELDS = ['id', 'username', 'displayName', 'role', 'cursorColor', 'theme'];

const FIELD_DEFINITIONS = {
    name: { column: 'name' },
    color: { column: 'color' },
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
    checklists: { column: 'checklists', cast: '::jsonb', transform: value => JSON.stringify(value ?? []) },
    groupID: { column: 'group_id' },
    groupOrder: { column: 'group_order' },
    pageOrder: { column: 'page_order' },
    layout: { column: 'layout' }
};

// projection constants
const USER_SELECT = `
    id,
    username,
    display_name AS "displayName",
    role,
    cursor_color AS "cursorColor",
    theme
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
    t.group_id AS "groupID",
    t.name,
    t.color,
    t.tab_order AS "tabOrder",
    t.is_archived AS "isArchived",
    t.updated_at AS "updatedAt"
`;

const MEETING_SELECT = `
    mt.id,
    mt.workspace_id AS "workspaceID",
    mt.title,
    mt.description,
    to_char(mt.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
    to_char(mt.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
    mt.created_by AS "createdBy",
    mt.updated_at AS "updatedAt"
`;

const TAG_SELECT = `
    tg.id,
    tg.workspace_id AS "workspaceID",
    tg.tab_id AS "tabID",
    tg.group_id AS "groupID",
    tg.name,
    tg.color
`;

const TAB_GROUP_SELECT = `
    g.id,
    g.workspace_id AS "workspaceID",
    g.name,
    g.color,
    g.updated_at AS "updatedAt"
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
    l.updated_at AS "updatedAt",
    COALESCE((
        SELECT array_agg(lt.tag_id ORDER BY lt.tag_id)
        FROM list_tags lt WHERE lt.list_id = l.id
    ), '{}') AS "tagIDs"
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
    COALESCE(to_char(k.deadline, 'YYYY-MM-DD'), '') AS deadline,
    k.checklists,
    k.updated_at AS "updatedAt",
    COALESCE((
        SELECT array_agg(a.user_id ORDER BY a.user_id)
        FROM task_assignees a WHERE a.task_id = k.id
    ), '{}') AS "assignedUsers",
    COALESCE((
        SELECT array_agg(tt.tag_id ORDER BY tt.tag_id)
        FROM task_tags tt WHERE tt.task_id = k.id
    ), '{}') AS "tagIDs"
`;

const TASK_FROM = `
    FROM tasks k
    JOIN lists l ON l.id = k.list_id
    JOIN board_columns c ON c.id = l.column_id
    JOIN tabs t ON t.id = c.tab_id
`;

const NOTATION_GROUP_SELECT = `
    g.id,
    g.workspace_id AS "workspaceID",
    g.name,
    g.color,
    g.group_order AS "groupOrder",
    g.updated_at AS "updatedAt"
`;

const NOTATION_PAGE_SELECT = `
    p.id,
    p.workspace_id AS "workspaceID",
    p.group_id AS "groupID",
    p.title,
    p.layout,
    p.page_order AS "pageOrder",
    p.updated_at AS "updatedAt"
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
    return { tabs: [], tabGroups: [], columns: [], lists: [], tasks: [], tags: [] };
}

function emptyNotationChangeSet() {
    return { groups: [], pages: [] };
}

function badRequest(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

async function derivePassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
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

async function repointTagLinks(client, fromTagID, toTagID) {
    await client.query(
        `INSERT INTO list_tags (list_id, tag_id)
         SELECT list_id, $2 FROM list_tags WHERE tag_id = $1
         ON CONFLICT DO NOTHING`,
        [fromTagID, toTagID]
    );

    await client.query(
        `INSERT INTO task_tags (task_id, tag_id)
         SELECT task_id, $2 FROM task_tags WHERE tag_id = $1
         ON CONFLICT DO NOTHING`,
        [fromTagID, toTagID]
    );
}

async function repointTagLinksForTab(client, fromTagID, toTagID, tabID) {
    await client.query(
        `INSERT INTO list_tags (list_id, tag_id)
         SELECT lt.list_id, $2
         FROM list_tags lt
         JOIN lists l ON l.id = lt.list_id
         JOIN board_columns c ON c.id = l.column_id
         WHERE lt.tag_id = $1 AND c.tab_id = $3
         ON CONFLICT DO NOTHING`,
        [fromTagID, toTagID, tabID]
    );

    await client.query(
        `INSERT INTO task_tags (task_id, tag_id)
         SELECT kt.task_id, $2
         FROM task_tags kt
         JOIN tasks k ON k.id = kt.task_id
         JOIN lists l ON l.id = k.list_id
         JOIN board_columns c ON c.id = l.column_id
         WHERE kt.tag_id = $1 AND c.tab_id = $3
         ON CONFLICT DO NOTHING`,
        [fromTagID, toTagID, tabID]
    );
}

async function collectTagTargets(client, tagIDs) {
    if (tagIDs.length === 0) return { listIDs: [], taskIDs: [] };

    const lists = await client.query('SELECT DISTINCT list_id FROM list_tags WHERE tag_id = ANY($1::text[])', [tagIDs]);
    const tasks = await client.query('SELECT DISTINCT task_id FROM task_tags WHERE tag_id = ANY($1::text[])', [tagIDs]);

    return {
        listIDs: lists.rows.map(row => row.list_id),
        taskIDs: tasks.rows.map(row => row.task_id)
    };
}

async function hydrateTagTargets(client, listIDs, taskIDs) {
    const lists = listIDs.length > 0
        ? (await client.query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.id = ANY($1::text[])`, [listIDs])).rows
        : [];

    const tasks = taskIDs.length > 0
        ? (await client.query(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE k.id = ANY($1::text[])`, [taskIDs])).rows
        : [];

    return { lists, tasks };
}

async function combineTabTagsIntoGroup(client, tabIDs, groupID) {
    const result = { tags: [], removedTagIDs: [], listIDs: [], taskIDs: [] };
    if (tabIDs.length === 0 || !groupID) return result;

    const { rows: candidates } = await client.query(
        `SELECT ${TAG_SELECT} FROM tags tg WHERE tg.tab_id = ANY($1::text[]) ORDER BY tg.id`,
        [tabIDs]
    );

    if (candidates.length === 0) return result;

    const { rows: existing } = await client.query(
        `SELECT ${TAG_SELECT} FROM tags tg WHERE tg.group_id = $1`,
        [groupID]
    );

    const byName = new Map();
    for (const tag of existing) {
        if (tag.name !== '') byName.set(tag.name.toLowerCase(), tag.id);
    }

    const touched = await collectTagTargets(client, candidates.map(tag => tag.id));
    result.listIDs = touched.listIDs;
    result.taskIDs = touched.taskIDs;

    for (const candidate of candidates) {
        const key = candidate.name === '' ? null : candidate.name.toLowerCase();
        const survivor = key ? byName.get(key) : undefined;

        if (survivor) {
            await repointTagLinks(client, candidate.id, survivor);
            await client.query('DELETE FROM tags WHERE id = $1', [candidate.id]);
            result.removedTagIDs.push(candidate.id);
            continue;
        }

        const { rows } = await client.query(
            `UPDATE tags SET tab_id = NULL, group_id = $2 WHERE id = $1
             RETURNING id, workspace_id AS "workspaceID", tab_id AS "tabID",
                       group_id AS "groupID", name, color`,
            [candidate.id, groupID]
        );

        if (rows[0]) result.tags.push(rows[0]);
        if (key) byName.set(key, candidate.id);
    }

    const survivors = await client.query(
        `SELECT ${TAG_SELECT} FROM tags tg WHERE tg.group_id = $1`,
        [groupID]
    );

    result.tags = survivors.rows;

    return result;
}

async function splitGroupTagsToTabs(client, groupID, tabIDs) {
    const result = { tags: [], removedTagIDs: [], listIDs: [], taskIDs: [] };
    if (!groupID) return result;

    const { rows: groupTags } = await client.query(
        `SELECT ${TAG_SELECT} FROM tags tg WHERE tg.group_id = $1 ORDER BY tg.id`,
        [groupID]
    );

    if (groupTags.length === 0) return result;

    const touched = await collectTagTargets(client, groupTags.map(tag => tag.id));
    result.listIDs = touched.listIDs;
    result.taskIDs = touched.taskIDs;

    for (const groupTag of groupTags) {
        for (const tabID of tabIDs) {
            let targetID = null;

            if (groupTag.name !== '') {
                const { rows } = await client.query(
                    'SELECT id FROM tags WHERE tab_id = $1 AND lower(name) = lower($2)',
                    [tabID, groupTag.name]
                );

                targetID = rows[0]?.id ?? null;
            }

            if (!targetID) {
                const { rows } = await client.query(
                    `INSERT INTO tags (id, workspace_id, tab_id, name, color)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING id, workspace_id AS "workspaceID", tab_id AS "tabID",
                               group_id AS "groupID", name, color`,
                    [newID('tag'), groupTag.workspaceID, tabID, groupTag.name, groupTag.color]
                );

                targetID = rows[0].id;
                result.tags.push(rows[0]);
            }

            await repointTagLinksForTab(client, groupTag.id, targetID, tabID);
        }

        await client.query('DELETE FROM tags WHERE id = $1', [groupTag.id]);
        result.removedTagIDs.push(groupTag.id);
    }

    return result;
}

async function normalizeTabs(client, workspaceIDs) {
    const removedGroupIDs = [];
    const touched = [];

    for (const workspaceID of new Set(workspaceIDs)) {
        if (!workspaceID) continue;

        const { rows } = await client.query(
            'SELECT id, group_id, tab_order FROM tabs WHERE workspace_id = $1 ORDER BY tab_order, id',
            [workspaceID]
        );

        const byGroup = new Map();

        for (const row of rows) {
            if (!row.group_id) continue;
            if (!byGroup.has(row.group_id)) byGroup.set(row.group_id, []);
            byGroup.get(row.group_id).push(row);
        }

        const ordered = [];
        const emitted = new Set();

        for (const row of rows) {
            if (!row.group_id) {
                ordered.push(row);
                continue;
            }

            if (emitted.has(row.group_id)) continue;

            emitted.add(row.group_id);
            ordered.push(...byGroup.get(row.group_id));
        }

        const moves = [];
        ordered.forEach((row, index) => {
            if (row.tab_order !== index) moves.push({ id: row.id, index });
        });

        if (moves.length > 0) {
            await client.query(
                `UPDATE tabs AS t
                 SET tab_order = u.tab_order
                 FROM unnest($1::text[], $2::int[]) AS u(id, tab_order)
                 WHERE t.id = u.id`,
                [moves.map(move => move.id), moves.map(move => move.index)]
            );
        }

        const { rows: empty } = await client.query(
            `SELECT g.id FROM tab_groups g
             WHERE g.workspace_id = $1
               AND NOT EXISTS (SELECT 1 FROM tabs t WHERE t.group_id = g.id)`,
            [workspaceID]
        );

        if (empty.length > 0) {
            await client.query(
                'DELETE FROM tab_groups WHERE id = ANY($1::text[])',
                [empty.map(row => row.id)]
            );

            removedGroupIDs.push(...empty.map(row => row.id));
        }

        touched.push(workspaceID);
    }

    if (touched.length === 0) return { removedGroupIDs, tabs: [] };

    const { rows: tabs } = await client.query(
        `SELECT ${TAB_SELECT} FROM tabs t WHERE t.workspace_id = ANY($1::text[]) ORDER BY t.tab_order`,
        [touched]
    );

    return { removedGroupIDs, tabs };
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

    async updateProfile(userID, changes) {
        const assignments = [];
        const values = [];

        if (changes.displayName !== undefined) {
            assignments.push(`display_name = $${assignments.length + 1}`);
            values.push(changes.displayName);
        }

        if (changes.cursorColor !== undefined) {
            assignments.push(`cursor_color = $${assignments.length + 1}`);
            values.push(changes.cursorColor);
        }

        if (changes.theme !== undefined) {
            assignments.push(`theme = $${assignments.length + 1}::jsonb`);
            values.push(JSON.stringify(changes.theme));
        }

        if (assignments.length === 0) return this.getUserByID(userID);

        return queryOne(
            `UPDATE users SET ${assignments.join(', ')}
             WHERE id = $${values.length + 1} AND deleted_at IS NULL
             RETURNING ${USER_SELECT}`,
            [...values, userID]
        );
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

    async getCredentials(userID) {
        return queryOne(
            'SELECT salt, hash FROM users WHERE id = $1 AND deleted_at IS NULL',
            [userID]
        );
    }

    async setUserPassword(userID, password) {
        const { salt, hash } = await derivePassword(password);

        const { rowCount } = await query(
            'UPDATE users SET salt = $2, hash = $3 WHERE id = $1 AND deleted_at IS NULL',
            [userID, salt, hash]
        );

        return rowCount > 0;
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
        const [
            users,
            categories,
            workspaces,
            memberships,
            tabs,
            columns,
            lists,
            tasks,
            tags,
            notationGroups,
            notationPages
        ] = await Promise.all([
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
            query(`SELECT ${TASK_SELECT} ${TASK_FROM} ORDER BY k.list_id, k.task_order`),
            query(`SELECT ${TAG_SELECT} FROM tags tg ORDER BY tg.workspace_id, tg.name`),
            query(`SELECT ${NOTATION_GROUP_SELECT} FROM notation_groups g ORDER BY g.workspace_id, g.group_order`),
            query(`SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p ORDER BY p.workspace_id, p.page_order`)
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
            tasks: tasks.rows,
            tags: tags.rows,
            notationGroups: notationGroups.rows,
            notationPages: notationPages.rows
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
    // calendar functions
    async getCalendarRange(workspaceID, fromISO, toISO) {
        const [slots, meetings] = await Promise.all([
            query(
                `SELECT to_char(a.slot_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "slotStart",
                        array_agg(a.user_id ORDER BY a.user_id) AS "userIDs"
                 FROM availability_slots a
                 WHERE a.workspace_id = $1 AND a.slot_start >= $2 AND a.slot_start < $3
                 GROUP BY a.slot_start
                 ORDER BY a.slot_start`,
                [workspaceID, fromISO, toISO]
            ),
            query(
                `SELECT ${MEETING_SELECT}
                 FROM meetings mt
                 WHERE mt.workspace_id = $1 AND mt.starts_at < $3 AND mt.ends_at > $2
                 ORDER BY mt.starts_at`,
                [workspaceID, fromISO, toISO]
            )
        ]);

        return { slots: slots.rows, meetings: meetings.rows };
    }

    async setAvailability(workspaceID, userID, added, removed) {
        return withTransaction(async client => {
            if (removed.length > 0) {
                await client.query(
                    `DELETE FROM availability_slots
                     WHERE workspace_id = $1 AND user_id = $2 AND slot_start = ANY($3::timestamptz[])`,
                    [workspaceID, userID, removed]
                );
            }

            if (added.length > 0) {
                await client.query(
                    `INSERT INTO availability_slots (workspace_id, user_id, slot_start)
                     SELECT $1, $2, unnest($3::timestamptz[])
                     ON CONFLICT DO NOTHING`,
                    [workspaceID, userID, added]
                );
            }

            const touched = [...added, ...removed];

            if (touched.length === 0) return { slots: [], cleared: [] };

            const { rows } = await client.query(
                `SELECT to_char(a.slot_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "slotStart",
                        array_agg(a.user_id ORDER BY a.user_id) AS "userIDs"
                 FROM availability_slots a
                 WHERE a.workspace_id = $1 AND a.slot_start = ANY($2::timestamptz[])
                 GROUP BY a.slot_start`,
                [workspaceID, touched]
            );

            const present = new Set(rows.map(row => row.slotStart));
            const cleared = touched
                .map(iso => new Date(iso).toISOString())
                .filter(iso => !present.has(iso));

            return { slots: rows, cleared: [...new Set(cleared)] };
        });
    }

    async getMeeting(meetingID) {
        return queryOne(`SELECT ${MEETING_SELECT} FROM meetings mt WHERE mt.id = $1`, [meetingID]);
    }

    async getWorkspaceIDForMeeting(meetingID) {
        const row = await queryOne('SELECT workspace_id AS "workspaceID" FROM meetings WHERE id = $1', [meetingID]);
        return row?.workspaceID ?? null;
    }

    async createMeeting(workspaceID, userID, fields) {
        return queryOne(
            `INSERT INTO meetings (id, workspace_id, title, description, starts_at, ends_at, created_by)
             VALUES ($1, $2, COALESCE($3, 'Meeting'), COALESCE($4, ''), $5, $6, $7)
             RETURNING id, workspace_id AS "workspaceID", title, description,
                       to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
                       to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
                       created_by AS "createdBy",
                       updated_at AS "updatedAt"`,
            [newID('meeting'), workspaceID, fields.title ?? null, fields.description ?? null,
             fields.startsAt, fields.endsAt, userID]
        );
    }

    async updateMeeting(meetingID, changes) {
        const assignments = [];
        const values = [];

        for (const [field, column] of [['title', 'title'], ['description', 'description'],
                                       ['startsAt', 'starts_at'], ['endsAt', 'ends_at']]) {
            if (changes[field] === undefined) continue;
            assignments.push(`${column} = $${assignments.length + 1}`);
            values.push(changes[field]);
        }

        if (assignments.length === 0) return this.getMeeting(meetingID);

        return queryOne(
            `UPDATE meetings SET ${assignments.join(', ')}, updated_at = now()
             WHERE id = $${values.length + 1}
             RETURNING id, workspace_id AS "workspaceID", title, description,
                       to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
                       to_char(ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
                       created_by AS "createdBy",
                       updated_at AS "updatedAt"`,
            [...values, meetingID]
        );
    }

    async deleteMeeting(meetingID) {
        const { rowCount } = await query('DELETE FROM meetings WHERE id = $1', [meetingID]);
        return rowCount > 0;
    }

    async getUpcomingMeetings(userID, days, limit) {
        const { rows } = await query(
            `SELECT mt.id,
                    mt.title,
                    to_char(mt.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
                    to_char(mt.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
                    w.id AS "workspaceID",
                    w.name AS "workspaceName"
             FROM meetings mt
             JOIN workspaces w ON w.id = mt.workspace_id
             JOIN memberships m ON m.workspace_id = w.id AND m.user_id = $1
             WHERE w.deleted_at IS NULL
               AND mt.ends_at >= now()
               AND mt.starts_at < now() + ($2::int * INTERVAL '1 day')
             ORDER BY mt.starts_at
             LIMIT $3`,
            [userID, days, limit]
        );

        return rows;
    }

    async getUpcomingDeadlines(userID, days, limit) {
        const { rows } = await query(
            `SELECT k.id,
                    k.title,
                    to_char(k.deadline, 'YYYY-MM-DD') AS deadline,
                    (k.deadline - CURRENT_DATE)::int AS "daysRemaining",
                    w.id AS "workspaceID",
                    w.name AS "workspaceName",
                    t.id AS "tabID",
                    t.name AS "tabName",
                    t.color AS "tabColor",
                    EXISTS (
                        SELECT 1 FROM task_assignees ta
                        WHERE ta.task_id = k.id AND ta.user_id = $1
                    ) AS "isMine"
             FROM tasks k
             JOIN lists l ON l.id = k.list_id
             JOIN board_columns c ON c.id = l.column_id
             JOIN tabs t ON t.id = c.tab_id
             JOIN workspaces w ON w.id = t.workspace_id
             JOIN memberships m ON m.workspace_id = w.id AND m.user_id = $1
             WHERE k.deadline IS NOT NULL
               AND k.is_completed = false
               AND t.is_archived = false
               AND w.deleted_at IS NULL
               AND k.deadline <= CURRENT_DATE + $2::int
             ORDER BY k.deadline, w.name, k.title
             LIMIT $3`,
            [userID, days, limit]
        );

        return rows;
    }

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

            await client.query(
                `INSERT INTO notation_pages (id, workspace_id, title, page_order)
                 VALUES ($1, $2, 'Untitled', 0)`,
                [newID('page'), workspaceID]
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

    async isActiveMember(workspaceID, userID) {
        const row = await queryOne(
            `SELECT 1 AS present
             FROM memberships m
             JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
             JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
             WHERE m.workspace_id = $1 AND m.user_id = $2`,
            [workspaceID, userID]
        );
        return row !== null;
    }

    async getActiveMemberships(workspaceIDs, userIDs) {
        if (workspaceIDs.length === 0) return [];

        const { rows } = await query(
            `SELECT m.workspace_id AS "workspaceID", m.user_id AS "userID"
             FROM memberships m
             JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
             JOIN users u ON u.id = m.user_id AND u.deleted_at IS NULL
             JOIN unnest($1::text[], $2::text[]) AS pair(workspace_id, user_id)
               ON pair.workspace_id = m.workspace_id AND pair.user_id = m.user_id`,
            [workspaceIDs, userIDs]
        );
        return rows;
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
            `SELECT u.id, u.display_name AS "displayName",
                    u.cursor_color AS "cursorColor", m.role AS "memberRole"
             FROM memberships m
             JOIN users u ON u.id = m.user_id
             WHERE m.workspace_id = $1 AND u.deleted_at IS NULL
             ORDER BY m.role = 'owner' DESC, u.display_name`,
            [workspaceID]
        );
        return rows;
    }

    async getUsersForWorkspace(workspaceID) {
        const { rows } = await query(
            `SELECT u.id, u.display_name AS "displayName",
                    u.cursor_color AS "cursorColor", m.role AS "memberRole"
             FROM users u
             LEFT JOIN memberships m ON m.user_id = u.id AND m.workspace_id = $1
             WHERE u.deleted_at IS NULL
             ORDER BY u.display_name`,
            [workspaceID]
        );
        return rows;
    }

    async setMemberRole(workspaceID, userID, role) {
        const owner = await queryOne(
            'SELECT owner_id AS "ownerID" FROM workspaces WHERE id = $1',
            [workspaceID]
        );

        if (owner?.ownerID === userID) {
            const error = new Error('The workspace owner\'s access cannot be changed');
            error.status = 400;
            throw error;
        }

        return this.addMember(workspaceID, userID, role);
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
        const [tabs, tabGroups, columns, lists, tasks, tags] = await Promise.all([
            query(`SELECT ${TAB_SELECT} FROM tabs t WHERE t.workspace_id = $1 ORDER BY t.tab_order`, [workspaceID]),
            query(`SELECT ${TAB_GROUP_SELECT} FROM tab_groups g WHERE g.workspace_id = $1 ORDER BY g.id`, [workspaceID]),
            query(`SELECT ${COLUMN_SELECT} ${COLUMN_FROM} WHERE t.workspace_id = $1 ORDER BY c.column_index`, [workspaceID]),
            query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE t.workspace_id = $1 ORDER BY l.list_order`, [workspaceID]),
            query(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE t.workspace_id = $1 ORDER BY k.task_order`, [workspaceID]),
            query(`SELECT ${TAG_SELECT} FROM tags tg WHERE tg.workspace_id = $1 ORDER BY tg.name`, [workspaceID])
        ]);

        return {
            tabs: tabs.rows,
            tabGroups: tabGroups.rows,
            columns: columns.rows,
            lists: lists.rows,
            tasks: tasks.rows,
            tags: tags.rows
        };
    }

    // resolution functions
    async getWorkspaceScopeForTabs(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT t.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT t.id)::int AS found
             FROM tabs t
             WHERE t.id = ANY($1::text[])`,
            ids
        );
    }

    async getWorkspaceScopeForTabGroups(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT g.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT g.id)::int AS found
             FROM tab_groups g
             WHERE g.id = ANY($1::text[])`,
            ids
        );
    }

    async getWorkspaceScopeForLists(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT t.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT l.id)::int AS found
             FROM lists l
             JOIN board_columns c ON c.id = l.column_id
             JOIN tabs t ON t.id = c.tab_id
             WHERE l.id = ANY($1::text[])`,
            ids
        );
    }

    async getWorkspaceScopeForColumns(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT t.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT c.id)::int AS found
             FROM board_columns c
             JOIN tabs t ON t.id = c.tab_id
             WHERE c.id = ANY($1::text[])`,
            ids
        );
    }

    async getWorkspaceScopeForTasks(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT t.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT k.id)::int AS found
             FROM tasks k
             JOIN lists l ON l.id = k.list_id
             JOIN board_columns c ON c.id = l.column_id
             JOIN tabs t ON t.id = c.tab_id
             WHERE k.id = ANY($1::text[])`,
            ids
        );
    }

    async resolveScope(sql, ids) {
        const row = await queryOne(sql, [ids]);
        return { workspaceIDs: row?.workspaces ?? [], found: row?.found ?? 0 };
    }

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

    // tag functions
    async getTags(workspaceID) {
        const { rows } = await query(
            `SELECT ${TAG_SELECT} FROM tags tg WHERE tg.workspace_id = $1 ORDER BY tg.name`,
            [workspaceID]
        );
        return rows;
    }

    async getWorkspaceIDForTag(tagID) {
        const row = await queryOne('SELECT workspace_id AS "workspaceID" FROM tags WHERE id = $1', [tagID]);
        return row?.workspaceID ?? null;
    }

    async createTag(workspaceID, name, color, scope = {}) {
        try {
            return await queryOne(
                `INSERT INTO tags (id, workspace_id, tab_id, group_id, name, color)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, workspace_id AS "workspaceID", tab_id AS "tabID",
                           group_id AS "groupID", name, color`,
                [newID('tag'), workspaceID, scope.tabID ?? null, scope.groupID ?? null, name, color]
            );
        } catch (error) {
            if (error.code === '23505') {
                const conflict = new Error('A tag with that name already exists');
                conflict.status = 409;
                throw conflict;
            }
            throw error;
        }
    }

    async updateTag(tagID, changes) {
        const assignments = [];
        const values = [];

        if (changes.name !== undefined) {
            assignments.push(`name = $${assignments.length + 1}`);
            values.push(changes.name);
        }

        if (changes.color !== undefined) {
            assignments.push(`color = $${assignments.length + 1}`);
            values.push(changes.color);
        }

        if (changes.scope !== undefined) {
            assignments.push(`tab_id = $${assignments.length + 1}`);
            values.push(changes.scope.tabID ?? null);
            assignments.push(`group_id = $${assignments.length + 1}`);
            values.push(changes.scope.groupID ?? null);
        }

        if (assignments.length === 0) {
            return queryOne(`SELECT ${TAG_SELECT} FROM tags tg WHERE tg.id = $1`, [tagID]);
        }

        try {
            return await queryOne(
                `UPDATE tags SET ${assignments.join(', ')}
                 WHERE id = $${values.length + 1}
                 RETURNING id, workspace_id AS "workspaceID", tab_id AS "tabID",
                           group_id AS "groupID", name, color`,
                [...values, tagID]
            );
        } catch (error) {
            if (error.code === '23505') {
                const conflict = new Error('A tag with that name already exists');
                conflict.status = 409;
                throw conflict;
            }
            throw error;
        }
    }

    async deleteTag(tagID) {
        return withTransaction(async client => {
            const removed = emptyChangeSet();

            const lists = await client.query('SELECT list_id FROM list_tags WHERE tag_id = $1', [tagID]);
            const tasks = await client.query('SELECT task_id FROM task_tags WHERE tag_id = $1', [tagID]);

            const { rowCount } = await client.query('DELETE FROM tags WHERE id = $1', [tagID]);
            if (rowCount === 0) return { removed, lists: [], tasks: [] };

            removed.tags.push(tagID);

            const listIDs = lists.rows.map(row => row.list_id);
            const taskIDs = tasks.rows.map(row => row.task_id);

            const touchedLists = listIDs.length > 0
                ? (await client.query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.id = ANY($1::text[])`, [listIDs])).rows
                : [];

            const touchedTasks = taskIDs.length > 0
                ? (await client.query(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE k.id = ANY($1::text[])`, [taskIDs])).rows
                : [];

            return { removed, lists: touchedLists, tasks: touchedTasks };
        });
    }

    async setListTags(listID, tagIDs) {
        return withTransaction(async client => {
            await client.query('DELETE FROM list_tags WHERE list_id = $1', [listID]);

            if (tagIDs.length > 0) {
                await client.query(
                    `INSERT INTO list_tags (list_id, tag_id)
                     SELECT $1, t.id FROM tags t
                     WHERE t.id = ANY($2::text[])
                       AND t.workspace_id = (
                           SELECT tb.workspace_id FROM lists l
                           JOIN board_columns c ON c.id = l.column_id
                           JOIN tabs tb ON tb.id = c.tab_id
                           WHERE l.id = $1
                       )
                     ON CONFLICT DO NOTHING`,
                    [listID, tagIDs]
                );
            }

            await client.query('UPDATE lists SET updated_at = now() WHERE id = $1', [listID]);

            const { rows: taskIDs } = await client.query('SELECT id FROM tasks WHERE list_id = $1', [listID]);

            if (taskIDs.length > 0) {
                await client.query('DELETE FROM task_tags WHERE task_id = ANY($1::text[])', [taskIDs.map(r => r.id)]);

                if (tagIDs.length > 0) {
                    await client.query(
                        `INSERT INTO task_tags (task_id, tag_id)
                         SELECT k.id, lt.tag_id
                         FROM tasks k
                         JOIN list_tags lt ON lt.list_id = k.list_id
                         WHERE k.list_id = $1
                         ON CONFLICT DO NOTHING`,
                        [listID]
                    );
                }

                await client.query('UPDATE tasks SET updated_at = now() WHERE list_id = $1', [listID]);
            }

            const list = (await client.query(`SELECT ${LIST_SELECT} ${LIST_FROM} WHERE l.id = $1`, [listID])).rows[0] ?? null;
            const tasks = taskIDs.length > 0
                ? (await client.query(`SELECT ${TASK_SELECT} ${TASK_FROM} WHERE k.list_id = $1 ORDER BY k.task_order`, [listID])).rows
                : [];

            return { list, tasks };
        });
    }

    async setTaskTags(taskID, tagIDs) {
        return withTransaction(async client => {
            await client.query('DELETE FROM task_tags WHERE task_id = $1', [taskID]);

            if (tagIDs.length > 0) {
                await client.query(
                    `INSERT INTO task_tags (task_id, tag_id)
                     SELECT $1, t.id FROM tags t
                     WHERE t.id = ANY($2::text[])
                       AND t.workspace_id = (
                           SELECT tb.workspace_id FROM tasks k
                           JOIN lists l ON l.id = k.list_id
                           JOIN board_columns c ON c.id = l.column_id
                           JOIN tabs tb ON tb.id = c.tab_id
                           WHERE k.id = $1
                       )
                     ON CONFLICT DO NOTHING`,
                    [taskID, tagIDs]
                );
            }

            await client.query('UPDATE tasks SET updated_at = now() WHERE id = $1', [taskID]);

            return this.fetchTask(client, taskID);
        });
    }

    // tab group functions
    async getTabGroup(groupID) {
        return queryOne(`SELECT ${TAB_GROUP_SELECT} FROM tab_groups g WHERE g.id = $1`, [groupID]);
    }

    async getWorkspaceIDForTabGroup(groupID) {
        const row = await queryOne('SELECT workspace_id AS "workspaceID" FROM tab_groups WHERE id = $1', [groupID]);
        return row?.workspaceID ?? null;
    }

    async createTabGroup(workspaceID, fields = {}, tabIDs = [], combineTags = false) {
        return withTransaction(async client => {
            const { rows } = await client.query(
                `INSERT INTO tab_groups (id, workspace_id, name, color)
                 VALUES ($1, $2, COALESCE($3, 'New group'), COALESCE($4, '#6c8ebf'))
                 RETURNING id`,
                [newID('tabgroup'), workspaceID, fields.name ?? null, fields.color ?? null]
            );

            const groupID = rows[0].id;

            await client.query(
                'UPDATE tabs SET group_id = $1, updated_at = now() WHERE id = ANY($2::text[]) AND workspace_id = $3',
                [groupID, tabIDs, workspaceID]
            );

            const merged = combineTags
                ? await combineTabTagsIntoGroup(client, tabIDs, groupID)
                : { tags: [], removedTagIDs: [], listIDs: [], taskIDs: [] };

            const { removedGroupIDs, tabs } = await normalizeTabs(client, [workspaceID]);

            const removed = emptyChangeSet();
            removed.tabGroups = removedGroupIDs;
            removed.tags = merged.removedTagIDs;

            const { lists, tasks } = await hydrateTagTargets(client, merged.listIDs, merged.taskIDs);

            const group = await client.query(
                `SELECT ${TAB_GROUP_SELECT} FROM tab_groups g WHERE g.id = $1`,
                [groupID]
            );

            return { group: group.rows[0] ?? null, tabs, tags: merged.tags, lists, tasks, removed };
        });
    }

    async updateTabGroup(groupID, changes) {
        const { assignments, values, nextIndex } = buildAssignments(changes, TAB_GROUP_FIELDS, 1);
        if (assignments.length === 0) return this.getTabGroup(groupID);

        return queryOne(
            `UPDATE tab_groups SET ${assignments.join(', ')}, updated_at = now()
             WHERE id = $${nextIndex}
             RETURNING id, workspace_id AS "workspaceID", name, color, updated_at AS "updatedAt"`,
            [...values, groupID]
        );
    }

    async deleteTabGroup(groupID) {
        return withTransaction(async client => {
            const scope = await client.query(
                'SELECT workspace_id AS "workspaceID" FROM tab_groups WHERE id = $1',
                [groupID]
            );

            if (scope.rowCount === 0) return { removed: emptyChangeSet(), tabs: [], tags: [], lists: [], tasks: [] };

            const members = await client.query('SELECT id FROM tabs WHERE group_id = $1 ORDER BY tab_order', [groupID]);
            const memberTabIDs = members.rows.map(row => row.id);

            const split = await splitGroupTagsToTabs(client, groupID, memberTabIDs);

            await client.query('UPDATE tabs SET group_id = NULL, updated_at = now() WHERE group_id = $1', [groupID]);
            await client.query('DELETE FROM tab_groups WHERE id = $1', [groupID]);

            const { removedGroupIDs, tabs } = await normalizeTabs(client, [scope.rows[0].workspaceID]);

            const removed = emptyChangeSet();
            removed.tabGroups = [groupID, ...removedGroupIDs];
            removed.tags = split.removedTagIDs;

            const { lists, tasks } = await hydrateTagTargets(client, split.listIDs, split.taskIDs);

            return { removed, tabs, tags: split.tags, lists, tasks };
        });
    }

    async reorderTabs(updates, combineTags = false) {
        const empty = { tabs: [], tags: [], lists: [], tasks: [], removed: emptyChangeSet() };
        if (!updates || updates.length === 0) return empty;

        const ids = updates.map(update => update.id);
        const groupIDs = updates.map(update => update.groupID);
        const orders = updates.map(update => update.tabOrder);

        return withTransaction(async client => {
            const { rows: touched } = await client.query(
                `UPDATE tabs AS t
                 SET group_id = u.group_id, tab_order = u.tab_order, updated_at = now()
                 FROM unnest($1::text[], $2::text[], $3::int[]) AS u(id, group_id, tab_order)
                 WHERE t.id = u.id
                 RETURNING t.workspace_id AS "workspaceID"`,
                [ids, groupIDs, orders]
            );

            if (touched.length === 0) return empty;

            const merged = { tags: [], removedTagIDs: [], listIDs: [], taskIDs: [] };

            if (combineTags) {
                const joins = new Map();

                for (const update of updates) {
                    if (!update.groupID) continue;
                    if (!joins.has(update.groupID)) joins.set(update.groupID, []);
                    joins.get(update.groupID).push(update.id);
                }

                for (const [joinGroupID, joinTabIDs] of joins) {
                    const outcome = await combineTabTagsIntoGroup(client, joinTabIDs, joinGroupID);

                    merged.tags.push(...outcome.tags);
                    merged.removedTagIDs.push(...outcome.removedTagIDs);
                    merged.listIDs.push(...outcome.listIDs);
                    merged.taskIDs.push(...outcome.taskIDs);
                }
            }

            const { removedGroupIDs, tabs } = await normalizeTabs(client, touched.map(row => row.workspaceID));

            const removed = emptyChangeSet();
            removed.tabGroups = removedGroupIDs;
            removed.tags = merged.removedTagIDs;

            const { lists, tasks } = await hydrateTagTargets(
                client,
                [...new Set(merged.listIDs)],
                [...new Set(merged.taskIDs)]
            );

            return { tabs, tags: merged.tags, lists, tasks, removed };
        });
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
             RETURNING id, workspace_id AS "workspaceID", group_id AS "groupID", name, color,
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
             RETURNING id, workspace_id AS "workspaceID", group_id AS "groupID", name, color,
                       tab_order AS "tabOrder", is_archived AS "isArchived", updated_at AS "updatedAt"`,
            [...values, tabID]
        );
    }

    async deleteTab(tabID) {
        return withTransaction(async client => {
            const removed = emptyChangeSet();

            const scope = await client.query(
                'SELECT workspace_id AS "workspaceID" FROM tabs WHERE id = $1',
                [tabID]
            );

            if (scope.rowCount === 0) return { removed, tabs: [] };

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
            if (rowCount === 0) return { removed: emptyChangeSet(), tabs: [] };

            removed.columns = Array.from(columnIDs);
            removed.lists = Array.from(listIDs);
            removed.tabs.push(tabID);

            const { removedGroupIDs, tabs } = await normalizeTabs(client, [scope.rows[0].workspaceID]);
            removed.tabGroups = removedGroupIDs;

            return { removed, tabs };
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
            `INSERT INTO lists (id, column_id, name, list_order)
             VALUES (
                 $1, $2,
                 COALESCE($3, 'New list'),
                 COALESCE($4, (SELECT COALESCE(MAX(list_order), -1) + 1 FROM lists WHERE column_id = $2))
             )
             RETURNING id`,
            [newID('list'), columnID, fields.name ?? null, fields.listOrder ?? null]
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
        return withTransaction(async client => {
            const { rows } = await client.query(
                `INSERT INTO tasks (id, list_id, title, description, task_order)
                 VALUES (
                     $1, $2,
                     COALESCE($3, 'New Task'),
                     COALESCE($4, ''),
                     COALESCE($5, (SELECT COALESCE(MAX(task_order), -1) + 1 FROM tasks WHERE list_id = $2))
                 )
                 RETURNING id`,
                [newID('task'), listID, fields.title ?? null, fields.description ?? null, fields.taskOrder ?? null]
            );

            if (rows.length === 0) return null;

            await client.query(
                `INSERT INTO task_tags (task_id, tag_id)
                 SELECT $1, lt.tag_id FROM list_tags lt WHERE lt.list_id = $2
                 ON CONFLICT DO NOTHING`,
                [rows[0].id, listID]
            );

            return this.fetchTask(client, rows[0].id);
        });
    }

    async updateTask(taskID, changes, expectedUpdatedAt) {
        const applied = pickFields(changes, TASK_FIELDS);
        const assignees = changes.assignedUsers;
        const { assignments, values, nextIndex } = buildAssignments(applied, TASK_FIELDS, 1);

        if (assignments.length === 0 && assignees === undefined) {
            const record = await this.getTask(taskID);
            return record ? { record } : { error: 'Task not found', status: 404 };
        }

        return withTransaction(async client => {
            const setClause = assignments.length > 0
                ? `${assignments.join(', ')}, updated_at = now()`
                : 'updated_at = now()';

            const conditions = [`id = $${nextIndex}`];
            const params = [...values, taskID];

            if (expectedUpdatedAt !== undefined) {
                conditions.push(`updated_at = $${nextIndex + 1}::timestamptz`);
                params.push(expectedUpdatedAt);
            }

            const { rows } = await client.query(
                `UPDATE tasks SET ${setClause} WHERE ${conditions.join(' AND ')} RETURNING id`,
                params
            );

            if (rows.length === 0) {
                const current = await this.fetchTask(client, taskID);
                if (!current) return { error: 'Task not found', status: 404 };
                return { error: 'This task was changed by someone else', status: 409, record: current };
            }

            if (assignees !== undefined) {
                await client.query('DELETE FROM task_assignees WHERE task_id = $1', [taskID]);

                if (assignees.length > 0) {
                    await client.query(
                        `INSERT INTO task_assignees (task_id, user_id)
                         SELECT $1, m.user_id
                         FROM memberships m
                         WHERE m.user_id = ANY($2::text[])
                           AND m.workspace_id = (
                               SELECT t.workspace_id
                               FROM tasks k
                               JOIN lists l ON l.id = k.list_id
                               JOIN board_columns c ON c.id = l.column_id
                               JOIN tabs t ON t.id = c.tab_id
                               WHERE k.id = $1
                           )
                         ON CONFLICT DO NOTHING`,
                        [taskID, assignees]
                    );
                }
            }

            return { record: await this.fetchTask(client, taskID) };
        });
    }

    async fetchTask(client, taskID) {
        const { rows } = await client.query(
            `SELECT ${TASK_SELECT} ${TASK_FROM} WHERE k.id = $1`,
            [taskID]
        );
        return rows[0] ?? null;
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

    // notation retrieval functions
    async getNotationData(workspaceID) {
        const [groups, pages] = await Promise.all([
            query(
                `SELECT ${NOTATION_GROUP_SELECT} FROM notation_groups g
                 WHERE g.workspace_id = $1 ORDER BY g.group_order, g.id`,
                [workspaceID]
            ),
            query(
                `SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p
                 WHERE p.workspace_id = $1 ORDER BY p.page_order, p.id`,
                [workspaceID]
            )
        ]);

        return { groups: groups.rows, pages: pages.rows };
    }

    // notation resolution functions
    async getWorkspaceIDForNotationGroup(groupID) {
        const row = await queryOne(
            'SELECT workspace_id AS "workspaceID" FROM notation_groups WHERE id = $1',
            [groupID]
        );
        return row?.workspaceID ?? null;
    }

    async getWorkspaceIDForNotationPage(pageID) {
        const row = await queryOne(
            'SELECT workspace_id AS "workspaceID" FROM notation_pages WHERE id = $1',
            [pageID]
        );
        return row?.workspaceID ?? null;
    }

    async getNotationGroupScope(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT g.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT g.id)::int AS found
             FROM notation_groups g
             WHERE g.id = ANY($1::text[])`,
            ids
        );
    }

    async getNotationPageScope(ids) {
        return this.resolveScope(
            `SELECT COALESCE(array_agg(DISTINCT p.workspace_id), '{}') AS workspaces,
                    COUNT(DISTINCT p.id)::int AS found
             FROM notation_pages p
             WHERE p.id = ANY($1::text[])`,
            ids
        );
    }

    // notation group functions
    async getNotationGroup(groupID) {
        return queryOne(`SELECT ${NOTATION_GROUP_SELECT} FROM notation_groups g WHERE g.id = $1`, [groupID]);
    }

    async createNotationGroup(workspaceID, fields = {}) {
        return withTransaction(async client => {
            const { rows: existing } = await client.query(
                'SELECT COUNT(*)::int AS total FROM notation_groups WHERE workspace_id = $1',
                [workspaceID]
            );

            if (existing[0].total >= MAX_GROUPS_PER_WORKSPACE) {
                throw badRequest(`A workspace cannot contain more than ${MAX_GROUPS_PER_WORKSPACE} groups`);
            }

            const { rows } = await client.query(
                `INSERT INTO notation_groups (id, workspace_id, name, color, group_order)
                 VALUES (
                     $1, $2,
                     COALESCE($3, 'New group'),
                     $4,
                     COALESCE($5, (SELECT COALESCE(MAX(group_order), -1) + 1 FROM notation_groups WHERE workspace_id = $2))
                 )
                 RETURNING id`,
                [newID('group'), workspaceID, fields.name ?? null, fields.color ?? null, fields.groupOrder ?? null]
            );

            if (rows.length === 0) return null;

            const { rows: created } = await client.query(
                `SELECT ${NOTATION_GROUP_SELECT} FROM notation_groups g WHERE g.id = $1`,
                [rows[0].id]
            );

            return created[0] ?? null;
        });
    }

    async updateNotationGroup(groupID, changes) {
        const { assignments, values, nextIndex } = buildAssignments(changes, NOTATION_GROUP_FIELDS, 1);
        if (assignments.length === 0) return this.getNotationGroup(groupID);

        const updated = await queryOne(
            `UPDATE notation_groups SET ${assignments.join(', ')}, updated_at = now()
             WHERE id = $${nextIndex}
             RETURNING id`,
            [...values, groupID]
        );

        return updated ? this.getNotationGroup(updated.id) : null;
    }

    async deleteNotationGroup(groupID) {
        return withTransaction(async client => {
            const removed = emptyNotationChangeSet();

            const scope = await client.query(
                'SELECT workspace_id AS "workspaceID" FROM notation_groups WHERE id = $1',
                [groupID]
            );

            if (scope.rowCount === 0) return { removed, pages: [] };

            const workspaceID = scope.rows[0].workspaceID;

            const { rows: orphans } = await client.query(
                'SELECT id FROM notation_pages WHERE group_id = $1 ORDER BY page_order, id',
                [groupID]
            );

            const base = await client.query(
                `SELECT COALESCE(MAX(page_order), -1) + 1 AS next
                 FROM notation_pages
                 WHERE workspace_id = $1 AND group_id IS NULL`,
                [workspaceID]
            );

            const { rowCount } = await client.query('DELETE FROM notation_groups WHERE id = $1', [groupID]);
            if (rowCount === 0) return { removed, pages: [] };

            removed.groups.push(groupID);

            if (orphans.length === 0) return { removed, pages: [] };

            const orphanIDs = orphans.map(row => row.id);
            const orphanOrders = orphans.map((row, index) => base.rows[0].next + index);

            await client.query(
                `UPDATE notation_pages AS p
                 SET page_order = u.page_order, updated_at = now()
                 FROM unnest($1::text[], $2::int[]) AS u(id, page_order)
                 WHERE p.id = u.id`,
                [orphanIDs, orphanOrders]
            );

            const { rows: pages } = await client.query(
                `SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p
                 WHERE p.id = ANY($1::text[]) ORDER BY p.page_order`,
                [orphanIDs]
            );

            return { removed, pages };
        });
    }

    // notation document functions
    async listNotationDocumentIDs() {
        const { rows } = await query('SELECT page_id AS "pageID" FROM notation_documents ORDER BY page_id');
        return rows.map(row => row.pageID);
    }

    async saveNotationDocumentContent(pageID, content) {
        await query(
            'UPDATE notation_documents SET content = $2 WHERE page_id = $1',
            [pageID, content]
        );
    }

    async getNotationDocument(pageID) {
        const row = await queryOne('SELECT state, content FROM notation_documents WHERE page_id = $1', [pageID]);
        if (!row) return null;

        return { state: row.state ?? null, content: row.content ?? '' };
    }

    async saveNotationDocument(pageID, state, content = '') {
        await query(
            `INSERT INTO notation_documents (page_id, state, content, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (page_id) DO UPDATE
             SET state = EXCLUDED.state, content = EXCLUDED.content, updated_at = now()`,
            [pageID, state, content]
        );
    }

    async searchNotationContent(workspaceID, term) {
        const pattern = `%${term.replace(/([\\%_])/g, '\\$1')}%`;

        const { rows } = await query(
            `SELECT p.id
             FROM notation_pages p
             JOIN notation_documents d ON d.page_id = p.id
             WHERE p.workspace_id = $1 AND d.content ILIKE $2
             ORDER BY p.page_order, p.id`,
            [workspaceID, pattern]
        );

        return rows.map(row => row.id);
    }

    // notation page functions
    async getNotationPage(pageID) {
        return queryOne(`SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p WHERE p.id = $1`, [pageID]);
    }

    async createNotationPage(workspaceID, fields = {}) {
        return withTransaction(async client => {
            const groupID = fields.groupID ?? null;

            const { rows: existing } = await client.query(
                'SELECT COUNT(*)::int AS total FROM notation_pages WHERE workspace_id = $1',
                [workspaceID]
            );

            if (existing[0].total >= MAX_PAGES_PER_WORKSPACE) {
                throw badRequest(`A workspace cannot contain more than ${MAX_PAGES_PER_WORKSPACE} pages`);
            }

            if (groupID) {
                const { rowCount } = await client.query(
                    'SELECT 1 FROM notation_groups WHERE id = $1 AND workspace_id = $2',
                    [groupID, workspaceID]
                );
                if (rowCount === 0) throw badRequest('That group does not exist');
            }

            const { rows } = await client.query(
                `INSERT INTO notation_pages (id, workspace_id, group_id, title, page_order)
                 VALUES (
                     $1, $2, $3::text,
                     COALESCE($4, 'Untitled'),
                     COALESCE($5, (
                         SELECT COALESCE(MAX(page_order), -1) + 1
                         FROM notation_pages
                         WHERE workspace_id = $2 AND group_id IS NOT DISTINCT FROM $3::text
                     ))
                 )
                 RETURNING id`,
                [newID('page'), workspaceID, groupID, fields.title ?? null, fields.pageOrder ?? null]
            );

            if (rows.length === 0) return null;

            const { rows: created } = await client.query(
                `SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p WHERE p.id = $1`,
                [rows[0].id]
            );

            return created[0] ?? null;
        });
    }

    async updateNotationPage(pageID, changes, workspaceID) {
        return withTransaction(async client => {
            const current = await client.query(
                'SELECT workspace_id AS "workspaceID", group_id AS "groupID" FROM notation_pages WHERE id = $1',
                [pageID]
            );

            if (current.rowCount === 0) return null;

            const applied = { ...changes };

            if (applied.groupID) {
                const { rowCount } = await client.query(
                    'SELECT 1 FROM notation_groups WHERE id = $1 AND workspace_id = $2',
                    [applied.groupID, workspaceID]
                );
                if (rowCount === 0) throw badRequest('That group does not exist');
            }

            const movesGroup = applied.groupID !== undefined
                && (applied.groupID ?? null) !== (current.rows[0].groupID ?? null);

            if (movesGroup && applied.pageOrder === undefined) {
                const { rows: tail } = await client.query(
                    `SELECT COALESCE(MAX(page_order), -1) + 1 AS next
                     FROM notation_pages
                     WHERE workspace_id = $1
                       AND group_id IS NOT DISTINCT FROM $2::text
                       AND id <> $3`,
                    [current.rows[0].workspaceID, applied.groupID ?? null, pageID]
                );
                applied.pageOrder = tail[0].next;
            }

            const { assignments, values, nextIndex } = buildAssignments(applied, NOTATION_PAGE_FIELDS, 1);

            if (assignments.length === 0) {
                const { rows: unchanged } = await client.query(
                    `SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p WHERE p.id = $1`,
                    [pageID]
                );
                return unchanged[0] ?? null;
            }

            const { rows } = await client.query(
                `UPDATE notation_pages SET ${assignments.join(', ')}, updated_at = now()
                 WHERE id = $${nextIndex}
                 RETURNING id`,
                [...values, pageID]
            );

            if (rows.length === 0) return null;

            const { rows: updated } = await client.query(
                `SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p WHERE p.id = $1`,
                [rows[0].id]
            );

            return updated[0] ?? null;
        });
    }

    async deleteNotationPage(pageID) {
        const removed = emptyNotationChangeSet();
        const { rowCount } = await query('DELETE FROM notation_pages WHERE id = $1', [pageID]);
        if (rowCount > 0) removed.pages.push(pageID);
        return removed;
    }

    async reorderNotationGroups(updates) {
        if (!updates || updates.length === 0) return [];

        const ids = updates.map(update => update.id);
        const orders = updates.map(update => update.groupOrder);

        const { rows } = await query(
            `UPDATE notation_groups AS g
             SET group_order = u.group_order, updated_at = now()
             FROM unnest($1::text[], $2::int[]) AS u(id, group_order)
             WHERE g.id = u.id
             RETURNING g.id`,
            [ids, orders]
        );

        if (rows.length === 0) return [];

        const { rows: records } = await query(
            `SELECT ${NOTATION_GROUP_SELECT} FROM notation_groups g
             WHERE g.id = ANY($1::text[]) ORDER BY g.group_order`,
            [rows.map(row => row.id)]
        );

        return records;
    }

    async reorderNotationPages(updates) {
        if (!updates || updates.length === 0) return [];

        const ids = updates.map(update => update.id);
        const groupIDs = updates.map(update => update.groupID);
        const orders = updates.map(update => update.pageOrder);

        const { rows } = await query(
            `UPDATE notation_pages AS p
             SET group_id = u.group_id, page_order = u.page_order, updated_at = now()
             FROM unnest($1::text[], $2::text[], $3::int[]) AS u(id, group_id, page_order)
             WHERE p.id = u.id
             RETURNING p.id`,
            [ids, groupIDs, orders]
        );

        if (rows.length === 0) return [];

        const { rows: records } = await query(
            `SELECT ${NOTATION_PAGE_SELECT} FROM notation_pages p
             WHERE p.id = ANY($1::text[]) ORDER BY p.page_order`,
            [rows.map(row => row.id)]
        );

        return records;
    }
}

export default new Database();
