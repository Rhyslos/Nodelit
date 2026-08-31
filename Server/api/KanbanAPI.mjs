// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import { broadcastKanbanChange } from '../modules/Networking.mjs';
import {
    requireID,
    optionalID,
    optionalColor,
    optionalText,
    optionalInteger,
    optionalBoolean,
    optionalDate,
    optionalChecklists,
    optionalIDList,
    requireIDList,
    requireColor,
    requireInteger,
    requireTaskReorder,
    requireListReorder,
    requireTabReorder
} from '../modules/Validation.mjs';

// configuration constants
const STATS_WEEKS = 26;
const STATS_MAX_WEEKS = 104;
const STATS_CACHE_MS = 60000;
const TRACKED_LIMIT = 5;

// utility functions
const statsCache = new Map();

function cachedStats(key) {
    const entry = statsCache.get(key);
    if (!entry || Date.now() - entry.at > STATS_CACHE_MS) return null;

    return entry.value;
}

function storeStats(key, value) {
    if (statsCache.size > 64) statsCache.clear();
    statsCache.set(key, { at: Date.now(), value });
}

function clearStats(workspaceID) {
    for (const key of statsCache.keys()) {
        if (key.startsWith(`${workspaceID}:`)) statsCache.delete(key);
    }
}

function emptyCollections() {
    return { tabs: [], tabGroups: [], columns: [], lists: [], tasks: [], tags: [] };
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
    clearStats(req.workspaceID);
    broadcastKanbanChange(req.workspaceID, buildDelta(changes), originOf(req));
}

// configuration constants
const EDIT_ROLES = new Set(['owner', 'member']);

// router configuration
export default function createKanbanRouter(authz) {
    const router = Router();

    // batch scope middleware
    function resolveBatchScope(resolveEntities, targetField, resolveTargets) {
        return async (req, res, next) => {
            try {
                const updates = req.batchUpdates;

                const entityIDs = [...new Set(updates.map(update => update.id))];
                const entities = await resolveEntities(entityIDs);

                if (entities.found !== entityIDs.length || entities.workspaceIDs.length !== 1) {
                    return res.status(404).json({ error: 'Not found' });
                }

                const anchor = entities.workspaceIDs[0];
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

                const targetIDs = [...new Set(updates.map(update => update[targetField]).filter(Boolean))];

                if (targetIDs.length > 0) {
                    const targets = await resolveTargets(targetIDs);

                    if (targets.found !== targetIDs.length
                        || targets.workspaceIDs.length !== 1
                        || targets.workspaceIDs[0] !== anchor) {
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
    router.post('/tabs', authz.workspaceBodyEdit(), async (req, res, next) => {
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

    router.put('/tabs/reorder',
        parseBatch(requireTabReorder),
        resolveBatchScope(ids => db.getWorkspaceScopeForTabs(ids), 'groupID', ids => db.getWorkspaceScopeForTabGroups(ids)),
        async (req, res, next) => {
            try {
                const { tabs, tags, lists, tasks, removed } = await db.reorderTabs(
                    req.batchUpdates,
                    req.body?.combineTags === true
                );

                publish(req, { upsert: { tabs, tags, lists, tasks }, remove: removed });
                res.json({ tabs, tags, lists, tasks, removed });
            } catch (error) {
                next(error);
            }
        });

    router.put('/tabs/:id', authz.tabEdit(), async (req, res, next) => {
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

    router.delete('/tabs/:id', authz.tabEdit(), async (req, res, next) => {
        try {
            const { removed, tabs } = await db.deleteTab(req.params.id);

            publish(req, { upsert: { tabs }, remove: removed });
            res.json({ removed, tabs });
        } catch (error) {
            next(error);
        }
    });

    // tab group routes
    router.post('/tab-groups', authz.workspaceBodyEdit(), async (req, res, next) => {
        try {
            const { group, tabs, tags, lists, tasks, removed } = await db.createTabGroup(
                req.workspaceID,
                {
                    name: optionalText(req.body?.name, 'name', 80) ?? 'New group',
                    color: optionalColor(req.body?.color, 'color')
                },
                requireIDList(req.body?.tabIDs, 'tabIDs', 100),
                req.body?.combineTags === true
            );

            if (!group) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { tabGroups: [group], tabs, tags, lists, tasks }, remove: removed });
            res.status(201).json({ group, tabs, tags, lists, tasks, removed });
        } catch (error) {
            next(error);
        }
    });

    router.put('/tab-groups/:id', authz.tabGroupEdit(), async (req, res, next) => {
        try {
            const group = await db.updateTabGroup(req.params.id, {
                name: optionalText(req.body?.name, 'name', 80),
                color: optionalColor(req.body?.color, 'color')
            });

            if (!group) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { tabGroups: [group] } });
            res.json(group);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/tab-groups/:id', authz.tabGroupEdit(), async (req, res, next) => {
        try {
            const { removed, tabs, tags, lists, tasks } = await db.deleteTabGroup(req.params.id);

            publish(req, { upsert: { tabs, tags, lists, tasks }, remove: removed });
            res.json({ removed, tabs, tags, lists, tasks });
        } catch (error) {
            next(error);
        }
    });

    // column routes
    router.post('/columns', authz.tabEdit('tabID'), async (req, res, next) => {
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

    router.delete('/columns/:id', authz.columnEdit(), async (req, res, next) => {
        try {
            const { removed, columns } = await db.deleteColumn(req.params.id);

            publish(req, { upsert: { columns }, remove: removed });
            res.json({ removed, columns });
        } catch (error) {
            next(error);
        }
    });

    // list routes
    router.post('/lists', authz.columnEdit('columnID'), async (req, res, next) => {
        try {
            const columnID = requireID(req.body?.columnID, 'columnID');

            const list = await db.createList(columnID, {
                name: optionalText(req.body?.name, 'name', 80) ?? 'New list',
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
        resolveBatchScope(ids => db.getWorkspaceScopeForLists(ids), 'columnID', ids => db.getWorkspaceScopeForColumns(ids)),
        async (req, res, next) => {
            try {
                const { lists, columns, removed } = await db.reorderLists(req.batchUpdates);

                publish(req, { upsert: { lists, columns }, remove: removed });
                res.json({ lists, columns, removed });
            } catch (error) {
                next(error);
            }
        });

    router.put('/lists/:id', authz.listEdit(), async (req, res, next) => {
        try {
            const changes = {
                name: optionalText(req.body?.name, 'name', 80),
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

    router.delete('/lists/:id', authz.listEdit(), async (req, res, next) => {
        try {
            const { removed, columns } = await db.deleteList(req.params.id);

            publish(req, { upsert: { columns }, remove: removed });
            res.json({ removed, columns });
        } catch (error) {
            next(error);
        }
    });

    // task routes
    router.post('/tasks', authz.listEdit('listID'), async (req, res, next) => {
        try {
            const task = await db.createTask(requireID(req.body?.listID, 'listID'), {
                title: optionalText(req.body?.title, 'title', 200),
                description: optionalText(req.body?.description, 'description', 5000)
            });

            publish(req, { upsert: { tasks: [task] } });
            res.status(201).json(task);
        } catch (error) {
            next(error);
        }
    });

    router.put('/tasks/reorder',
        parseBatch(requireTaskReorder),
        resolveBatchScope(ids => db.getWorkspaceScopeForTasks(ids), 'listID', ids => db.getWorkspaceScopeForLists(ids)),
        async (req, res, next) => {
            try {
                const tasks = await db.reorderTasks(req.batchUpdates);

                publish(req, { upsert: { tasks } });
                res.json({ tasks });
            } catch (error) {
                next(error);
            }
        });

    router.put('/tasks/:id', authz.taskEdit(), async (req, res, next) => {
        try {
            const changes = {
                title: optionalText(req.body?.title, 'title', 200),
                description: optionalText(req.body?.description, 'description', 5000),
                isCompleted: optionalBoolean(req.body?.isCompleted, 'isCompleted'),
                deadline: optionalDate(req.body?.deadline, 'deadline'),
                checklists: optionalChecklists(req.body?.checklists, 'checklists'),
                assignedUsers: optionalIDList(req.body?.assignedUsers, 'assignedUsers')
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

    router.delete('/tasks/:id', authz.taskEdit(), async (req, res, next) => {
        try {
            const removed = await db.deleteTask(req.params.id);

            publish(req, { remove: removed });
            res.json({ removed });
        } catch (error) {
            next(error);
        }
    });

    // tag routes
    // statistics routes
    router.get('/:workspaceID/stats', authz.workspaceParam('workspaceID'), async (req, res, next) => {
        try {
            const requested = Number.parseInt(req.query?.weeks, 10);

            const weeks = Number.isInteger(requested)
                ? Math.min(Math.max(requested, 1), STATS_MAX_WEEKS)
                : STATS_WEEKS;

            const key = `${req.workspaceID}:${weeks}`;
            const cached = cachedStats(key);

            if (cached) {
                res.setHeader('X-Stats-Cache', 'hit');
                return res.json(cached);
            }

            const stats = await db.getWorkspaceStats(req.workspaceID, weeks);
            storeStats(key, stats);

            res.setHeader('X-Stats-Cache', 'miss');
            res.json(stats);
        } catch (error) {
            next(error);
        }
    });

    router.post('/tracked', authz.workspaceBodyEdit(), async (req, res, next) => {
        try {
            const taskID = requireID(req.body?.taskID, 'taskID');
            const added = await db.addTrackedTask(req.workspaceID, taskID, req.user.id, TRACKED_LIMIT);

            if (!added) {
                return res.status(409).json({
                    error: `You can track up to ${TRACKED_LIMIT} tasks, and only tasks from this workspace`
                });
            }

            publish(req, {});
            res.status(201).json(added);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/tracked/:id', authz.taskEdit(), async (req, res, next) => {
        try {
            const removed = await db.removeTrackedTask(req.workspaceID, req.params.id);

            if (!removed) {
                return res.status(404).json({ error: 'Not found' });
            }

            publish(req, {});
            res.json(removed);
        } catch (error) {
            next(error);
        }
    });

    router.get('/tags/:workspaceID', authz.workspaceParam(), async (req, res, next) => {
        try {
            const board = await db.getWorkspaceData(req.workspaceID);

            res.json({
                tags: board.tags,
                tabs: board.tabs,
                tabGroups: board.tabGroups
            });
        } catch (error) {
            next(error);
        }
    });

    router.post('/tags', authz.workspaceBodyEdit(), async (req, res, next) => {
        try {
            const tag = await db.createTag(
                req.workspaceID,
                optionalText(req.body?.name, 'name', 40) ?? '',
                requireColor(req.body?.color, 'color'),
                {
                    tabID: optionalID(req.body?.tabID, 'tabID') ?? null,
                    groupID: optionalID(req.body?.groupID, 'groupID') ?? null
                }
            );

            publish(req, { upsert: { tags: [tag] } });
            res.status(201).json(tag);
        } catch (error) {
            next(error);
        }
    });

    router.put('/tags/:id', authz.requireEditor(req => db.getWorkspaceIDForTag(req.params.id)), async (req, res, next) => {
        try {
            const scope = req.body?.scope === undefined ? undefined : {
                tabID: optionalID(req.body.scope?.tabID, 'scope.tabID') ?? null,
                groupID: optionalID(req.body.scope?.groupID, 'scope.groupID') ?? null
            };

            const tag = await db.updateTag(req.params.id, {
                name: req.body?.name === undefined ? undefined : (optionalText(req.body.name, 'name', 40) ?? ''),
                color: req.body?.color === undefined ? undefined : requireColor(req.body.color, 'color'),
                scope
            });

            if (!tag) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { tags: [tag] } });
            res.json(tag);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/tags/:id', authz.requireEditor(req => db.getWorkspaceIDForTag(req.params.id)), async (req, res, next) => {
        try {
            const { removed, lists, tasks } = await db.deleteTag(req.params.id);

            publish(req, { upsert: { lists, tasks }, remove: removed });
            res.json({ removed, lists, tasks });
        } catch (error) {
            next(error);
        }
    });

    router.put('/lists/:id/tags', authz.listEdit(), async (req, res, next) => {
        try {
            const tagIDs = optionalIDList(req.body?.tagIDs, 'tagIDs') ?? [];
            const { list, tasks } = await db.setListTags(req.params.id, tagIDs);

            if (!list) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { lists: [list], tasks } });
            res.json({ list, tasks });
        } catch (error) {
            next(error);
        }
    });

    router.put('/tasks/:id/tags', authz.taskEdit(), async (req, res, next) => {
        try {
            const tagIDs = optionalIDList(req.body?.tagIDs, 'tagIDs') ?? [];
            const task = await db.setTaskTags(req.params.id, tagIDs);

            if (!task) return res.status(404).json({ error: 'Not found' });

            publish(req, { upsert: { tasks: [task] } });
            res.json(task);
        } catch (error) {
            next(error);
        }
    });

    // retrieval routes
    router.get('/:workspaceID', authz.workspaceParam(), async (req, res, next) => {
        try {
            const board = await db.getWorkspaceData(req.workspaceID);
            res.json({ ...board, memberRole: req.membership.role });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
