// imports
import { Router } from 'express';
import crypto from 'crypto';
import db from '../database/Database.mjs';

// configuration constants
const HEARTBEAT_INTERVAL_MS = 15000;

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

        revalidateConnections().catch(error => {
            console.error('Stream revalidation failed:', error.message);
        });
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
        connections.delete(connection.id);
        writeEvent(connection.res, { type: 'revoked', workspaceID: connection.workspaceID });
        connection.res.end();
    }

    stopHeartbeat();

    for (const workspaceID of affected) await broadcastPresence(workspaceID);
}

// broadcast functions
export function broadcastToWorkspace(workspaceID, payload, originClientID) {
    if (!workspaceID) return;

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
    if (previous === workspaceID) return;

    if (workspaceID && !await db.isActiveMember(workspaceID, connection.userID)) return;

    connection.workspaceID = workspaceID ?? null;

    if (previous) await broadcastPresence(previous);
    if (connection.workspaceID) await broadcastPresence(connection.workspaceID);
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

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            const connection = { id: connectionID, userID: req.user.id, clientID, workspaceID: null, res };
            connections.set(connectionID, connection);
            startHeartbeat();

            res.write('retry: 3000\n\n');
            writeEvent(res, { type: 'connected', connectionID });

            if (requestedWorkspace) await attachToWorkspace(connection, requestedWorkspace);

            // event handlers
            req.on('close', async () => {
                const workspaceID = connection.workspaceID;
                connections.delete(connectionID);
                stopHeartbeat();
                if (workspaceID) await broadcastPresence(workspaceID);
            });
        } catch (error) {
            next(error);
        }
    });

    // presence routes
    router.post('/presence', async (req, res, next) => {
        try {
            const { clientId, workspaceID } = req.body ?? {};

            const owned = Array.from(connections.values())
                .filter(connection => connection.userID === req.user.id)
                .filter(connection => !clientId || connection.clientID === clientId);

            for (const connection of owned) {
                await attachToWorkspace(connection, workspaceID ?? null);
            }

            res.json({ success: true, attached: owned.length });
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
