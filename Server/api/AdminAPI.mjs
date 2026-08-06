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

// router configuration
export default function createAdminRouter(authz) {
    const router = Router();

    router.use(authz.requireAdmin());

    // user routes
    router.get('/users', async (req, res, next) => {
        try {
            const users = await db.getAllUsers();
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

            await db.deleteUser(userID);
            res.json({ deleted: userID });
        } catch (error) {
            next(error);
        }
    });

    // export routes
    router.get('/export', async (req, res, next) => {
        try {
            const data = await db.exportAll();
            const stamp = new Date().toISOString().slice(0, 10);

            res.setHeader('Content-Disposition', `attachment; filename="nodelit-export-${stamp}.json"`);
            res.json(data);
        } catch (error) {
            next(error);
        }
    });

    return router;
}
