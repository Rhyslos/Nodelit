// import modules
import { Router, raw } from 'express';
import db from '../database/Database.mjs';
import { broadcastNotationChange } from '../modules/Networking.mjs';
import { closeRoom } from '../modules/Collaboration.mjs';
import {
    requireID,
    requireText,
    optionalID,
    optionalColor,
    optionalInteger,
    optionalNotationLayout,
    requireNotationGroupReorder,
    requireNotationPageReorder,
    detectImageMime,
    requireDimension
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
const MAX_SEARCH_TERM = 100;

// router configuration
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const IMAGE_LIMIT = '2mb';
const IMAGE_CACHE = 'private, max-age=31536000, immutable';

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
                const workspace = await db.getWorkspace(anchor);

                if (!workspace) {
                    return res.status(404).json({ error: 'Not found' });
                }

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

    function resolveGroupBatchScope() {
        return async (req, res, next) => {
            try {
                const groupIDs = [...new Set(req.batchUpdates.map(update => update.id))];
                const groups = await db.getNotationGroupScope(groupIDs);

                if (groups.found !== groupIDs.length || groups.workspaceIDs.length !== 1) {
                    return res.status(404).json({ error: 'Not found' });
                }

                const anchor = groups.workspaceIDs[0];
                const workspace = await db.getWorkspace(anchor);

                if (!workspace) {
                    return res.status(404).json({ error: 'Not found' });
                }

                const membership = await db.getMembership(anchor, req.user.id);

                if (!membership) {
                    return res.status(404).json({ error: 'Not found' });
                }

                if (!EDIT_ROLES.has(membership.role)) {
                    return res.status(403).json({ error: 'You have read only access to this workspace' });
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
                groupOrder: optionalInteger(req.body?.groupOrder, 'groupOrder'),
                parentID: optionalID(req.body?.parentID, 'parentID') ?? null
            });

            publish(req, { upsert: { groups: [group] } });
            res.status(201).json(group);
        } catch (error) {
            next(error);
        }
    });

    router.put('/groups/reorder',
        parseBatch(requireNotationGroupReorder),
        resolveGroupBatchScope(),
        async (req, res, next) => {
            try {
                const groups = await db.reorderNotationGroups(req.batchUpdates);

                publish(req, { upsert: { groups } });
                res.json({ groups });
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
                groupOrder: optionalInteger(req.body?.groupOrder, 'groupOrder'),
                parentID: req.body?.parentID === undefined
                    ? undefined
                    : (optionalID(req.body.parentID, 'parentID') ?? null)
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

            const { removed, pages, groups } = await db.deleteNotationGroup(groupID);

            if (removed.groups.length > 0) {
                await audit(req, {
                    action: 'notation.group_deleted',
                    targetType: 'notation_group',
                    targetID: groupID,
                    detail: { workspaceID: req.workspaceID, name: target?.name, orphanedPages: pages.length }
                });
            }

            publish(req, { upsert: { pages, groups }, remove: removed });
            res.json({ removed, pages, groups });
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
                pageOrder: optionalInteger(req.body?.pageOrder, 'pageOrder'),
                layout: optionalNotationLayout(req.body?.layout, 'layout')
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
                closeRoom(pageID);

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
    // image routes
    router.post('/:workspaceID/images',
        authz.workspaceParamEdit('workspaceID'),
        raw({ type: IMAGE_MIMES, limit: IMAGE_LIMIT }),
        async (req, res, next) => {
            try {
                if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
                    return res.status(400).json({ error: 'No image data received' });
                }

                const image = await db.createNotationImage(
                    req.workspaceID,
                    req.user.id,
                    {
                        mime: detectImageMime(req.body),
                        width: requireDimension(req.query?.width, 'width'),
                        height: requireDimension(req.query?.height, 'height')
                    },
                    req.body
                );

                res.status(201).json(image);
            } catch (error) {
                next(error);
            }
        });

    router.get('/images/:id', authz.notationImageAccess(), async (req, res, next) => {
        try {
            const record = await db.getNotationImageBytes(req.params.id);
            if (!record) return res.status(404).json({ error: 'Not found' });

            res.setHeader('Content-Type', record.mime);
            res.setHeader('Cache-Control', IMAGE_CACHE);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Disposition', 'inline');
            res.setHeader('ETag', `"${req.params.id}"`);

            res.send(record.bytes);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/images/:id', authz.notationImageEdit(), async (req, res, next) => {
        try {
            const removed = await db.deleteNotationImage(req.params.id);
            if (!removed) return res.status(404).json({ error: 'Not found' });

            res.json({ removed: [req.params.id] });
        } catch (error) {
            next(error);
        }
    });

    router.get('/:workspaceID/search', authz.workspaceParam(), async (req, res, next) => {
        try {
            const term = requireText(req.query.q, 'q', MAX_SEARCH_TERM);
            const pages = await db.searchNotationContent(req.workspaceID, term);

            res.json({ pages });
        } catch (error) {
            next(error);
        }
    });

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
