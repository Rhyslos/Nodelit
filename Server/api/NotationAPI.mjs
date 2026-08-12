// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import { broadcastNotationChange } from '../modules/Networking.mjs';
import {
    requireID,
    requireText,
    optionalID,
    optionalColor,
    optionalInteger,
    requireNotationPageReorder
} from '../modules/Validation.mjs';

// utility functions
function emptyCollections() {
    return { groups: [], pages: [] };
}

function buildDelta({ upsert = {}, remove = {} } = {}) {
    return {
        upsert: { ...emptyCollections(), ...upsert },
        remove: { ...emptyCollections(), ...remove }
    };
}

function originOf(req) {
    const header = req.headers['x-client-id'];
    return typeof header === 'string' ? header.slice(0, 64) : null;
}

function publish(req, changes) {
    broadcastNotationChange(req.workspaceID, buildDelta(changes), originOf(req));
}

// audit functions
function audit(req, entry) {
    return db.recordAudit({
        actorID: req.user?.id,
        actorName: req.user?.username,
        ip: req.ip,
        ...entry
    });
}

// configuration constants
const EDIT_ROLES = new Set(['owner', 'member']);
const MAX_GROUP_NAME = 60;
const MAX_PAGE_TITLE = 120;

// router configuration
export default function createNotationRouter(authz) {
    const router = Router();

    // batch scope middleware
    function parseBatch(parser) {
        return (req, res, next) => {
            try {
                req.batchUpdates = parser(req.body?.updates);
                next();
            } catch (error) {
                next(error);
            }
        };
    }

    function resolvePageBatchScope() {
        return async (req, res, next) => {
            try {
                const updates = req.batchUpdates;

                const pageIDs = [...new Set(updates.map(update => update.id))];
                const pages = await db.getNotationPageScope(pageIDs);

                if (pages.found !== pageIDs.length || pages.workspaceIDs.length !== 1) {
                    return res.status(404).json({ error: 'Not found' });
                }

                const anchor = pages.workspaceIDs[0];
                const membership = await db.getMembership(anchor, req.user.id);

                if (!membership) {
                    return res.status(404).json({ error: 'Not found' });
                }

                if (!EDIT_ROLES.has(membership.role)) {
                    return res.status(403).json({ error: 'You have read only access to this workspace' });
                }

                const groupIDs = [...new Set(updates.map(update => update.groupID).filter(Boolean))];

                if (groupIDs.length > 0) {
                    const groups = await db.getNotationGroupScope(groupIDs);

                    if (groups.found !== groupIDs.length
                        || groups.workspaceIDs.length !== 1
                        || groups.workspaceIDs[0] !== anchor) {
                        return res.status(403).json({ error: 'Forbidden' });
                    }
                }

                req.workspaceID = anchor;
                next();
            } catch (error) {
                next(error);
            }
        };
    }

    // group routes
    router.post('/groups', authz.workspaceBodyEdit(), async (req, res, next) => {
        try {
            const group = await db.createNotationGroup(req.workspaceID, {
                name: req.body?.name === undefined
                    ? 'New group'
                    : requireText(req.body.name, 'name', MAX_GROUP_NAME),
                color: optionalColor(req.body?.color, 'color'),
                groupOrder: optionalInteger(req.body?.groupOrder, 'groupOrder')
            });

            publish(req, { upsert: { groups: [group] } });
            res.status(201).json(group);
        } catch (error) {
            next(error);
        }
    });

    router.put('/groups/:id', authz.notationGroupEdit(), async (req, res, next) => {
        try {
            const groupID = requireID(req.params.id, 'id');

            const changes = {
                name: req.body?.name === undefined
                    ? undefined
                    : requireText(req.body.name, 'name', MAX_GROUP_NAME),
                color: optionalColor(req.body?.color, 'color'),
                groupOrder: optionalInteger(req.body?.groupOrder, 'groupOrder')
            };

            const group = await db.updateNotationGroup(groupID, changes);
            if (!group) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { groups: [group] } });
            res.json(group);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/groups/:id', authz.notationGroupEdit(), async (req, res, next) => {
        try {
            const groupID = requireID(req.params.id, 'id');
            const target = await db.getNotationGroup(groupID);

            const { removed, pages } = await db.deleteNotationGroup(groupID);

            if (removed.groups.length > 0) {
                await audit(req, {
                    action: 'notation.group_deleted',
                    targetType: 'notation_group',
                    targetID: groupID,
                    detail: { workspaceID: req.workspaceID, name: target?.name, orphanedPages: pages.length }
                });
            }

            publish(req, { upsert: { pages }, remove: removed });
            res.json({ removed, pages });
        } catch (error) {
            next(error);
        }
    });

    // page routes
    router.post('/pages', authz.workspaceBodyEdit(), async (req, res, next) => {
        try {
            const page = await db.createNotationPage(req.workspaceID, {
                title: req.body?.title === undefined
                    ? 'Untitled'
                    : requireText(req.body.title, 'title', MAX_PAGE_TITLE),
                groupID: optionalID(req.body?.groupID, 'groupID'),
                pageOrder: optionalInteger(req.body?.pageOrder, 'pageOrder')
            });

            if (!page) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { pages: [page] } });
            res.status(201).json(page);
        } catch (error) {
            next(error);
        }
    });

    router.put('/pages/reorder',
        parseBatch(requireNotationPageReorder),
        resolvePageBatchScope(),
        async (req, res, next) => {
            try {
                const pages = await db.reorderNotationPages(req.batchUpdates);

                publish(req, { upsert: { pages } });
                res.json({ pages });
            } catch (error) {
                next(error);
            }
        });

    router.put('/pages/:id', authz.notationPageEdit(), async (req, res, next) => {
        try {
            const pageID = requireID(req.params.id, 'id');

            const changes = {
                title: req.body?.title === undefined
                    ? undefined
                    : requireText(req.body.title, 'title', MAX_PAGE_TITLE),
                groupID: req.body?.groupID === undefined
                    ? undefined
                    : optionalID(req.body.groupID, 'groupID'),
                pageOrder: optionalInteger(req.body?.pageOrder, 'pageOrder')
            };

            const page = await db.updateNotationPage(pageID, changes, req.workspaceID);
            if (!page) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { pages: [page] } });
            res.json(page);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/pages/:id', authz.notationPageEdit(), async (req, res, next) => {
        try {
            const pageID = requireID(req.params.id, 'id');
            const target = await db.getNotationPage(pageID);

            const removed = await db.deleteNotationPage(pageID);

            if (removed.pages.length > 0) {
                await audit(req, {
                    action: 'notation.page_deleted',
                    targetType: 'notation_page',
                    targetID: pageID,
                    detail: { workspaceID: req.workspaceID, title: target?.title }
                });
            }

            publish(req, { remove: removed });
            res.json({ removed });
        } catch (error) {
            next(error);
        }
    });

    // retrieval routes
    router.get('/:workspaceID', authz.workspaceParam(), async (req, res, next) => {
        try {
            const notation = await db.getNotationData(req.workspaceID);
            res.json({ ...notation, memberRole: req.membership.role });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
