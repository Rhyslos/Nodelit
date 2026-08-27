// import modules
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import db from '../database/Database.mjs';

// configuration constants
const SOCKET_PATH = '/api/notation/socket';
const SESSION_COOKIE = 'session_id';
const EDIT_ROLES = new Set(['owner', 'member']);
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const SYNC_STEP_1 = 0;
const SYNC_STEP_2 = 1;
const SYNC_UPDATE = 2;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_CONNECTIONS_PER_PAGE = 40;
const MAX_CONTENT_CHARS = 200000;
const SAVE_DEBOUNCE_MS = 2000;
const REVALIDATE_INTERVAL_MS = 60000;
const PING_INTERVAL_MS = 30000;
const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const CLOSE_GONE = 4410;
const CLOSE_TOO_LARGE = 4413;

// state variables
const rooms = new Map();
let wss = null;
let revalidateTimer = null;
let pingTimer = null;

// utility functions
function readCookie(header, name) {
    if (typeof header !== 'string') return null;

    for (const part of header.split(';')) {
        const index = part.indexOf('=');
        if (index === -1) continue;

        if (part.slice(0, index).trim() === name) {
            return decodeURIComponent(part.slice(index + 1).trim());
        }
    }

    return null;
}

function parsePageID(url) {
    const path = (url ?? '').split('?')[0];
    if (!path.startsWith(`${SOCKET_PATH}/`)) return null;

    const pageID = decodeURIComponent(path.slice(SOCKET_PATH.length + 1));
    return /^[A-Za-z0-9_-]{1,80}$/.test(pageID) ? pageID : null;
}

function send(connection, payload) {
    if (connection.socket.readyState !== connection.socket.OPEN) return;

    try {
        connection.socket.send(payload);
    } catch {
        closeConnection(connection);
    }
}

function broadcast(room, payload, exclude) {
    for (const connection of room.connections) {
        if (connection === exclude) continue;
        send(connection, payload);
    }
}

// extraction functions
function collectText(node, parts) {
    if (node instanceof Y.XmlText) {
        const text = node.toDelta()
            .map(operation => (typeof operation.insert === 'string' ? operation.insert : ''))
            .join('');

        if (text) parts.push(text);
        return;
    }

    if (node instanceof Y.XmlElement || node instanceof Y.XmlFragment) {
        if (node instanceof Y.XmlElement) {
            const caption = node.getAttribute('caption');
            if (typeof caption === 'string' && caption) parts.push(caption);
        }

        for (const child of node.toArray()) collectText(child, parts);
        if (node instanceof Y.XmlElement) parts.push('\n');
    }
}

export function documentText(doc) {
    const parts = [];

    try {
        collectText(doc.getXmlFragment('default'), parts);

        doc.getMap('stickies').forEach(note => {
            const text = note?.get?.('text');
            if (text) parts.push(text.toString());
        });
    } catch (error) {
        console.error('Notation text extraction failed:', error.message);
        return '';
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_CHARS);
}

// persistence functions
async function loadRoom(pageID) {
    const doc = new Y.Doc();
    const record = await db.getNotationDocument(pageID);

    let loaded = false;

    if (record?.state) {
        try {
            Y.applyUpdate(doc, new Uint8Array(record.state));
            loaded = true;
        } catch (error) {
            console.error(`Notation document ${pageID} failed to load:`, error.message);
        }
    }

    const room = {
        pageID,
        doc,
        awareness: new awarenessProtocol.Awareness(doc),
        connections: new Set(),
        saveTimer: null,
        dirty: false
    };

    room.awareness.setLocalState(null);

    if (loaded && !record.content) {
        room.dirty = true;
        scheduleSave(room);
    }

    doc.on('update', (update, origin) => {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        broadcast(room, encoding.toUint8Array(encoder), origin);

        room.dirty = true;
        scheduleSave(room);
    });

    room.awareness.on('update', ({ added, updated, removed }, origin) => {
        const changed = added.concat(updated, removed);
        if (changed.length === 0) return;

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(room.awareness, changed)
        );
        broadcast(room, encoding.toUint8Array(encoder), origin);
    });

    return room;
}

async function getRoom(pageID) {
    const existing = rooms.get(pageID);
    if (existing) return existing instanceof Promise ? existing : existing;

    const pending = loadRoom(pageID);
    rooms.set(pageID, pending);

    try {
        const room = await pending;
        rooms.set(pageID, room);
        return room;
    } catch (error) {
        rooms.delete(pageID);
        throw error;
    }
}

function scheduleSave(room) {
    if (room.saveTimer) return;

    room.saveTimer = setTimeout(() => {
        room.saveTimer = null;
        saveRoom(room).catch(error => {
            console.error(`Notation save failed for ${room.pageID}:`, error.message);
        });
    }, SAVE_DEBOUNCE_MS);

    room.saveTimer.unref?.();
}

async function saveRoom(room) {
    if (!room.dirty) return;

    const state = Y.encodeStateAsUpdate(room.doc);

    if (state.length > MAX_DOCUMENT_BYTES) {
        console.error(`Notation document ${room.pageID} exceeds the size limit and was not saved`);
        for (const connection of [...room.connections]) closeConnection(connection, CLOSE_TOO_LARGE);
        return;
    }

    room.dirty = false;

    try {
        await db.saveNotationDocument(room.pageID, Buffer.from(state), documentText(room.doc));
    } catch (error) {
        room.dirty = true;

        const stillExists = await db.getWorkspaceIDForNotationPage(room.pageID);
        if (!stillExists) {
            closeRoom(room.pageID, CLOSE_GONE);
            return;
        }

        throw error;
    }
}

// connection functions
function closeConnection(connection, code) {
    const room = connection.room;

    if (room?.connections.delete(connection)) {
        awarenessProtocol.removeAwarenessStates(room.awareness, [connection.id], null);
    }

    try {
        connection.socket.close(code);
    } catch {
        connection.socket.terminate();
    }

    if (room && room.connections.size === 0) closeRoom(room.pageID);
}

export function closeRoom(pageID, code = CLOSE_GONE) {
    const entry = rooms.get(pageID);
    if (!entry || entry instanceof Promise) {
        rooms.delete(pageID);
        return;
    }

    rooms.delete(pageID);

    if (entry.saveTimer) clearTimeout(entry.saveTimer);

    const finish = () => {
        for (const connection of [...entry.connections]) {
            connection.room = null;
            try {
                connection.socket.close(code);
            } catch {
                connection.socket.terminate();
            }
        }
        entry.awareness.destroy();
        entry.doc.destroy();
    };

    if (!entry.dirty) {
        finish();
        return;
    }

    entry.dirty = true;

    saveRoom(entry)
        .catch(error => console.error(`Notation flush failed for ${pageID}:`, error.message))
        .finally(finish);
}

function handleSyncMessage(connection, decoder) {
    const room = connection.room;
    const messageType = decoding.readVarUint(decoder);

    if (messageType === SYNC_STEP_1) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep2(encoder, room.doc, decoding.readVarUint8Array(decoder));
        send(connection, encoding.toUint8Array(encoder));
        return;
    }

    if (messageType !== SYNC_STEP_2 && messageType !== SYNC_UPDATE) return;
    if (!connection.canEdit) return;

    Y.applyUpdate(room.doc, decoding.readVarUint8Array(decoder), connection);
}

function handleMessage(connection, data) {
    try {
        const decoder = decoding.createDecoder(new Uint8Array(data));
        const messageType = decoding.readVarUint(decoder);

        if (messageType === MESSAGE_SYNC) {
            handleSyncMessage(connection, decoder);
            return;
        }

        if (messageType === MESSAGE_AWARENESS) {
            awarenessProtocol.applyAwarenessUpdate(
                connection.room.awareness,
                decoding.readVarUint8Array(decoder),
                connection
            );
        }
    } catch (error) {
        console.error('Notation message rejected:', error.message);
        closeConnection(connection);
    }
}

function attachConnection(socket, context) {
    const buffered = [];
    let connection = null;

    socket.on('message', data => {
        if (connection) handleMessage(connection, data);
        else if (buffered.length < 64) buffered.push(data);
    });

    socket.on('error', () => {
        if (connection) closeConnection(connection);
        else socket.terminate();
    });

    getRoom(context.pageID).then(room => {
        if (socket.readyState !== socket.OPEN) return;

        if (room.connections.size >= MAX_CONNECTIONS_PER_PAGE) {
            socket.close(CLOSE_FORBIDDEN);
            return;
        }

        connection = {
            id: context.connectionID,
            socket,
            room,
            userID: context.userID,
            canEdit: context.canEdit,
            alive: true
        };

        room.connections.add(connection);

        socket.on('pong', () => { connection.alive = true; });
        socket.on('close', () => closeConnection(connection));

        const syncEncoder = encoding.createEncoder();
        encoding.writeVarUint(syncEncoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(syncEncoder, room.doc);
        send(connection, encoding.toUint8Array(syncEncoder));

        const states = room.awareness.getStates();

        if (states.size > 0) {
            const awarenessEncoder = encoding.createEncoder();
            encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                awarenessEncoder,
                awarenessProtocol.encodeAwarenessUpdate(room.awareness, [...states.keys()])
            );
            send(connection, encoding.toUint8Array(awarenessEncoder));
        }

        for (const data of buffered) handleMessage(connection, data);
        buffered.length = 0;
    }).catch(error => {
        console.error(`Notation room ${context.pageID} failed to open:`, error.message);
        try {
            socket.close(CLOSE_GONE);
        } catch {
            socket.terminate();
        }
    });
}

// authorization functions
async function authorize(request) {
    const pageID = parsePageID(request.url);
    if (!pageID) return { error: CLOSE_GONE };

    const sessionID = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (typeof sessionID !== 'string' || sessionID.length !== 64) return { error: CLOSE_UNAUTHORIZED };

    const user = await db.getUserBySession(sessionID);
    if (!user) return { error: CLOSE_UNAUTHORIZED };

    const workspaceID = await db.getWorkspaceIDForNotationPage(pageID);
    if (!workspaceID) return { error: CLOSE_GONE };

    const workspace = await db.getWorkspace(workspaceID);
    if (!workspace) return { error: CLOSE_GONE };

    const membership = await db.getMembership(workspaceID, user.id);
    if (!membership) return { error: CLOSE_FORBIDDEN };

    return {
        pageID,
        workspaceID,
        userID: user.id,
        canEdit: EDIT_ROLES.has(membership.role),
        connectionID: `${user.id}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`
    };
}

// maintenance functions
async function revalidateRooms() {
    for (const [pageID, entry] of rooms) {
        if (entry instanceof Promise) continue;

        const workspaceID = await db.getWorkspaceIDForNotationPage(pageID);

        if (!workspaceID) {
            closeRoom(pageID);
            continue;
        }

        const workspace = await db.getWorkspace(workspaceID);

        if (!workspace) {
            closeRoom(pageID);
            continue;
        }

        for (const connection of [...entry.connections]) {
            const membership = await db.getMembership(workspaceID, connection.userID);

            if (!membership) {
                closeConnection(connection, CLOSE_FORBIDDEN);
                continue;
            }

            connection.canEdit = EDIT_ROLES.has(membership.role);
        }
    }
}

function checkHeartbeats() {
    for (const entry of rooms.values()) {
        if (entry instanceof Promise) continue;

        for (const connection of [...entry.connections]) {
            if (!connection.alive) {
                closeConnection(connection);
                continue;
            }

            connection.alive = false;

            try {
                connection.socket.ping();
            } catch {
                closeConnection(connection);
            }
        }
    }
}

// lifecycle functions
export function attachCollaboration(httpServer) {
    if (wss) return wss;

    wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

    httpServer.on('upgrade', async (request, socket, head) => {
        const path = (request.url ?? '').split('?')[0];
        if (path !== SOCKET_PATH && !path.startsWith(`${SOCKET_PATH}/`)) return;

        socket.on('error', () => socket.destroy());

        let context;

        try {
            context = await authorize(request);
        } catch (error) {
            console.error('Notation upgrade failed:', error.message);
            socket.destroy();
            return;
        }

        if (context.error) {
            const status = context.error === CLOSE_UNAUTHORIZED ? '401 Unauthorized'
                : context.error === CLOSE_FORBIDDEN ? '403 Forbidden'
                    : '404 Not Found';

            socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, ws => attachConnection(ws, context));
    });

    revalidateTimer = setInterval(() => {
        revalidateRooms().catch(error => {
            console.error('Notation revalidation failed:', error.message);
        });
    }, REVALIDATE_INTERVAL_MS);

    pingTimer = setInterval(checkHeartbeats, PING_INTERVAL_MS);

    revalidateTimer.unref?.();
    pingTimer.unref?.();

    return wss;
}

export async function stopCollaboration() {
    if (revalidateTimer) clearInterval(revalidateTimer);
    if (pingTimer) clearInterval(pingTimer);

    revalidateTimer = null;
    pingTimer = null;

    const pending = [];

    for (const [pageID, entry] of rooms) {
        if (entry instanceof Promise) {
            rooms.delete(pageID);
            continue;
        }

        if (entry.saveTimer) clearTimeout(entry.saveTimer);
        if (entry.dirty) pending.push(saveRoom(entry).catch(() => undefined));

        for (const connection of [...entry.connections]) {
            connection.room = null;
            try {
                connection.socket.close(1001);
            } catch {
                connection.socket.terminate();
            }
        }
    }

    await Promise.all(pending);

    rooms.clear();
    wss?.close();
    wss = null;
}
