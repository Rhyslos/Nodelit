// import modules
import db from '../database/Database.mjs';

// configuration constants
const API_BASE = 'https://discord.com/api/v10';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRY_WAIT_MS = 5000;
const DIGEST_QUIET_MS = 20 * 1000;
const DIGEST_MAX_WAIT_MS = 90 * 1000;
const SETTINGS_CACHE_MS = 30 * 1000;
const MAX_DIGEST_LINES = 25;
const EMBED_COLOR = 0xc8502a;
const EVENT_LOCATION_MAX = 100;
const EVENT_NAME_MAX = 100;
const EVENT_DESCRIPTION_MAX = 1000;

// CREATE_EVENTS (1 << 44): lets the bot create external events and edit or delete the ones it made
const BOT_PERMISSIONS = (1n << 44n).toString();

const WEBHOOK_PATTERN = /^https:\/\/(?:canary\.|ptb\.)?(?:discord|discordapp)\.com\/api\/webhooks\/\d{17,20}\/[\w-]{20,}$/;
const GUILD_PATTERN = /^\d{17,20}$/;

// environment functions
function botToken() {
    return process.env.DISCORD_BOT_TOKEN?.trim() || null;
}

function applicationID() {
    const value = process.env.DISCORD_APPLICATION_ID?.trim();
    return value && GUILD_PATTERN.test(value) ? value : null;
}

function publicURL() {
    const explicit = process.env.PUBLIC_URL?.trim();
    if (explicit) return explicit.replace(/\/+$/, '');

    const origin = (process.env.CLIENT_ORIGIN ?? '').split(',').map(value => value.trim()).find(Boolean);
    return origin ? origin.replace(/\/+$/, '') : null;
}

export function discordStatus() {
    const appID = applicationID();

    return {
        botConfigured: Boolean(botToken()),
        inviteURL: appID
            ? `https://discord.com/oauth2/authorize?client_id=${appID}&scope=bot&permissions=${BOT_PERMISSIONS}`
            : null
    };
}

// validation functions
export function parseWebhookURL(value) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !WEBHOOK_PATTERN.test(value.trim())) {
        throw Object.assign(new Error('That does not look like a Discord webhook link'), { status: 400 });
    }

    return value.trim();
}

export function parseGuildID(value) {
    if (value === null || value === '') return null;
    if (typeof value !== 'string' || !GUILD_PATTERN.test(value.trim())) {
        throw Object.assign(new Error('The Discord server ID should be a long number'), { status: 400 });
    }

    return value.trim();
}

// request functions
async function discordFetch(url, { method = 'GET', body, bot = false } = {}, retried = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (bot) headers.Authorization = `Bot ${botToken()}`;

    let response;

    try {
        response = await fetch(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch (error) {
        return { ok: false, status: 0, error: error.name === 'TimeoutError' ? 'Discord did not answer in time' : 'Could not reach Discord' };
    }

    if (response.status === 429 && !retried) {
        const data = await response.json().catch(() => ({}));
        const waitMs = Math.min(MAX_RETRY_WAIT_MS, Math.ceil((Number(data.retry_after) || 1) * 1000));

        await new Promise(resolve => setTimeout(resolve, waitMs));
        return discordFetch(url, { method, body, bot }, true);
    }

    const data = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        return { ok: false, status: response.status, error: describeError(response.status, data) };
    }

    return { ok: true, status: response.status, data };
}

function describeError(status, data) {
    if (status === 401) return 'The bot token was rejected';
    if (status === 403) return 'The bot is missing permissions in that server';
    if (status === 404) return 'Discord could not find that webhook, server or event';

    return data?.message ? `Discord said: ${data.message}` : `Discord answered with status ${status}`;
}

function postWebhook(webhookURL, payload) {
    return discordFetch(`${webhookURL}?wait=true`, {
        method: 'POST',
        body: { allowed_mentions: { parse: [] }, ...payload }
    });
}

// settings functions
const settingsCache = new Map();

async function settingsFor(workspaceID) {
    const cached = settingsCache.get(workspaceID);
    if (cached && Date.now() - cached.at < SETTINGS_CACHE_MS) return cached.value;

    const value = await db.getDiscordSettings(workspaceID);
    settingsCache.set(workspaceID, { at: Date.now(), value });

    return value;
}

export function forgetDiscordSettings(workspaceID) {
    settingsCache.delete(workspaceID);
}

// formatting functions
function escapeText(value) {
    return String(value ?? '').replace(/([\\*_~`|>#[\]()])/g, '\\$1').replace(/\s+/g, ' ').trim();
}

function taskLabel(title) {
    return `**${escapeText(title) || 'Untitled task'}**`;
}

function unix(value) {
    return Math.floor(Date.parse(value) / 1000);
}

function meetingWhen(meeting) {
    return `<t:${unix(meeting.startsAt)}:F> – <t:${unix(meeting.endsAt)}:t>`;
}

function formatDeadline(value) {
    const [year, month, day] = String(value).split('-').map(Number);
    if (!year || !month || !day) return null;

    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'
    });
}

function workspaceLink(workspaceID, page) {
    const base = publicURL();
    return base ? `${base}/workspace/${workspaceID}/${page}` : undefined;
}

function eventLink(guildID, eventID) {
    return `https://discord.com/events/${guildID}/${eventID}`;
}

function clip(value, max) {
    const text = String(value ?? '');
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// kanban digest functions
const digests = new Map();

export function recordKanbanActivity(workspaceID, actor, entries) {
    try {
        const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
        if (!workspaceID || list.length === 0) return;

        let digest = digests.get(workspaceID);

        if (!digest) {
            digest = { items: [], startedAt: Date.now(), timer: null };
            digests.set(workspaceID, digest);
        }

        // send once things go quiet for a moment, but never hold activity longer than the max wait
        clearTimeout(digest.timer);
        const wait = Math.min(DIGEST_QUIET_MS, Math.max(0, digest.startedAt + DIGEST_MAX_WAIT_MS - Date.now()));
        digest.timer = setTimeout(() => flushDigest(workspaceID), wait);
        digest.timer.unref?.();

        for (const entry of list) {
            digest.items.push({ ...entry, actorID: actor?.id ?? null, actorName: actor?.displayName ?? actor?.username ?? 'Someone' });
        }
    } catch (error) {
        console.warn('Discord activity skipped:', error.message);
    }
}

// collapses repeated activity on the same task into one line per kind
function collapse(items) {
    const byKey = new Map();

    for (const item of items) {
        const key = item.type === 'board' ? `board:${item.tabID}` : `${item.type}:${item.taskID}`;
        const existing = byKey.get(key);

        if (!existing) {
            byKey.set(key, { ...item, assignees: [...(item.assignees ?? [])] });
            continue;
        }

        if (item.type === 'moved') existing.toListID = item.toListID;
        if (item.type === 'deadline') existing.deadline = item.deadline;
        if (item.type === 'assigned') existing.assignees = [...new Set([...existing.assignees, ...item.assignees])];
        if (item.type === 'completed' || item.type === 'reopened') Object.assign(existing, item);
    }

    const result = [...byKey.values()];
    const has = (type, taskID) => byKey.has(`${type}:${taskID}`);

    return result.filter(item => {
        // completed and reopened inside one digest cancel out
        if (item.type === 'completed' || item.type === 'reopened') {
            return !(has('completed', item.taskID) && has('reopened', item.taskID));
        }

        // a task added in this digest is already shown in the list it ended up in
        if (item.type === 'moved') return item.fromListID !== item.toListID && !has('created', item.taskID);

        return true;
    });
}

async function flushDigest(workspaceID) {
    const digest = digests.get(workspaceID);
    digests.delete(workspaceID);
    if (!digest || digest.items.length === 0) return;

    try {
        const settings = await settingsFor(workspaceID);

        if (!settings?.webhookURL || !settings.postKanban) {
            console.log(`Discord digest for ${workspaceID} skipped: ${!settings?.webhookURL ? 'no webhook set' : 'board activity is turned off'}`);
            return;
        }

        const workspace = await db.getWorkspace(workspaceID);
        if (!workspace) return;

        const members = await db.getMembers(workspaceID);
        const memberName = id => members.find(member => member.id === id)?.displayName ?? 'someone';

        const tasks = new Map();
        const lists = new Map();
        const tabs = new Map();

        async function task(id) {
            if (!tasks.has(id)) tasks.set(id, await db.getTask(id));
            return tasks.get(id);
        }

        async function list(id) {
            if (!id) return null;
            if (!lists.has(id)) lists.set(id, await db.getList(id));
            return lists.get(id);
        }

        async function tab(id) {
            if (!id) return null;
            if (!tabs.has(id)) tabs.set(id, await db.getTab(id));
            return tabs.get(id);
        }

        async function where(listID) {
            const entry = await list(listID);
            if (!entry) return '';

            const board = await tab(entry.tabID);
            return board ? ` · ${escapeText(board.name)} / *${escapeText(entry.name)}*` : ` · *${escapeText(entry.name)}*`;
        }

        const lines = [];

        for (const item of collapse(digest.items)) {
            const actor = `**${escapeText(item.actorName)}**`;

            if (item.type === 'board') {
                const board = await tab(item.tabID);
                if (board) lines.push(`🗂️ ${actor} created the board **${escapeText(board.name)}**`);
                continue;
            }

            const current = await task(item.taskID);
            if (!current) continue;

            const label = taskLabel(current.title);

            if (item.type === 'created') {
                lines.push(`🆕 ${actor} added ${label}${await where(current.listID)}`);
            } else if (item.type === 'completed') {
                lines.push(`✅ ${actor} completed ${label}${await where(current.listID)}`);
            } else if (item.type === 'reopened') {
                lines.push(`↩️ ${actor} reopened ${label}`);
            } else if (item.type === 'assigned') {
                const names = item.assignees
                    .filter(id => current.assignedUsers.includes(id))
                    .map(id => `**${escapeText(item.actorID === id ? 'themselves' : memberName(id))}**`);

                if (names.length > 0) lines.push(`👤 ${actor} assigned ${names.join(', ')} to ${label}`);
            } else if (item.type === 'moved') {
                const from = await list(item.fromListID);
                const to = await list(item.toListID);

                if (from && to) {
                    lines.push(`➡️ ${actor} moved ${label}: *${escapeText(from.name)}* → *${escapeText(to.name)}*`);
                }
            } else if (item.type === 'deadline') {
                const date = formatDeadline(item.deadline);
                if (date) lines.push(`📅 ${actor} set ${label} due **${date}**`);
            }
        }

        if (lines.length === 0) {
            console.log(`Discord digest for ${workspaceID} skipped: ${digest.items.length} changes left nothing to post`);
            return;
        }

        const shown = lines.slice(0, MAX_DIGEST_LINES);
        if (lines.length > shown.length) shown.push(`…and ${lines.length - shown.length} more`);

        const result = await postWebhook(settings.webhookURL, {
            embeds: [{
                title: clip(`Board activity · ${workspace.name}`, 256),
                url: workspaceLink(workspaceID, 'kanban'),
                description: clip(shown.join('\n'), 4096),
                color: EMBED_COLOR,
                timestamp: new Date().toISOString()
            }]
        });

        if (result.ok) console.log(`Discord digest for ${workspaceID} sent: ${lines.length} line(s)`);
        else console.warn(`Discord digest for ${workspaceID} failed: ${result.error}`);
    } catch (error) {
        console.warn(`Discord digest for ${workspaceID} failed:`, error.message);
    }
}

// sends any pending digests straight away, used on shutdown
export async function flushAllDigests() {
    const pending = [...digests.keys()];

    for (const workspaceID of pending) {
        clearTimeout(digests.get(workspaceID)?.timer);
        await flushDigest(workspaceID);
    }
}

// meeting event functions
function eventPayload(workspaceID, meeting) {
    return {
        name: clip(meeting.title || 'Meeting', EVENT_NAME_MAX),
        description: meeting.description ? clip(meeting.description, EVENT_DESCRIPTION_MAX) : undefined,
        privacy_level: 2,
        entity_type: 3,
        entity_metadata: { location: clip(workspaceLink(workspaceID, 'calendar') ?? 'Nodelit', EVENT_LOCATION_MAX) },
        scheduled_start_time: meeting.startsAt,
        scheduled_end_time: meeting.endsAt
    };
}

function canSyncEvents(settings) {
    return Boolean(botToken() && settings?.guildID && settings.syncEvents);
}

async function createEvent(settings, workspaceID, meeting) {
    if (Date.parse(meeting.startsAt) <= Date.now()) return null;

    const result = await discordFetch(`${API_BASE}/guilds/${settings.guildID}/scheduled-events`, {
        method: 'POST',
        bot: true,
        body: eventPayload(workspaceID, meeting)
    });

    if (!result.ok) {
        console.warn(`Discord event for meeting ${meeting.id} failed: ${result.error}`);
        return null;
    }

    await db.saveMeetingDiscordEvent(meeting.id, settings.guildID, result.data.id);
    return { guildID: settings.guildID, eventID: result.data.id };
}

async function syncEvent(settings, workspaceID, meeting) {
    if (!canSyncEvents(settings)) return null;

    const link = await db.getMeetingDiscordEvent(meeting.id);

    if (!link || link.guildID !== settings.guildID) {
        if (link) await removeEvent(link);
        return createEvent(settings, workspaceID, meeting);
    }

    const result = await discordFetch(`${API_BASE}/guilds/${link.guildID}/scheduled-events/${link.eventID}`, {
        method: 'PATCH',
        bot: true,
        body: eventPayload(workspaceID, meeting)
    });

    if (result.ok) return link;

    // someone deleted the event in Discord: make a fresh one
    if (result.status === 404) {
        await db.deleteMeetingDiscordEvent(meeting.id);
        return createEvent(settings, workspaceID, meeting);
    }

    console.warn(`Discord event update for meeting ${meeting.id} failed: ${result.error}`);
    return link;
}

async function removeEvent(link) {
    if (!link || !botToken()) return;

    const result = await discordFetch(`${API_BASE}/guilds/${link.guildID}/scheduled-events/${link.eventID}`, {
        method: 'DELETE',
        bot: true
    });

    if (!result.ok && result.status !== 404) {
        console.warn(`Discord event delete for meeting ${link.meetingID} failed: ${result.error}`);
    }
}

// meeting notification functions
function meetingEmbed({ title, meeting, workspaceName, extra = [] }) {
    return {
        title: clip(title, 256),
        url: workspaceLink(meeting.workspaceID, 'calendar'),
        description: clip([meetingWhen(meeting), `<t:${unix(meeting.startsAt)}:R>`, ...extra].join('\n'), 4096),
        color: EMBED_COLOR,
        footer: { text: clip(workspaceName, 2048) }
    };
}

export async function meetingCreated(workspaceID, meeting, actor) {
    try {
        const settings = await settingsFor(workspaceID);
        if (!settings) return;

        const link = await syncEvent(settings, workspaceID, meeting);
        if (!settings.webhookURL || !settings.postMeetings) return;

        const workspace = await db.getWorkspace(workspaceID);
        const extra = [`Booked by **${escapeText(actor?.displayName ?? 'someone')}**`];
        if (link) extra.push(`[Open the Discord event](${eventLink(link.guildID, link.eventID)})`);

        const result = await postWebhook(settings.webhookURL, {
            embeds: [meetingEmbed({
                title: `📅 New meeting: ${meeting.title || 'Meeting'}`,
                meeting: { ...meeting, workspaceID },
                workspaceName: workspace?.name ?? 'Nodelit',
                extra
            })]
        });

        if (!result.ok) console.warn(`Discord meeting post failed: ${result.error}`);
    } catch (error) {
        console.warn('Discord meeting sync failed:', error.message);
    }
}

export async function meetingUpdated(workspaceID, before, meeting, actor) {
    try {
        const settings = await settingsFor(workspaceID);
        if (!settings) return;

        const moved = before && (before.startsAt !== meeting.startsAt || before.endsAt !== meeting.endsAt);
        const renamed = before && before.title !== meeting.title;
        const changed = moved || renamed || before?.description !== meeting.description;

        if (!changed) return;

        const link = await syncEvent(settings, workspaceID, meeting);
        if (!settings.webhookURL || !settings.postMeetings || !(moved || renamed)) return;

        const workspace = await db.getWorkspace(workspaceID);
        const extra = [];

        if (moved) extra.push(`~~${meetingWhen(before)}~~`);
        if (renamed) extra.push(`Renamed from *${escapeText(before.title)}*`);
        extra.push(`Changed by **${escapeText(actor?.displayName ?? 'someone')}**`);
        if (link) extra.push(`[Open the Discord event](${eventLink(link.guildID, link.eventID)})`);

        const result = await postWebhook(settings.webhookURL, {
            embeds: [meetingEmbed({
                title: `🕒 Meeting changed: ${meeting.title || 'Meeting'}`,
                meeting: { ...meeting, workspaceID },
                workspaceName: workspace?.name ?? 'Nodelit',
                extra
            })]
        });

        if (!result.ok) console.warn(`Discord meeting post failed: ${result.error}`);
    } catch (error) {
        console.warn('Discord meeting sync failed:', error.message);
    }
}

// link must be read before the meeting row is deleted, since the link row cascades with it
export async function meetingDeleted(workspaceID, meeting, link, actor) {
    try {
        const settings = await settingsFor(workspaceID);
        if (!settings) return;

        await removeEvent(link);

        if (!meeting || !settings.webhookURL || !settings.postMeetings) return;
        if (Date.parse(meeting.endsAt) <= Date.now()) return;

        const workspace = await db.getWorkspace(workspaceID);

        const result = await postWebhook(settings.webhookURL, {
            embeds: [{
                title: clip(`❌ Meeting cancelled: ${meeting.title || 'Meeting'}`, 256),
                url: workspaceLink(workspaceID, 'calendar'),
                description: `~~${meetingWhen(meeting)}~~\nCancelled by **${escapeText(actor?.displayName ?? 'someone')}**`,
                color: EMBED_COLOR,
                footer: { text: clip(workspace?.name ?? 'Nodelit', 2048) }
            }]
        });

        if (!result.ok) console.warn(`Discord meeting post failed: ${result.error}`);
    } catch (error) {
        console.warn('Discord meeting sync failed:', error.message);
    }
}

// settings check functions
export async function testDiscord(workspaceID, actor) {
    const settings = await db.getDiscordSettings(workspaceID);
    const workspace = await db.getWorkspace(workspaceID);

    const report = { webhook: null, events: null };

    if (settings?.webhookURL) {
        const result = await postWebhook(settings.webhookURL, {
            embeds: [{
                title: '👋 Nodelit is connected',
                description: `Updates from **${escapeText(workspace?.name ?? 'this workspace')}** will appear in this channel.\nTest sent by **${escapeText(actor?.displayName ?? 'someone')}**.`,
                color: EMBED_COLOR
            }]
        });

        report.webhook = result.ok ? { ok: true } : { ok: false, error: result.error };
    }

    if (settings?.guildID) {
        if (!botToken()) {
            report.events = { ok: false, error: 'No bot token is set on the server (DISCORD_BOT_TOKEN)' };
        } else {
            const result = await discordFetch(`${API_BASE}/guilds/${settings.guildID}`, { bot: true });

            report.events = result.ok
                ? { ok: true, guildName: result.data?.name ?? null }
                : { ok: false, error: result.status === 403 || result.status === 404
                    ? 'The bot is not in that server yet. Invite it first.'
                    : result.error };
        }
    }

    return report;
}
