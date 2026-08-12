// authorization imports
import db from '../database/Database.mjs';

// configuration constants
const EDIT_ROLES = new Set(['owner', 'member']);

// resolver functions
const resolvers = {
    param: field => async req => req.params[field],
    body: field => async req => req.body?.[field],
    tab: field => async req => db.getWorkspaceIDForTab(req.params[field] ?? req.body?.[field]),
    column: field => async req => db.getWorkspaceIDForColumn(req.params[field] ?? req.body?.[field]),
    list: field => async req => db.getWorkspaceIDForList(req.params[field] ?? req.body?.[field]),
    task: field => async req => db.getWorkspaceIDForTask(req.params[field] ?? req.body?.[field]),
    notationGroup: field => async req => db.getWorkspaceIDForNotationGroup(req.params[field] ?? req.body?.[field]),
    notationPage: field => async req => db.getWorkspaceIDForNotationPage(req.params[field] ?? req.body?.[field])
};

// authorization classes
class Authorization {

    // middleware factories
    requireAccess(resolve, { write = false } = {}) {
        return async (req, res, next) => {
            try {
                const workspaceID = await resolve(req);

                if (!workspaceID) {
                    return res.status(404).json({ error: 'Not found' });
                }

                const workspace = await db.getWorkspace(workspaceID);

                if (!workspace) {
                    return res.status(404).json({ error: 'Not found' });
                }

                const membership = await db.getMembership(workspaceID, req.user.id);

                if (!membership) {
                    return res.status(404).json({ error: 'Not found' });
                }

                if (write && !EDIT_ROLES.has(membership.role)) {
                    return res.status(403).json({ error: 'You have read only access to this workspace' });
                }

                req.workspaceID = workspaceID;
                req.workspace = workspace;
                req.membership = membership;
                next();
            } catch (error) {
                next(error);
            }
        };
    }

    requireMembership(resolve) {
        return this.requireAccess(resolve);
    }

    requireEditor(resolve) {
        return this.requireAccess(resolve, { write: true });
    }

    requireOwnership(resolve) {
        return async (req, res, next) => {
            try {
                const workspaceID = await resolve(req);
                const workspace = await db.getWorkspace(workspaceID);
                const membership = workspace
                    ? await db.getMembership(workspaceID, req.user.id)
                    : null;

                if (!workspace || !membership) {
                    return res.status(404).json({ error: 'Not found' });
                }

                if (workspace.ownerID !== req.user.id) {
                    return res.status(403).json({ error: 'Only the workspace owner can do that' });
                }

                req.workspaceID = workspaceID;
                req.workspace = workspace;
                req.membership = membership;
                next();
            } catch (error) {
                next(error);
            }
        };
    }

    // convenience middleware
    requireAdmin() {
        return (req, res, next) => {
            if (req.user?.role !== 'admin') {
                return res.status(404).json({ error: 'Not found' });
            }
            next();
        };
    }

    workspaceParam(field = 'workspaceID') {
        return this.requireMembership(resolvers.param(field));
    }

    workspaceBody(field = 'workspaceID') {
        return this.requireMembership(resolvers.body(field));
    }

    workspaceBodyEdit(field = 'workspaceID') {
        return this.requireEditor(resolvers.body(field));
    }

    workspaceOwnerParam(field = 'workspaceID') {
        return this.requireOwnership(resolvers.param(field));
    }

    tabAccess(field = 'id') {
        return this.requireMembership(resolvers.tab(field));
    }

    tabEdit(field = 'id') {
        return this.requireEditor(resolvers.tab(field));
    }

    columnAccess(field = 'id') {
        return this.requireMembership(resolvers.column(field));
    }

    columnEdit(field = 'id') {
        return this.requireEditor(resolvers.column(field));
    }

    listAccess(field = 'id') {
        return this.requireMembership(resolvers.list(field));
    }

    listEdit(field = 'id') {
        return this.requireEditor(resolvers.list(field));
    }

    taskAccess(field = 'id') {
        return this.requireMembership(resolvers.task(field));
    }

    taskEdit(field = 'id') {
        return this.requireEditor(resolvers.task(field));
    }

    notationGroupAccess(field = 'id') {
        return this.requireMembership(resolvers.notationGroup(field));
    }

    notationGroupEdit(field = 'id') {
        return this.requireEditor(resolvers.notationGroup(field));
    }

    notationPageAccess(field = 'id') {
        return this.requireMembership(resolvers.notationPage(field));
    }

    notationPageEdit(field = 'id') {
        return this.requireEditor(resolvers.notationPage(field));
    }
}

export default Authorization;
