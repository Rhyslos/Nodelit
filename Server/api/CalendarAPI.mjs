// import modules
import { Router } from 'express';
import { db } from '../database/Database.mjs';
import { broadcastToWorkspace } from '../modules/Networking.mjs';
import {
    requireText,
    optionalText,
    requireTimestamp,
    optionalTimestamp,
    requireSlotList
} from '../modules/Validation.mjs';

// configuration constants
export const SLOT_MINUTES = 30;
const MAX_RANGE_DAYS = 45;

// utility functions
function originOf(req) {
    return req.get('X-Client-Id') ?? null;
}

function publish(req, payload) {
    broadcastToWorkspace(req.workspaceID, { type: 'calendar', ...payload }, originOf(req));
}

function resolveRange(req) {
    const from = requireTimestamp(req.query?.from, 'from');
    const to = requireTimestamp(req.query?.to, 'to');

    const span = Date.parse(to) - Date.parse(from);

    if (span <= 0) throw Object.assign(new Error('to must be after from'), { status: 400 });
    if (span > MAX_RANGE_DAYS * 86400000) {
        throw Object.assign(new Error(`range cannot exceed ${MAX_RANGE_DAYS} days`), { status: 400 });
    }

    return { from, to };
}

// router configuration
export default function createCalendarRouter(authz) {
    const router = Router();

    // range routes
    router.get('/:workspaceID', authz.workspaceParam('workspaceID'), async (req, res, next) => {
        try {
            const { from, to } = resolveRange(req);
            const data = await db.getCalendarRange(req.workspaceID, from, to);

            res.json({ ...data, slotMinutes: SLOT_MINUTES, memberRole: req.membership?.role ?? null });
        } catch (error) {
            next(error);
        }
    });

    // availability routes
    router.put('/:workspaceID/availability', authz.workspaceParamEdit('workspaceID'), async (req, res, next) => {
        try {
            const added = requireSlotList(req.body?.added ?? [], 'added', SLOT_MINUTES);
            const removed = requireSlotList(req.body?.removed ?? [], 'removed', SLOT_MINUTES);

            const result = await db.setAvailability(req.workspaceID, req.user.id, added, removed);

            publish(req, { slots: result.slots, cleared: result.cleared });
            res.json(result);
        } catch (error) {
            next(error);
        }
    });

    // meeting routes
    router.post('/:workspaceID/meetings', authz.workspaceParamEdit('workspaceID'), async (req, res, next) => {
        try {
            const startsAt = requireTimestamp(req.body?.startsAt, 'startsAt');
            const endsAt = requireTimestamp(req.body?.endsAt, 'endsAt');

            if (Date.parse(endsAt) <= Date.parse(startsAt)) {
                return res.status(400).json({ error: 'endsAt must be after startsAt' });
            }

            const meeting = await db.createMeeting(req.workspaceID, req.user.id, {
                title: requireText(req.body?.title, 'title', 120),
                description: optionalText(req.body?.description, 'description', 2000) ?? '',
                startsAt,
                endsAt
            });

            publish(req, { meetings: [meeting] });
            res.status(201).json(meeting);
        } catch (error) {
            next(error);
        }
    });

    router.put('/meetings/:id', authz.meetingEdit(), async (req, res, next) => {
        try {
            const startsAt = optionalTimestamp(req.body?.startsAt, 'startsAt');
            const endsAt = optionalTimestamp(req.body?.endsAt, 'endsAt');

            if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
                return res.status(400).json({ error: 'endsAt must be after startsAt' });
            }

            const meeting = await db.updateMeeting(req.params.id, {
                title: req.body?.title === undefined ? undefined : requireText(req.body.title, 'title', 120),
                description: req.body?.description === undefined
                    ? undefined
                    : (optionalText(req.body.description, 'description', 2000) ?? ''),
                startsAt,
                endsAt
            });

            if (!meeting) return res.status(404).json({ error: 'Not found' });

            publish(req, { meetings: [meeting] });
            res.json(meeting);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/meetings/:id', authz.meetingEdit(), async (req, res, next) => {
        try {
            const removed = await db.deleteMeeting(req.params.id);
            if (!removed) return res.status(404).json({ error: 'Not found' });

            publish(req, { removedMeetings: [req.params.id] });
            res.json({ removed: [req.params.id] });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
