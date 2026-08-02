// database imports
import crypto from 'crypto';

// database classes
class Database {
    constructor() {
        this.users = new Map();
        this.sessions = new Map();
        this.tabs = new Map();
        this.columns = new Map();
        this.lists = new Map();
        this.tasks = new Map();
        
        this.initializeMockUser();
        this.initializeTestData();
    }

    // user initialization
    initializeMockUser() {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync('k', salt, 64).toString('hex');
        
        this.users.set('test', {
            id: 1,
            username: 'test',
            salt: salt,
            hash: hash,
            role: 'admin'
        });
    }

    // test data initialization
    initializeTestData() {
        const now = new Date().toISOString();
        this.tabs.set('tab-1', { id: 'tab-1', name: 'Main Board', color: '#6c8ebf', tabOrder: 0, workspaceID: 'workspace-1', updatedAt: now });
        this.columns.set('col-1', { id: 'col-1', tabID: 'tab-1', workspaceID: 'workspace-1', columnIndex: 0, updatedAt: now });
        this.lists.set('list-1', { id: 'list-1', name: 'To Do', columnID: 'col-1', workspaceID: 'workspace-1', tabID: 'tab-1', updatedAt: now });
        this.tasks.set('task-1', { id: 'task-1', title: 'Test Task', isCompleted: 0, listID: 'list-1', taskOrder: 0, updatedAt: now });
    }

    // session management functions
    createSession(userId) {
        const sessionId = crypto.randomBytes(32).toString('hex');
        this.sessions.set(sessionId, userId);
        return sessionId;
    }

    // retrieval functions
    getTask(id) {
        return this.tasks.get(id);
    }

    getWorkspaceData(workspaceID) {
        const workspaceTabs = Array.from(this.tabs.values()).filter(t => t.workspaceID === workspaceID);
        const workspaceColumns = Array.from(this.columns.values()).filter(c => c.workspaceID === workspaceID);
        const workspaceLists = Array.from(this.lists.values()).filter(l => l.workspaceID === workspaceID);
        
        const listIDs = workspaceLists.map(l => l.id);
        const workspaceTasks = Array.from(this.tasks.values()).filter(t => listIDs.includes(t.listID));

        return {
            tabs: workspaceTabs,
            columns: workspaceColumns,
            lists: workspaceLists,
            tasks: workspaceTasks
        };
    }

    getUser(username) {
        return this.users.get(username);
    }

    getUserBySession(sessionId) {
        const userId = this.sessions.get(sessionId);
        if (!userId) return null;
        
        for (const user of this.users.values()) {
            if (user.id === userId) return user;
        }
        return null;
    }

    // update functions
    updateTask(id, updates, expectedUpdatedAt) {
        const task = this.tasks.get(id);
        
        if (!task) {
            return { error: 'Task not found', status: 404 };
        }

        if (task.updatedAt !== expectedUpdatedAt) {
            return { error: 'Conflict: Task was modified by another user.', status: 409 };
        }

        const newTimestamp = new Date().toISOString();
        const updatedTask = { ...task, ...updates, updatedAt: newTimestamp };
        
        this.tasks.set(id, updatedTask);
        
        return { success: true, newTimestamp };
    }
}

export default new Database();