// authorization imports
import db from '../database/Database.mjs';

// resolver functions
const resolvers = {
    param: field => async req => req.params[field],
    body: field => async req => req.body?.[field],
    tab: field => async req => db.getWorkspaceIDForTab(req.params[field] ?? req.body?.[field]),
    column: field => async req => db.getWorkspaceIDForColumn(req.params[field] ?? req.body?.[field]),
    list: field => async req => db.getWorkspaceIDForList(req.params[field] ?? req.body?.[field]),
    task: field => async req => db.getWorkspaceIDForTask(req.params[field] ?? req.body?.[field])
};

// authorization classes
class Authorization {

    // middleware factories
    requireMembership(resolve) {
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

                if (!await db.isMember(workspaceID, req.user.id)) {
                    return res.status(404).json({ error: 'Not found' });
                }

                req.workspaceID = workspaceID;
                req.workspace = workspace;
                next();
            } catch (error) {
                next(error);
            }
        };
    }

    requireOwnership(resolve) {
        return async (req, res, next) => {
            try {
                const workspaceID = await resolve(req);
                const workspace = await db.getWorkspace(workspaceID);

                if (!workspace || !await db.isMember(workspaceID, req.user.id)) {
                    return res.status(404).json({ error: 'Not found' });
                }

                if (workspace.ownerID !== req.user.id) {
                    return res.status(403).json({ error: 'Only the workspace owner can do that' });
                }

                req.workspaceID = workspaceID;
                req.workspace = workspace;
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

    workspaceOwnerParam(field = 'workspaceID') {
        return this.requireOwnership(resolvers.param(field));
    }

    tabAccess(field = 'id') {
        return this.requireMembership(resolvers.tab(field));
    }

    columnAccess(field = 'id') {
        return this.requireMembership(resolvers.column(field));
    }

    listAccess(field = 'id') {
        return this.requireMembership(resolvers.list(field));
    }

    taskAccess(field = 'id') {
        return this.requireMembership(resolvers.task(field));
    }
}

export default Authorization;
