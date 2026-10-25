// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import { broadcastKanbanChange, broadcastNotationChange, broadcastToWorkspace } from '../modules/Networking.mjs';
import { closeRoom } from '../modules/Collaboration.mjs';
import { meetingRestored } from '../modules/Discord.mjs';
import { clearStats } from './KanbanAPI.mjs';
import { requireID } from '../modules/Validation.mjs';

// utility functions
function kanbanDelta(upsert = {}) {
    const empty = { tabs: [], tabGroups: [], columns: [], lists: [], tasks: [], tags: [] };
    return { upsert: { ...empty, ...upsert }, remove: { ...empty } };
}

function notationDelta(upsert = {}) {
    const empty = { groups: [], pages: [] };
    return { upsert: { ...empty, ...upsert }, remove: { ...empty } };
}

function readKind(req) {
    const kind = req.params.kind;

    if (!db.isArchiveKind(kind)) {
        throw Object.assign(new Error('Unknown archive item type'), { status: 400 });
    }

    return kind;
}

function itemWorkspace(req) {
    return db.getWorkspaceIDForArchiveItem(readKind(req), requireID(req.params.id, 'id'));
}

// tells everyone in the workspace what changed, the person who did it included
function publishChanges(workspaceID, result) {
    if (result.kanban) {
        clearStats(workspaceID);
        broadcastKanbanChange(workspaceID, kanbanDelta(result.kanban), null);
    }

    if (result.notation) broadcastNotationChange(workspaceID, notationDelta(result.notation), null);

    if (result.meeting) {
        clearStats(workspaceID);
        broadcastToWorkspace(workspaceID, { type: 'calendar', meetings: [result.meeting] }, null);
    }
}

// router configuration
export default function createArchiveRouter(authz) {
    const router = Router();

    router.get('/:workspaceID', authz.workspaceParam(), async (req, res, next) => {
        try {
            res.json({ items: await db.getArchive(req.workspaceID) });
        } catch (error) {
            next(error);
        }
    });

    router.get('/:kind/:id', authz.requireMembership(itemWorkspace), async (req, res, next) => {
        try {
            const item = await db.getArchiveItem(readKind(req), req.params.id);
            if (!item) return res.status(404).json({ error: 'That is no longer in the Archive' });

            res.json(item);
        } catch (error) {
            next(error);
        }
    });

    router.post('/:kind/:id/restore', authz.requireEditor(itemWorkspace), async (req, res, next) => {
        try {
            const kind = readKind(req);
            const result = await db.restoreArchiveItem(kind, req.params.id);
            if (!result) return res.status(404).json({ error: 'That is no longer in the Archive' });

            publishChanges(req.workspaceID, result);
            if (result.meeting) meetingRestored(req.workspaceID, result.meeting);

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'archive.restored',
                targetType: kind,
                targetID: req.params.id,
                detail: { workspaceID: req.workspaceID },
                ip: req.ip
            });

            res.json({ restored: true });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:kind/:id', authz.requireEditor(itemWorkspace), async (req, res, next) => {
        try {
            const kind = readKind(req);
            const item = await db.getArchiveItem(kind, req.params.id);

            const result = await db.purgeArchiveItem(kind, req.params.id);
            if (!result) return res.status(404).json({ error: 'That is no longer in the Archive' });

            if (kind === 'page') closeRoom(req.params.id);
            publishChanges(req.workspaceID, result);

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'archive.deleted',
                targetType: kind,
                targetID: req.params.id,
                detail: { workspaceID: req.workspaceID, title: item?.title ?? item?.name ?? null },
                ip: req.ip
            });

            res.json({ deleted: true });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
