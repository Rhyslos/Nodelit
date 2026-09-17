// imports
import { Router } from 'express';
import crypto from 'crypto';
import db from '../database/Database.mjs';

// configuration constants
const HEARTBEAT_INTERVAL_MS = 15000;
const SESSION_COOKIE = 'session_id';
const MAX_STREAMS_PER_USER = 8;

// state variables
const connections = new Map();
let heartbeatTimer = null;

// utility functions
function writeEvent(res, payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startHeartbeat() {
    if (heartbeatTimer) return;

    heartbeatTimer = setInterval(() => {
        for (const connection of connections.values()) {
            connection.res.write(':\n\n');
        }

        revalidateStreams();
    }, HEARTBEAT_INTERVAL_MS);

    heartbeatTimer.unref?.();
}

function stopHeartbeat() {
    if (connections.size > 0 || !heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
}

// revocation functions
function membershipKey(workspaceID, userID) {
    return `${workspaceID}\u0000${userID}`;
}

function endConnection(connection, payload) {
    connections.delete(connection.id);

    try {
        writeEvent(connection.res, payload);
        connection.res.end();
    } catch {
        connection.res.destroy?.();
    }
}

async function revalidateSessions() {
    const all = Array.from(connections.values());
    if (all.length === 0) return;

    const live = await db.filterLiveSessions(all.map(connection => connection.sessionID));
    const affected = new Set();

    for (const connection of all) {
        if (live.has(connection.sessionID)) continue;
        if (connection.workspaceID) affected.add(connection.workspaceID);
        endConnection(connection, { type: 'unauthenticated' });
    }

    stopHeartbeat();

    for (const workspaceID of affected) await broadcastPresence(workspaceID);
}

async function revalidateConnections() {
    const attached = Array.from(connections.values()).filter(connection => connection.workspaceID);
    if (attached.length === 0) return;

    const active = await db.getActiveMemberships(
        attached.map(connection => connection.workspaceID),
        attached.map(connection => connection.userID)
    );

    const allowed = new Set(active.map(row => membershipKey(row.workspaceID, row.userID)));

    const revoked = attached.filter(connection =>
        !allowed.has(membershipKey(connection.workspaceID, connection.userID))
    );

    if (revoked.length === 0) return;

    const affected = new Set();

    for (const connection of revoked) {
        affected.add(connection.workspaceID);
        endConnection(connection, { type: 'revoked', workspaceID: connection.workspaceID });
    }

    stopHeartbeat();

    for (const workspaceID of affected) await broadcastPresence(workspaceID);
}

// revocation functions
export function revalidateStreams() {
    return revalidateSessions()
        .then(revalidateConnections)
        .catch(error => console.error('Stream revalidation failed:', error.message));
}

// broadcast functions
export function broadcastToWorkspace(workspaceID, body, originClientID) {
    if (!workspaceID) return;

    const payload = { ...body, workspaceID };

    for (const connection of connections.values()) {
        if (connection.workspaceID !== workspaceID) continue;
        if (originClientID && connection.clientID === originClientID) continue;
        writeEvent(connection.res, payload);
    }
}

export function broadcastKanbanChange(workspaceID, changes, originClientID) {
    broadcastToWorkspace(workspaceID, { type: 'kanban', ...changes }, originClientID);
}

export function broadcastNotationChange(workspaceID, changes, originClientID) {
    broadcastToWorkspace(workspaceID, { type: 'notation', ...changes }, originClientID);
}

// shutdown functions
export function stopStreams() {
    stopHeartbeat();

    for (const connection of connections.values()) {
        try {
            writeEvent(connection.res, { type: 'shutdown' });
            connection.res.end();
        } catch {
            continue;
        }
    }

    connections.clear();
}

// presence functions
function getOnlineUserIDs(workspaceID) {
    const online = new Set();

    for (const connection of connections.values()) {
        if (connection.workspaceID === workspaceID) online.add(connection.userID);
    }

    return online;
}

async function buildPresence(workspaceID) {
    const members = await db.getMembers(workspaceID);
    const online = getOnlineUserIDs(workspaceID);

    return members.map(member => ({ ...member, isOnline: online.has(member.id) }));
}

async function broadcastPresence(workspaceID) {
    if (!workspaceID) return;

    const members = await buildPresence(workspaceID);
    broadcastToWorkspace(workspaceID, { type: 'presence', workspaceID, members });
}

async function attachToWorkspace(connection, workspaceID) {
    const previous = connection.workspaceID;
    if (previous === workspaceID) return true;

    if (workspaceID && !await db.isActiveMember(workspaceID, connection.userID)) return false;

    connection.workspaceID = workspaceID ?? null;

    if (previous) await broadcastPresence(previous);
    if (connection.workspaceID) await broadcastPresence(connection.workspaceID);
    return true;
}

// router configuration
export default function createNetworkingRouter(authz) {
    const router = Router();

    // sse routes
    router.get('/stream', async (req, res, next) => {
        try {
            const connectionID = crypto.randomUUID();
            const clientID = typeof req.query.clientId === 'string' ? req.query.clientId.slice(0, 64) : null;
            const requestedWorkspace = typeof req.query.workspaceID === 'string' ? req.query.workspaceID : null;

            const open = Array.from(connections.values()).filter(connection => connection.userID === req.user.id);
            if (open.length >= MAX_STREAMS_PER_USER) {
                return res.status(429).json({ error: 'Too many open connections' });
            }

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            const connection = {
                id: connectionID,
                userID: req.user.id,
                sessionID: req.cookies?.[SESSION_COOKIE],
                clientID,
                workspaceID: null,
                res
            };
            connections.set(connectionID, connection);
            startHeartbeat();

            res.write('retry: 3000\n\n');
            writeEvent(res, { type: 'connected', connectionID });

            // event handlers
            req.on('close', () => {
                const workspaceID = connection.workspaceID;
                connections.delete(connectionID);
                stopHeartbeat();

                if (workspaceID) {
                    broadcastPresence(workspaceID).catch(error => {
                        console.error('Presence broadcast failed:', error.message);
                    });
                }
            });

            if (requestedWorkspace && !await attachToWorkspace(connection, requestedWorkspace)) {
                writeEvent(res, { type: 'presence-denied', workspaceID: requestedWorkspace });
            }
        } catch (error) {
            next(error);
        }
    });

    // presence routes
    router.post('/presence', async (req, res, next) => {
        try {
            const { clientId } = req.body ?? {};
            const workspaceID = req.body?.workspaceID ?? null;

            if (workspaceID !== null && typeof workspaceID !== 'string') {
                return res.status(400).json({ error: 'workspaceID must be text' });
            }

            const owned = Array.from(connections.values())
                .filter(connection => connection.userID === req.user.id)
                .filter(connection => !clientId || connection.clientID === clientId);

            let attached = 0;

            for (const connection of owned) {
                if (await attachToWorkspace(connection, workspaceID)) attached += 1;
            }

            if (workspaceID && owned.length > 0 && attached === 0) {
                return res.status(404).json({ error: 'Not found' });
            }

            res.json({ success: true, attached });
        } catch (error) {
            next(error);
        }
    });

    router.get('/members/:workspaceID', authz.workspaceParam(), async (req, res, next) => {
        try {
            res.json({ members: await buildPresence(req.workspaceID) });
        } catch (error) {
            next(error);
        }
    });

    return router;
}
