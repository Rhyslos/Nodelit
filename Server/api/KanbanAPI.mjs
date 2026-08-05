// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import { broadcastKanbanChange } from '../modules/Networking.mjs';
import {
    requireID,
    optionalText,
    optionalColor,
    optionalInteger,
    optionalBoolean,
    optionalDate,
    optionalSubtasks,
    requireInteger,
    requireTaskReorder,
    requireListReorder
} from '../modules/Validation.mjs';

// utility functions
function emptyCollections() {
    return { tabs: [], columns: [], lists: [], tasks: [] };
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
    broadcastKanbanChange(req.workspaceID, buildDelta(changes), originOf(req));
}

// router configuration
export default function createKanbanRouter(authz) {
    const router = Router();

    // batch scope middleware
    function resolveBatchScope(resolveEntity, extraFields = []) {
        return async (req, res, next) => {
            try {
                const updates = req.batchUpdates;
                const anchor = await resolveEntity(updates[0].id);

                if (!anchor) return res.status(404).json({ error: 'Not found' });
                if (!await db.isMember(anchor, req.user.id)) return res.status(404).json({ error: 'Not found' });

                for (const update of updates.slice(1)) {
                    const owner = await resolveEntity(update.id);
                    if (owner !== anchor) return res.status(403).json({ error: 'Forbidden' });
                }

                for (const field of extraFields) {
                    for (const update of updates) {
                        const owner = field === 'listID'
                            ? await db.getWorkspaceIDForList(update.listID)
                            : await db.getWorkspaceIDForColumn(update.columnID);
                        if (owner !== anchor) return res.status(403).json({ error: 'Forbidden' });
                    }
                }

                req.workspaceID = anchor;
                next();
            } catch (error) {
                next(error);
            }
        };
    }

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

    // tab routes
    router.post('/tabs', authz.workspaceBody(), async (req, res, next) => {
        try {
            const tab = await db.createTab(req.workspaceID, {
                name: optionalText(req.body?.name, 'name', 80) ?? 'New Board',
                color: optionalColor(req.body?.color, 'color'),
                tabOrder: optionalInteger(req.body?.tabOrder, 'tabOrder')
            });

            publish(req, { upsert: { tabs: [tab] } });
            res.status(201).json(tab);
        } catch (error) {
            next(error);
        }
    });

    router.put('/tabs/:id', authz.tabAccess(), async (req, res, next) => {
        try {
            const changes = {
                name: optionalText(req.body?.name, 'name', 80),
                color: optionalColor(req.body?.color, 'color'),
                tabOrder: optionalInteger(req.body?.tabOrder, 'tabOrder'),
                isArchived: optionalBoolean(req.body?.isArchived, 'isArchived')
            };

            const tab = await db.updateTab(req.params.id, changes);
            if (!tab) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { tabs: [tab] } });
            res.json(tab);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/tabs/:id', authz.tabAccess(), async (req, res, next) => {
        try {
            const removed = await db.deleteTab(req.params.id);

            publish(req, { remove: removed });
            res.json({ removed });
        } catch (error) {
            next(error);
        }
    });

    // column routes
    router.post('/columns', authz.tabAccess('tabID'), async (req, res, next) => {
        try {
            const tabID = requireID(req.body?.tabID, 'tabID');
            const columnIndex = requireInteger(req.body?.columnIndex, 'columnIndex', { min: 0, max: 500 });

            const existing = await db.getColumnByIndex(tabID, columnIndex);
            if (existing) return res.json(existing);

            const column = await db.createColumn(tabID, columnIndex);

            publish(req, { upsert: { columns: [column] } });
            res.status(201).json(column);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/columns/:id', authz.columnAccess(), async (req, res, next) => {
        try {
            const { removed, columns } = await db.deleteColumn(req.params.id);

            publish(req, { upsert: { columns }, remove: removed });
            res.json({ removed, columns });
        } catch (error) {
            next(error);
        }
    });

    // list routes
    router.post('/lists', authz.columnAccess('columnID'), async (req, res, next) => {
        try {
            const columnID = requireID(req.body?.columnID, 'columnID');

            const list = await db.createList(columnID, {
                name: optionalText(req.body?.name, 'name', 80) ?? 'New list',
                category: optionalText(req.body?.category, 'category', 80),
                color: optionalColor(req.body?.color, 'color'),
                listOrder: optionalInteger(req.body?.listOrder, 'listOrder')
            });

            publish(req, { upsert: { lists: [list] } });
            res.status(201).json(list);
        } catch (error) {
            next(error);
        }
    });

    router.put('/lists/reorder',
        parseBatch(requireListReorder),
        resolveBatchScope(id => db.getWorkspaceIDForList(id), ['columnID']),
        async (req, res, next) => {
            try {
                const { lists, columns, removed } = await db.reorderLists(req.batchUpdates);

                publish(req, { upsert: { lists, columns }, remove: removed });
                res.json({ lists, columns, removed });
            } catch (error) {
                next(error);
            }
        });

    router.put('/lists/:id', authz.listAccess(), async (req, res, next) => {
        try {
            const changes = {
                name: optionalText(req.body?.name, 'name', 80),
                category: optionalText(req.body?.category, 'category', 80),
                color: optionalColor(req.body?.color, 'color'),
                listOrder: optionalInteger(req.body?.listOrder, 'listOrder')
            };

            const list = await db.updateList(req.params.id, changes);
            if (!list) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { lists: [list] } });
            res.json(list);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/lists/:id', authz.listAccess(), async (req, res, next) => {
        try {
            const { removed, columns } = await db.deleteList(req.params.id);

            publish(req, { upsert: { columns }, remove: removed });
            res.json({ removed, columns });
        } catch (error) {
            next(error);
        }
    });

    // task routes
    router.post('/tasks', authz.listAccess('listID'), async (req, res, next) => {
        try {
            const task = await db.createTask(requireID(req.body?.listID, 'listID'), {
                title: optionalText(req.body?.title, 'title', 200) ?? '',
                description: optionalText(req.body?.description, 'description', 5000) ?? '',
                category: optionalText(req.body?.category, 'category', 80),
                color: optionalColor(req.body?.color, 'color')
            });

            publish(req, { upsert: { tasks: [task] } });
            res.status(201).json(task);
        } catch (error) {
            next(error);
        }
    });

    router.put('/tasks/reorder',
        parseBatch(requireTaskReorder),
        resolveBatchScope(id => db.getWorkspaceIDForTask(id), ['listID']),
        async (req, res, next) => {
            try {
                const tasks = await db.reorderTasks(req.batchUpdates);

                publish(req, { upsert: { tasks } });
                res.json({ tasks });
            } catch (error) {
                next(error);
            }
        });

    router.put('/tasks/:id', authz.taskAccess(), async (req, res, next) => {
        try {
            const changes = {
                title: optionalText(req.body?.title, 'title', 200),
                description: optionalText(req.body?.description, 'description', 5000),
                isCompleted: optionalBoolean(req.body?.isCompleted, 'isCompleted'),
                category: optionalText(req.body?.category, 'category', 80),
                color: optionalColor(req.body?.color, 'color'),
                deadline: optionalDate(req.body?.deadline, 'deadline'),
                subtasks: optionalSubtasks(req.body?.subtasks, 'subtasks')
            };

            const expectedUpdatedAt = typeof req.body?.updatedAt === 'string' ? req.body.updatedAt : undefined;
            const result = await db.updateTask(req.params.id, changes, expectedUpdatedAt);

            if (result.error) {
                return res.status(result.status).json({ error: result.error, record: result.record });
            }

            publish(req, { upsert: { tasks: [result.record] } });
            res.json(result.record);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/tasks/:id', authz.taskAccess(), async (req, res, next) => {
        try {
            const removed = await db.deleteTask(req.params.id);

            publish(req, { remove: removed });
            res.json({ removed });
        } catch (error) {
            next(error);
        }
    });

    // retrieval routes
    router.get('/:workspaceID', authz.workspaceParam(), async (req, res, next) => {
        try {
            res.json(await db.getWorkspaceData(req.workspaceID));
        } catch (error) {
            next(error);
        }
    });

    return router;
}
