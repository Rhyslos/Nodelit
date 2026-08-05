// import modules
import { Router } from 'express';
import db from '../database/renameforthesakeoffixingatype.mjs';
import { requireText, optionalID, optionalColor } from '../modules/Validation.mjs';

// router configuration
export default function createWorkspaceRouter(authz) {
    const router = Router();

    // category routes
    router.post('/categories', async (req, res, next) => {
        try {
            const name = requireText(req.body?.name, 'name', 60);
            const color = optionalColor(req.body?.color, 'color') ?? '#c8502a';

            const category = await db.createCategory(req.user.id, name, color);
            res.status(201).json(category);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/categories/:id', async (req, res, next) => {
        try {
            const category = await db.getCategory(req.params.id);

            if (!category || category.userID !== req.user.id) {
                return res.status(404).json({ error: 'Not found' });
            }

            await db.deleteCategory(req.params.id);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    });

    // workspace routes
    router.get('/', async (req, res, next) => {
        try {
            const [workspaces, categories] = await Promise.all([
                db.getWorkspacesForUser(req.user.id),
                db.getCategoriesForUser(req.user.id)
            ]);

            res.json({ workspaces, categories });
        } catch (error) {
            next(error);
        }
    });

    router.post('/', async (req, res, next) => {
        try {
            const name = requireText(req.body?.name, 'name', 80);
            const categoryID = optionalID(req.body?.categoryID, 'categoryID');

            if (categoryID) {
                const category = await db.getCategory(categoryID);
                if (!category || category.userID !== req.user.id) {
                    return res.status(404).json({ error: 'That category no longer exists' });
                }
            }

            const workspace = await db.createWorkspace(req.user.id, name, categoryID);
            res.status(201).json(workspace);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:workspaceID', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            await db.deleteWorkspace(req.workspaceID);
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    });

    // membership routes
    router.get('/:workspaceID/members', authz.workspaceParam(), async (req, res, next) => {
        try {
            res.json({ members: await db.getMembers(req.workspaceID) });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
