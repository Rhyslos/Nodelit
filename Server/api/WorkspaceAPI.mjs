// import modules
import { Router } from 'express';
import db from '../database/Database.mjs';
import { revalidateStreams } from '../modules/Networking.mjs';
import { revalidateCollaboration } from '../modules/Collaboration.mjs';
import { requireText, requireID, optionalID, optionalColor, optionalBoolean, requireMemberRole } from '../modules/Validation.mjs';
import { discordStatus, parseWebhookURL, parseGuildID, forgetDiscordSettings, testDiscord } from '../modules/Discord.mjs';

// configuration constants
const UPCOMING_WINDOW_DAYS = 7;
const UPCOMING_MAX_DAYS = 30;
const UPCOMING_LIMIT = 25;

// revocation functions
function cutLiveConnections() {
    revalidateStreams();
    revalidateCollaboration();
}

// discord functions
function maskWebhook(url) {
    return url ? `…${url.slice(-6)}` : null;
}

function discordView(settings) {
    return {
        ...discordStatus(),
        webhookSet: Boolean(settings?.webhookURL),
        webhookHint: maskWebhook(settings?.webhookURL),
        guildID: settings?.guildID ?? '',
        postKanban: settings?.postKanban ?? true,
        postMeetings: settings?.postMeetings ?? true,
        syncEvents: settings?.syncEvents ?? true
    };
}

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

    router.get('/upcoming', async (req, res, next) => {
        try {
            const requested = Number.parseInt(req.query?.days, 10);

            const days = Number.isInteger(requested)
                ? Math.min(Math.max(requested, 1), UPCOMING_MAX_DAYS)
                : UPCOMING_WINDOW_DAYS;

            const [deadlines, meetings] = await Promise.all([
                db.getUpcomingDeadlines(req.user.id, days, UPCOMING_LIMIT),
                db.getUpcomingMeetings(req.user.id, days, UPCOMING_LIMIT)
            ]);

            const items = [
                ...deadlines.map(entry => ({ ...entry, kind: 'task' })),
                ...meetings.map(entry => ({ ...entry, kind: 'meeting' }))
            ];

            res.json({ items, days });
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
            cutLiveConnections();

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'workspace.deleted',
                targetType: 'workspace',
                targetID: req.workspaceID,
                detail: { name: req.workspace?.name },
                ip: req.ip
            });

            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    });

    // membership routes
    router.get('/:workspaceID/users', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            const users = await db.getUsersForWorkspace(req.workspaceID);
            res.json({ users });
        } catch (error) {
            next(error);
        }
    });

    router.put('/:workspaceID/members/:userID', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            const userID = requireID(req.params.userID, 'userID');
            const role = requireMemberRole(req.body?.role);

            const target = await db.getUserByID(userID);
            if (!target) return res.status(404).json({ error: 'Not found' });

            const membership = await db.setMemberRole(req.workspaceID, userID, role);
            cutLiveConnections();

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'member.access_set',
                targetType: 'workspace',
                targetID: req.workspaceID,
                detail: { userID, username: target.username, role },
                ip: req.ip
            });

            res.json(membership);
        } catch (error) {
            next(error);
        }
    });

    router.delete('/:workspaceID/members/:userID', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            const userID = requireID(req.params.userID, 'userID');
            const removed = await db.removeMember(req.workspaceID, userID);

            if (!removed) {
                return res.status(400).json({ error: 'That member could not be removed' });
            }

            cutLiveConnections();

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'member.removed',
                targetType: 'workspace',
                targetID: req.workspaceID,
                detail: { userID },
                ip: req.ip
            });

            res.json({ removed: userID });
        } catch (error) {
            next(error);
        }
    });

    // discord routes
    router.get('/:workspaceID/discord', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            res.json(discordView(await db.getDiscordSettings(req.workspaceID)));
        } catch (error) {
            next(error);
        }
    });

    router.put('/:workspaceID/discord', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            const body = req.body ?? {};

            const settings = await db.saveDiscordSettings(req.workspaceID, req.user.id, {
                webhookURL: body.webhookURL === undefined ? undefined : parseWebhookURL(body.webhookURL),
                guildID: body.guildID === undefined ? undefined : parseGuildID(body.guildID),
                postKanban: optionalBoolean(body.postKanban, 'postKanban'),
                postMeetings: optionalBoolean(body.postMeetings, 'postMeetings'),
                syncEvents: optionalBoolean(body.syncEvents, 'syncEvents')
            });

            forgetDiscordSettings(req.workspaceID);

            await db.recordAudit({
                actorID: req.user.id,
                actorName: req.user.username,
                action: 'discord.updated',
                targetType: 'workspace',
                targetID: req.workspaceID,
                detail: {
                    webhookSet: Boolean(settings.webhookURL),
                    guildID: settings.guildID,
                    postKanban: settings.postKanban,
                    postMeetings: settings.postMeetings,
                    syncEvents: settings.syncEvents
                },
                ip: req.ip
            });

            res.json(discordView(settings));
        } catch (error) {
            next(error);
        }
    });

    router.post('/:workspaceID/discord/test', authz.workspaceOwnerParam(), async (req, res, next) => {
        try {
            res.json(await testDiscord(req.workspaceID, req.user));
        } catch (error) {
            next(error);
        }
    });

    router.get('/:workspaceID/members', authz.workspaceParam(), async (req, res, next) => {
        try {
            res.json({ members: await db.getMembers(req.workspaceID) });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
