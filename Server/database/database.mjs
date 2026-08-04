// database imports
import crypto from 'crypto';

// configuration constants
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

const TAB_FIELDS = ['name', 'color', 'tabOrder', 'isArchived'];
const LIST_FIELDS = ['name', 'columnID', 'listOrder', 'category', 'color'];
const TASK_FIELDS = ['title', 'description', 'isCompleted', 'listID', 'taskOrder', 'category', 'color', 'deadline', 'subtasks'];
const PUBLIC_USER_FIELDS = ['id', 'username', 'email', 'displayName', 'firstName', 'lastName', 'role', 'cursorColor'];

// utility functions
function timestamp() {
    return new Date().toISOString();
}

function newID(prefix) {
    return `${prefix}-${crypto.randomUUID()}`;
}

function clone(record) {
    return record ? { ...record } : null;
}

function cloneAll(records) {
    return records.map(record => ({ ...record }));
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

// database classes
class Database {
    constructor() {
        this.users = new Map();
        this.sessions = new Map();
        this.categories = new Map();
        this.workspaces = new Map();
        this.memberships = new Map();
        this.tabs = new Map();
        this.columns = new Map();
        this.lists = new Map();
        this.tasks = new Map();

        this.seedUsers();
        this.seedWorkspace();
        this.startSessionSweep();
    }

    // seed functions
    seedUsers() {
        this.insertSeedUser({
            id: 'user-1',
            username: 'test',
            password: 'k',
            email: 'test@nodelit.local',
            displayName: 'Test User',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
            cursorColor: '#c8502a'
        });

        this.insertSeedUser({
            id: 'user-2',
            username: 'demo',
            password: 'k',
            email: 'demo@nodelit.local',
            displayName: 'Demo User',
            firstName: 'Demo',
            lastName: 'User',
            role: 'member',
            cursorColor: '#4a90d9'
        });
    }

    insertSeedUser({ id, username, password, email, displayName, firstName, lastName, role, cursorColor }) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');

        this.users.set(id, {
            id,
            username,
            email,
            displayName,
            firstName,
            lastName,
            role,
            cursorColor,
            salt,
            hash,
            createdAt: timestamp()
        });
    }

    seedWorkspace() {
        const createdAt = timestamp();

        this.categories.set('cat-1', { id: 'cat-1', userID: 'user-1', name: 'Planning', color: '#4a90d9', createdAt });
        this.categories.set('cat-2', { id: 'cat-2', userID: 'user-1', name: 'Research', color: '#7ab648', createdAt });

        this.workspaces.set('workspace-1', {
            id: 'workspace-1',
            name: 'Example Project',
            ownerID: 'user-1',
            categoryID: 'cat-1',
            createdAt
        });

        this.memberships.set('workspace-1:user-1', { workspaceID: 'workspace-1', userID: 'user-1', role: 'owner', createdAt });
        this.memberships.set('workspace-1:user-2', { workspaceID: 'workspace-1', userID: 'user-2', role: 'member', createdAt });

        this.tabs.set('tab-1', {
            id: 'tab-1',
            workspaceID: 'workspace-1',
            name: 'Main Board',
            color: '#6c8ebf',
            tabOrder: 0,
            isArchived: false,
            updatedAt: createdAt
        });

        this.tabs.set('tab-2', {
            id: 'tab-2',
            workspaceID: 'workspace-1',
            name: 'Backlog',
            color: '#b8f0c8',
            tabOrder: 1,
            isArchived: false,
            updatedAt: createdAt
        });

        this.columns.set('col-1', { id: 'col-1', workspaceID: 'workspace-1', tabID: 'tab-1', columnIndex: 0, updatedAt: createdAt });
        this.columns.set('col-2', { id: 'col-2', workspaceID: 'workspace-1', tabID: 'tab-1', columnIndex: 1, updatedAt: createdAt });

        this.lists.set('list-1', {
            id: 'list-1', workspaceID: 'workspace-1', tabID: 'tab-1', columnID: 'col-1',
            name: 'To Do', listOrder: 0, category: 'Planning', color: '#4a90d9', updatedAt: createdAt
        });
        this.lists.set('list-2', {
            id: 'list-2', workspaceID: 'workspace-1', tabID: 'tab-1', columnID: 'col-1',
            name: 'Blocked', listOrder: 1, category: null, color: '#e6a817', updatedAt: createdAt
        });
        this.lists.set('list-3', {
            id: 'list-3', workspaceID: 'workspace-1', tabID: 'tab-1', columnID: 'col-2',
            name: 'In Progress', listOrder: 0, category: 'Research', color: '#7ab648', updatedAt: createdAt
        });

        this.columns.set('col-3', { id: 'col-3', workspaceID: 'workspace-1', tabID: 'tab-2', columnIndex: 0, updatedAt: createdAt });

        this.lists.set('list-4', {
            id: 'list-4', workspaceID: 'workspace-1', tabID: 'tab-2', columnID: 'col-3',
            name: 'Someday', listOrder: 0, category: null, color: '#9b59b6', updatedAt: createdAt
        });

        this.tasks.set('task-5', {
            id: 'task-5', listID: 'list-4', title: 'Chat page', description: '',
            isCompleted: false, taskOrder: 0, category: null, color: '#9b59b6',
            deadline: '', subtasks: [], assignedUsers: [], updatedAt: createdAt
        });

        this.tasks.set('task-1', {
            id: 'task-1', listID: 'list-1', title: 'Wire up the board', description: '',
            isCompleted: false, taskOrder: 0, category: 'Planning', color: '#4a90d9',
            deadline: '', subtasks: [], assignedUsers: [], updatedAt: createdAt
        });
        this.tasks.set('task-2', {
            id: 'task-2', listID: 'list-1', title: 'Check drag and drop', description: 'Across columns too.',
            isCompleted: false, taskOrder: 1, category: 'Planning', color: '#4a90d9',
            deadline: '', subtasks: [
                { id: 'sub-1', text: 'Within a list', done: true },
                { id: 'sub-2', text: 'Between columns', done: false }
            ], assignedUsers: [], updatedAt: createdAt
        });
        this.tasks.set('task-3', {
            id: 'task-3', listID: 'list-2', title: 'Waiting on schema', description: '',
            isCompleted: false, taskOrder: 0, category: null, color: '#e6a817',
            deadline: '2026-09-01', subtasks: [], assignedUsers: [], updatedAt: createdAt
        });
        this.tasks.set('task-4', {
            id: 'task-4', listID: 'list-3', title: 'Live sync over SSE', description: '',
            isCompleted: true, taskOrder: 0, category: 'Research', color: '#7ab648',
            deadline: '', subtasks: [], assignedUsers: [], updatedAt: createdAt
        });
    }

    // session functions
    startSessionSweep() {
        this.sweepTimer = setInterval(() => {
            const cutoff = Date.now();
            for (const [id, session] of this.sessions) {
                if (session.expiresAt <= cutoff) this.sessions.delete(id);
            }
        }, SESSION_SWEEP_INTERVAL_MS);

        this.sweepTimer.unref?.();
    }

    async createSession(userID) {
        const sessionID = crypto.randomBytes(32).toString('hex');

        this.sessions.set(sessionID, {
            userID,
            createdAt: Date.now(),
            expiresAt: Date.now() + SESSION_LIFETIME_MS
        });

        return sessionID;
    }

    async deleteSession(sessionID) {
        return this.sessions.delete(sessionID);
    }

    async deleteSessionsForUser(userID) {
        for (const [id, session] of this.sessions) {
            if (session.userID === userID) this.sessions.delete(id);
        }
    }

    async getUserBySession(sessionID) {
        const session = this.sessions.get(sessionID);
        if (!session) return null;

        if (session.expiresAt <= Date.now()) {
            this.sessions.delete(sessionID);
            return null;
        }

        return clone(this.users.get(session.userID));
    }

    // user functions
    async getUserByUsername(username) {
        for (const user of this.users.values()) {
            if (user.username === username) return clone(user);
        }
        return null;
    }

    async getUserByID(userID) {
        return clone(this.users.get(userID));
    }

    toPublicUser(user) {
        return user ? pickFields(user, PUBLIC_USER_FIELDS) : null;
    }

    // category functions
    async getCategoriesForUser(userID) {
        const owned = Array.from(this.categories.values()).filter(c => c.userID === userID);
        return cloneAll(owned);
    }

    async getCategory(categoryID) {
        return clone(this.categories.get(categoryID));
    }

    async createCategory(userID, name, color) {
        const category = { id: newID('cat'), userID, name, color, createdAt: timestamp() };
        this.categories.set(category.id, category);
        return clone(category);
    }

    async deleteCategory(categoryID) {
        for (const workspace of this.workspaces.values()) {
            if (workspace.categoryID === categoryID) workspace.categoryID = null;
        }
        return this.categories.delete(categoryID);
    }

    // workspace functions
    async getWorkspacesForUser(userID) {
        const result = [];

        for (const membership of this.memberships.values()) {
            if (membership.userID !== userID) continue;

            const workspace = this.workspaces.get(membership.workspaceID);
            if (!workspace) continue;

            const category = workspace.categoryID ? this.categories.get(workspace.categoryID) : null;

            result.push({
                ...workspace,
                memberRole: membership.role,
                categoryName: category?.name ?? null,
                categoryColor: category?.color ?? null
            });
        }

        return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    async getWorkspace(workspaceID) {
        return clone(this.workspaces.get(workspaceID));
    }

    async createWorkspace(userID, name, categoryID) {
        const createdAt = timestamp();
        const workspace = { id: newID('ws'), name, ownerID: userID, categoryID: categoryID ?? null, createdAt };

        this.workspaces.set(workspace.id, workspace);
        this.memberships.set(`${workspace.id}:${userID}`, {
            workspaceID: workspace.id,
            userID,
            role: 'owner',
            createdAt
        });

        const tab = {
            id: newID('tab'),
            workspaceID: workspace.id,
            name: 'Main Board',
            color: '#6c8ebf',
            tabOrder: 0,
            isArchived: false,
            updatedAt: createdAt
        };
        this.tabs.set(tab.id, tab);

        const category = categoryID ? this.categories.get(categoryID) : null;

        return {
            ...workspace,
            memberRole: 'owner',
            categoryName: category?.name ?? null,
            categoryColor: category?.color ?? null
        };
    }

    async deleteWorkspace(workspaceID) {
        for (const task of Array.from(this.tasks.values())) {
            const list = this.lists.get(task.listID);
            if (list?.workspaceID === workspaceID) this.tasks.delete(task.id);
        }

        for (const [id, list] of Array.from(this.lists)) {
            if (list.workspaceID === workspaceID) this.lists.delete(id);
        }

        for (const [id, column] of Array.from(this.columns)) {
            if (column.workspaceID === workspaceID) this.columns.delete(id);
        }

        for (const [id, tab] of Array.from(this.tabs)) {
            if (tab.workspaceID === workspaceID) this.tabs.delete(id);
        }

        for (const [key, membership] of Array.from(this.memberships)) {
            if (membership.workspaceID === workspaceID) this.memberships.delete(key);
        }

        return this.workspaces.delete(workspaceID);
    }

    // membership functions
    async isMember(workspaceID, userID) {
        return this.memberships.has(`${workspaceID}:${userID}`);
    }

    async getMembership(workspaceID, userID) {
        return clone(this.memberships.get(`${workspaceID}:${userID}`));
    }

    async getMembers(workspaceID) {
        const members = [];

        for (const membership of this.memberships.values()) {
            if (membership.workspaceID !== workspaceID) continue;

            const user = this.users.get(membership.userID);
            if (!user) continue;

            members.push({ ...this.toPublicUser(user), memberRole: membership.role });
        }

        return members;
    }

    async addMember(workspaceID, userID, role = 'member') {
        const membership = { workspaceID, userID, role, createdAt: timestamp() };
        this.memberships.set(`${workspaceID}:${userID}`, membership);
        return clone(membership);
    }

    // board retrieval functions
    async getWorkspaceData(workspaceID) {
        const tabs = Array.from(this.tabs.values()).filter(t => t.workspaceID === workspaceID);
        const columns = Array.from(this.columns.values()).filter(c => c.workspaceID === workspaceID);
        const lists = Array.from(this.lists.values()).filter(l => l.workspaceID === workspaceID);

        const listIDs = new Set(lists.map(l => l.id));
        const tasks = Array.from(this.tasks.values()).filter(t => listIDs.has(t.listID));

        return {
            tabs: cloneAll(tabs).sort((a, b) => a.tabOrder - b.tabOrder),
            columns: cloneAll(columns).sort((a, b) => a.columnIndex - b.columnIndex),
            lists: cloneAll(lists).sort((a, b) => a.listOrder - b.listOrder),
            tasks: cloneAll(tasks).sort((a, b) => a.taskOrder - b.taskOrder)
        };
    }

    // resolution functions
    async getWorkspaceIDForTab(tabID) {
        return this.tabs.get(tabID)?.workspaceID ?? null;
    }

    async getWorkspaceIDForColumn(columnID) {
        return this.columns.get(columnID)?.workspaceID ?? null;
    }

    async getWorkspaceIDForList(listID) {
        return this.lists.get(listID)?.workspaceID ?? null;
    }

    async getWorkspaceIDForTask(taskID) {
        const task = this.tasks.get(taskID);
        if (!task) return null;
        return this.lists.get(task.listID)?.workspaceID ?? null;
    }

    // tab functions
    async getTab(tabID) {
        return clone(this.tabs.get(tabID));
    }

    async createTab(workspaceID, fields) {
        const existing = Array.from(this.tabs.values()).filter(t => t.workspaceID === workspaceID);
        const nextOrder = existing.reduce((max, t) => Math.max(max, t.tabOrder), -1) + 1;

        const tab = {
            id: newID('tab'),
            workspaceID,
            name: fields.name ?? 'New Board',
            color: fields.color ?? '#6c8ebf',
            tabOrder: fields.tabOrder ?? nextOrder,
            isArchived: false,
            updatedAt: timestamp()
        };

        this.tabs.set(tab.id, tab);
        return clone(tab);
    }

    async updateTab(tabID, changes) {
        const tab = this.tabs.get(tabID);
        if (!tab) return null;

        const updated = { ...tab, ...pickFields(changes, TAB_FIELDS), updatedAt: timestamp() };
        this.tabs.set(tabID, updated);
        return clone(updated);
    }

    async deleteTab(tabID) {
        const removed = emptyChangeSet();
        const tab = this.tabs.get(tabID);
        if (!tab) return removed;

        const columnIDs = Array.from(this.columns.values())
            .filter(c => c.tabID === tabID)
            .map(c => c.id);

        const listIDs = Array.from(this.lists.values())
            .filter(l => l.tabID === tabID)
            .map(l => l.id);

        for (const [id, task] of Array.from(this.tasks)) {
            if (listIDs.includes(task.listID)) {
                this.tasks.delete(id);
                removed.tasks.push(id);
            }
        }

        for (const id of listIDs) {
            this.lists.delete(id);
            removed.lists.push(id);
        }

        for (const id of columnIDs) {
            this.columns.delete(id);
            removed.columns.push(id);
        }

        this.tabs.delete(tabID);
        removed.tabs.push(tabID);

        return removed;
    }

    // column functions
    async getColumn(columnID) {
        return clone(this.columns.get(columnID));
    }

    async getColumnByIndex(tabID, columnIndex) {
        for (const column of this.columns.values()) {
            if (column.tabID === tabID && column.columnIndex === columnIndex) return clone(column);
        }
        return null;
    }

    async createColumn(workspaceID, tabID, columnIndex) {
        const column = {
            id: newID('col'),
            workspaceID,
            tabID,
            columnIndex,
            updatedAt: timestamp()
        };

        this.columns.set(column.id, column);
        return clone(column);
    }

    async deleteColumn(columnID) {
        const removed = emptyChangeSet();
        if (!this.columns.has(columnID)) return removed;

        const listIDs = Array.from(this.lists.values())
            .filter(l => l.columnID === columnID)
            .map(l => l.id);

        for (const [id, task] of Array.from(this.tasks)) {
            if (listIDs.includes(task.listID)) {
                this.tasks.delete(id);
                removed.tasks.push(id);
            }
        }

        for (const id of listIDs) {
            this.lists.delete(id);
            removed.lists.push(id);
        }

        this.columns.delete(columnID);
        removed.columns.push(columnID);

        return removed;
    }

    // list functions
    async getList(listID) {
        return clone(this.lists.get(listID));
    }

    async createList(workspaceID, tabID, columnID, fields = {}) {
        const siblings = Array.from(this.lists.values()).filter(l => l.columnID === columnID);
        const nextOrder = siblings.reduce((max, l) => Math.max(max, l.listOrder), -1) + 1;

        const list = {
            id: newID('list'),
            workspaceID,
            tabID,
            columnID,
            name: fields.name ?? 'New list',
            listOrder: fields.listOrder ?? nextOrder,
            category: fields.category ?? null,
            color: fields.color ?? null,
            updatedAt: timestamp()
        };

        this.lists.set(list.id, list);
        return clone(list);
    }

    async updateList(listID, changes) {
        const list = this.lists.get(listID);
        if (!list) return null;

        const updated = { ...list, ...pickFields(changes, LIST_FIELDS), updatedAt: timestamp() };
        this.lists.set(listID, updated);
        return clone(updated);
    }

    async deleteList(listID) {
        const removed = emptyChangeSet();
        if (!this.lists.has(listID)) return removed;

        for (const [id, task] of Array.from(this.tasks)) {
            if (task.listID === listID) {
                this.tasks.delete(id);
                removed.tasks.push(id);
            }
        }

        this.lists.delete(listID);
        removed.lists.push(listID);

        return removed;
    }

    async reorderLists(updates) {
        const applied = [];
        const stamp = timestamp();

        for (const update of updates) {
            const list = this.lists.get(update.id);
            if (!list) continue;

            const next = { ...list, columnID: update.columnID, listOrder: update.listOrder, updatedAt: stamp };
            this.lists.set(next.id, next);
            applied.push(clone(next));
        }

        return applied;
    }

    // task functions
    async getTask(taskID) {
        return clone(this.tasks.get(taskID));
    }

    async createTask(listID, fields = {}) {
        const siblings = Array.from(this.tasks.values()).filter(t => t.listID === listID);
        const nextOrder = siblings.reduce((max, t) => Math.max(max, t.taskOrder), -1) + 1;

        const task = {
            id: newID('task'),
            listID,
            title: fields.title ?? '',
            description: fields.description ?? '',
            isCompleted: false,
            taskOrder: fields.taskOrder ?? nextOrder,
            category: fields.category ?? null,
            color: fields.color ?? null,
            deadline: '',
            subtasks: [],
            assignedUsers: [],
            updatedAt: timestamp()
        };

        this.tasks.set(task.id, task);
        return clone(task);
    }

    async updateTask(taskID, changes, expectedUpdatedAt) {
        const task = this.tasks.get(taskID);
        if (!task) return { error: 'Task not found', status: 404 };

        if (expectedUpdatedAt !== undefined && task.updatedAt !== expectedUpdatedAt) {
            return { error: 'This task was changed by someone else', status: 409, record: clone(task) };
        }

        const applied = pickFields(changes, TASK_FIELDS);
        if (applied.isCompleted !== undefined) applied.isCompleted = Boolean(applied.isCompleted);

        const updated = { ...task, ...applied, updatedAt: timestamp() };
        this.tasks.set(taskID, updated);

        return { record: clone(updated) };
    }

    async deleteTask(taskID) {
        const removed = emptyChangeSet();
        if (this.tasks.delete(taskID)) removed.tasks.push(taskID);
        return removed;
    }

    async reorderTasks(updates) {
        const applied = [];
        const stamp = timestamp();

        for (const update of updates) {
            const task = this.tasks.get(update.id);
            if (!task) continue;

            const next = { ...task, listID: update.listID, taskOrder: update.taskOrder, updatedAt: stamp };
            this.tasks.set(next.id, next);
            applied.push(clone(next));
        }

        return applied;
    }
}

export default new Database();
