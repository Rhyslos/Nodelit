// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import {
    requireID,
    requireText,
    requireUsername,
    requirePassword,
    requireRole,
    optionalColor
} from '../modules/Validation.mjs';

// audit functions
function audit(req, entry) {
    return db.recordAudit({
        actorID: req.user?.id,
        actorName: req.user?.username,
        ip: req.ip,
        ...entry
    });
}

// router configuration
export default function createAdminRouter(authz) {
    const router = Router();

    router.use(authz.requireAdmin());

    // user routes
    router.get('/users', async (req, res, next) => {
        try {
            const users = await db.getAllUsers({ includeDeleted: req.query.includeDeleted === 'true' });
            res.json({ users });
        } catch (error) {
            next(error);
        }
    });

    router.post('/users', async (req, res, next) => {
        try {
            const user = await db.createUser({
                username: requireUsername(req.body?.username),
                password: requirePassword(req.body?.password),
                displayName: requireText(req.body?.displayName, 'displayName', 80),
                role: requireRole(req.body?.role ?? 'member'),
                cursorColor: optionalColor(req.body?.cursorColor, 'cursorColor') ?? '#c8502a'
            });

            await audit(req, { action: 'user.created', targetType: 'user', targetID: user.id, detail: { username: user.username, role: user.role } });

            res.status(201).json(user);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/users/:id', async (req, res, next) => {
        try {
            const userID = requireID(req.params.id, 'id');

            if (userID === req.user.id) {
                return res.status(400).json({ error: 'You cannot delete your own account' });
            }

            const target = await db.getUserByID(userID);
            if (!target) return res.status(404).json({ error: 'Not found' });

            if (target.role === 'admin' && await db.countAdmins() <= 1) {
                return res.status(400).json({ error: 'Cannot delete the last remaining admin' });
            }

            const result = await db.deleteUser(userID);

            await audit(req, {
                action: 'user.deleted',
                targetType: 'user',
                targetID: userID,
                detail: { username: target.username, workspaces: result.workspaces }
            });

            res.json({ deleted: userID, workspaces: result.workspaces });
        } catch (error) {
            next(error);
        }
    });

    router.put('/users/:id/password', async (req, res, next) => {
        try {
            const userID = requireID(req.params.id, 'id');
            const password = requirePassword(req.body?.password);

            const target = await db.getUserByID(userID);
            if (!target) return res.status(404).json({ error: 'Not found' });

            await db.setUserPassword(userID, password);
            await db.deleteSessionsForUser(userID);

            await audit(req, {
                action: 'password.reset',
                targetType: 'user',
                targetID: userID,
                detail: { username: target.username }
            });

            res.json({ reset: userID });
        } catch (error) {
            next(error);
        }
    });

    router.post('/users/:id/restore', async (req, res, next) => {
        try {
            const userID = requireID(req.params.id, 'id');
            const result = await db.restoreUser(userID);

            if (!result.restored) return res.status(404).json({ error: 'Not found' });

            await audit(req, {
                action: 'user.restored',
                targetType: 'user',
                targetID: userID,
                detail: { workspaces: result.workspaces }
            });

            res.json({ restored: userID, workspaces: result.workspaces });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/users/:id/purge', async (req, res, next) => {
        try {
            const userID = requireID(req.params.id, 'id');
            const purged = await db.purgeUser(userID);

            if (!purged) return res.status(404).json({ error: 'Not found' });

            await audit(req, { action: 'user.purged', targetType: 'user', targetID: userID });

            res.json({ purged: userID });
        } catch (error) {
            next(error);
        }
    });

    // workspace routes
    router.get('/workspaces', async (req, res, next) => {
        try {
            const workspaces = await db.getAllWorkspaces({ includeDeleted: req.query.includeDeleted === 'true' });
            res.json({ workspaces });
        } catch (error) {
            next(error);
        }
    });

    router.post('/workspaces/:id/restore', async (req, res, next) => {
        try {
            const workspaceID = requireID(req.params.id, 'id');
            const restored = await db.restoreWorkspace(workspaceID);

            if (!restored) return res.status(404).json({ error: 'Not found' });

            await audit(req, { action: 'workspace.restored', targetType: 'workspace', targetID: workspaceID });

            res.json({ restored: workspaceID });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/workspaces/:id/purge', async (req, res, next) => {
        try {
            const workspaceID = requireID(req.params.id, 'id');
            const purged = await db.purgeWorkspace(workspaceID);

            if (!purged) return res.status(404).json({ error: 'Not found' });

            await audit(req, { action: 'workspace.purged', targetType: 'workspace', targetID: workspaceID });

            res.json({ purged: workspaceID });
        } catch (error) {
            next(error);
        }
    });

    // audit routes
    router.get('/audit', async (req, res, next) => {
        try {
            const entries = await db.getAuditLog({
                limit: Number(req.query.limit) || 100,
                action: req.query.action || null
            });

            res.json({ entries });
        } catch (error) {
            next(error);
        }
    });

    // export routes
    router.get('/export', async (req, res, next) => {
        try {
            const data = await db.exportAll();
            const stamp = new Date().toISOString().slice(0, 10);

            await audit(req, { action: 'data.exported' });

            res.setHeader('Content-Disposition', `attachment; filename="nodelit-export-${stamp}.json"`);
            res.json(data);
        } catch (error) {
            next(error);
        }
    });

    return router;
}
