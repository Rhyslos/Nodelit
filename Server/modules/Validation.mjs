// configuration constants
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX_PATTERN = /^#[0-9a-fA-F]{3}$/;
const MAX_PALETTE_COLORS = 12;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH_SIZE = 200;
const MAX_SUBTASKS = 50;
const MAX_CHECKLISTS = 10;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const USER_ROLES = ['admin', 'member'];
const MEMBER_ROLES = ['member', 'viewer'];
const MAX_ASSIGNEES = 20;
const THEME_MODES = ['default', 'dark', 'custom'];
const NOTATION_LAYOUTS = ['paged', 'pageless'];
const THEME_KEYS = ['navbar', 'subbar', 'background', 'surface', 'accent', 'text'];

// error classes
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.status = 400;
    }
}

// assertion functions
export function requireID(value, field) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
        throw new ValidationError(`${field} is not a valid identifier`);
    }
    return value;
}

export function optionalID(value, field) {
    if (value === undefined || value === null || value === '') return null;
    return requireID(value, field);
}

export function requireText(value, field, maxLength = 200) {
    if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be text`);
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
        throw new ValidationError(`${field} cannot be empty`);
    }

    if (trimmed.length > maxLength) {
        throw new ValidationError(`${field} cannot be longer than ${maxLength} characters`);
    }

    return trimmed;
}

export function optionalText(value, field, maxLength = 200) {
    if (value === undefined || value === null) return undefined;

    if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be text`);
    }

    if (value.length > maxLength) {
        throw new ValidationError(`${field} cannot be longer than ${maxLength} characters`);
    }

    return value;
}

export function optionalColor(value, field) {
    if (value === undefined || value === null || value === '') return undefined;

    if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be a hex colour such as #c8502a`);
    }

    let hex = value.trim();
    if (!hex.startsWith('#')) hex = `#${hex}`;

    if (SHORT_HEX_PATTERN.test(hex)) {
        hex = `#${hex.slice(1).split('').map(part => part + part).join('')}`;
    }

    if (!HEX_COLOR_PATTERN.test(hex)) {
        throw new ValidationError(`${field} must be a hex colour such as #c8502a`);
    }

    return hex.toLowerCase();
}

export function optionalPalette(value, field = 'palette') {
    if (value === undefined || value === null) return undefined;

    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be a list of hex colours`);
    }

    if (value.length > MAX_PALETTE_COLORS) {
        throw new ValidationError(`${field} cannot hold more than ${MAX_PALETTE_COLORS} colours`);
    }

    const parsed = value.map(entry => requireColor(entry, field));

    return [...new Set(parsed)];
}

export function optionalDate(value, field) {
    if (value === undefined || value === null) return undefined;
    if (value === '') return '';

    if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${field} must be a date such as 2026-09-01`);
    }

    return value;
}

export function optionalChecklists(value, field) {
    if (value === undefined) return undefined;

    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`);
    }

    if (value.length > MAX_CHECKLISTS) {
        throw new ValidationError(`${field} cannot contain more than ${MAX_CHECKLISTS} checklists`);
    }

    return value.map(entry => {
        if (!entry || typeof entry !== 'object') {
            throw new ValidationError(`${field} entries must be objects`);
        }

        const items = Array.isArray(entry.items) ? entry.items : [];

        if (items.length > MAX_SUBTASKS) {
            throw new ValidationError(`a checklist cannot contain more than ${MAX_SUBTASKS} items`);
        }

        const name = typeof entry.name === 'string' && entry.name.trim()
            ? entry.name.trim().slice(0, 80)
            : 'Checklist';

        return {
            id: requireID(entry.id, `${field}.id`),
            name,
            items: items.map(item => {
                if (!item || typeof item !== 'object') {
                    throw new ValidationError(`${field} items must be objects`);
                }

                return {
                    id: requireID(item.id, `${field}.items.id`),
                    text: typeof item.text === 'string' ? item.text.slice(0, 200) : '',
                    done: Boolean(item.done)
                };
            })
        };
    });
}

export function requireInteger(value, field, { min = 0, max = 10000 } = {}) {
    if (!Number.isInteger(value) || value < min || value > max) {
        throw new ValidationError(`${field} must be a whole number between ${min} and ${max}`);
    }
    return value;
}

export function optionalInteger(value, field, bounds) {
    if (value === undefined || value === null) return undefined;
    return requireInteger(value, field, bounds);
}

export function optionalBoolean(value, field) {
    if (value === undefined || value === null) return undefined;

    if (typeof value !== 'boolean' && value !== 0 && value !== 1) {
        throw new ValidationError(`${field} must be true or false`);
    }

    return Boolean(value);
}

const SLOT_ALIGNMENT_MS = 15 * 60 * 1000;

const IMAGE_SIGNATURES = [
    { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] }
];

export function detectImageMime(buffer) {
    if (!buffer || buffer.length < 12) {
        throw new ValidationError('image is empty or truncated');
    }

    for (const signature of IMAGE_SIGNATURES) {
        const matches = signature.bytes.every((byte, index) => buffer[index] === byte);
        if (matches) return signature.mime;
    }

    const riff = buffer.toString('ascii', 0, 4) === 'RIFF';
    const webp = buffer.toString('ascii', 8, 12) === 'WEBP';

    if (riff && webp) return 'image/webp';

    throw new ValidationError('only PNG, JPEG, WebP and GIF images are supported');
}

export function requireDimension(value, field) {
    const size = Number.parseInt(value, 10);

    if (!Number.isInteger(size) || size < 1 || size > 20000) {
        throw new ValidationError(`${field} must be between 1 and 20000`);
    }

    return size;
}

export function requireTimestamp(value, field) {
    if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be an ISO timestamp`);
    }

    const parsed = Date.parse(value);

    if (Number.isNaN(parsed)) {
        throw new ValidationError(`${field} must be a valid ISO timestamp`);
    }

    return new Date(parsed).toISOString();
}

export function optionalTimestamp(value, field) {
    if (value === undefined || value === null || value === '') return undefined;
    return requireTimestamp(value, field);
}

export function requireSlotList(value, field, slotMinutes, max = 400) {
    if (value === undefined || value === null) return [];

    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be a list`);
    }

    if (value.length > max) {
        throw new ValidationError(`${field} cannot contain more than ${max} slots`);
    }

    const parsed = value.map(entry => {
        const iso = requireTimestamp(entry, field);

        if (Date.parse(iso) % SLOT_ALIGNMENT_MS !== 0) {
            throw new ValidationError(`${field} must align to ${slotMinutes} minute boundaries`);
        }

        return iso;
    });

    return [...new Set(parsed)];
}

export function requireArray(value, field) {
    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be a list`);
    }

    if (value.length === 0) {
        throw new ValidationError(`${field} cannot be empty`);
    }

    if (value.length > MAX_BATCH_SIZE) {
        throw new ValidationError(`${field} cannot contain more than ${MAX_BATCH_SIZE} entries`);
    }

    return value;
}

// batch validation functions
export function requireTaskReorder(updates) {
    return requireArray(updates, 'updates').map(update => ({
        id: requireID(update?.id, 'updates.id'),
        listID: requireID(update?.listID, 'updates.listID'),
        taskOrder: requireInteger(update?.taskOrder, 'updates.taskOrder')
    }));
}

export function requireTabReorder(updates) {
    const parsed = requireArray(updates, 'updates').map(update => ({
        id: requireID(update?.id, 'updates.id'),
        groupID: optionalID(update?.groupID, 'updates.groupID'),
        tabOrder: requireInteger(update?.tabOrder, 'updates.tabOrder')
    }));

    if (new Set(parsed.map(update => update.id)).size !== parsed.length) {
        throw new ValidationError('updates cannot contain the same tab twice');
    }

    return parsed;
}

export function requireListReorder(updates) {
    return requireArray(updates, 'updates').map(update => ({
        id: requireID(update?.id, 'updates.id'),
        columnID: requireID(update?.columnID, 'updates.columnID'),
        listOrder: requireInteger(update?.listOrder, 'updates.listOrder')
    }));
}

export function requireNotationPageReorder(updates) {
    const parsed = requireArray(updates, 'updates').map(update => ({
        id: requireID(update?.id, 'updates.id'),
        groupID: optionalID(update?.groupID, 'updates.groupID'),
        pageOrder: requireInteger(update?.pageOrder, 'updates.pageOrder')
    }));

    if (new Set(parsed.map(update => update.id)).size !== parsed.length) {
        throw new ValidationError('updates cannot contain the same page twice');
    }

    return parsed;
}

export function requireNotationGroupReorder(updates) {
    const parsed = requireArray(updates, 'updates').map(update => ({
        id: requireID(update?.id, 'updates.id'),
        parentID: update?.parentID === undefined
            ? undefined
            : (optionalID(update.parentID, 'updates.parentID') ?? null),
        groupOrder: requireInteger(update?.groupOrder, 'updates.groupOrder')
    }));

    if (new Set(parsed.map(update => update.id)).size !== parsed.length) {
        throw new ValidationError('updates cannot contain the same group twice');
    }

    return parsed;
}

// account validation functions
export function requireUsername(value, field = 'username') {
    if (typeof value !== 'string' || !USERNAME_PATTERN.test(value)) {
        throw new ValidationError(`${field} must be 3 to 32 characters, letters, numbers, underscore or hyphen only`);
    }
    return value;
}

export function requirePassword(value, field = 'password') {
    if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
        throw new ValidationError(`${field} must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (value.length > MAX_PASSWORD_LENGTH) {
        throw new ValidationError(`${field} cannot be longer than ${MAX_PASSWORD_LENGTH} characters`);
    }
    if (CONTROL_CHARACTERS.test(value)) {
        throw new ValidationError(`${field} cannot contain control characters`);
    }
    return value;
}

export function requireRole(value, field = 'role') {
    if (!USER_ROLES.includes(value)) {
        throw new ValidationError(`${field} must be one of ${USER_ROLES.join(', ')}`);
    }
    return value;
}

export function requireMemberRole(value, field = 'role') {
    if (!MEMBER_ROLES.includes(value)) {
        throw new ValidationError(`${field} must be one of ${MEMBER_ROLES.join(', ')}`);
    }
    return value;
}

export function optionalIDList(value, field = 'ids') {
    if (value === undefined) return undefined;

    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`);
    }

    if (value.length > MAX_ASSIGNEES) {
        throw new ValidationError(`${field} cannot contain more than ${MAX_ASSIGNEES} entries`);
    }

    return [...new Set(value.map(entry => requireID(entry, field)))];
}

export function requireIDList(value, field = 'ids', max = MAX_BATCH_SIZE) {
    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be an array`);
    }

    if (value.length === 0) {
        throw new ValidationError(`${field} cannot be empty`);
    }

    if (value.length > max) {
        throw new ValidationError(`${field} cannot contain more than ${max} entries`);
    }

    return [...new Set(value.map(entry => requireID(entry, field)))];
}

export function requireColor(value, field = 'color') {
    const color = optionalColor(value, field);

    if (!color) {
        throw new ValidationError(`${field} is required`);
    }

    return color;
}

export function optionalNotationLayout(value, field = 'layout') {
    if (value === undefined || value === null) return undefined;

    if (typeof value !== 'string' || !NOTATION_LAYOUTS.includes(value)) {
        throw new ValidationError(`${field} must be one of ${NOTATION_LAYOUTS.join(', ')}`);
    }

    return value;
}

export function optionalTheme(value, field = 'theme') {
    if (value === undefined || value === null) return undefined;

    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new ValidationError(`${field} must be an object`);
    }

    if (!THEME_MODES.includes(value.mode)) {
        throw new ValidationError(`${field}.mode must be one of ${THEME_MODES.join(', ')}`);
    }

    const custom = {};

    for (const key of THEME_KEYS) {
        const entry = value.custom?.[key];
        if (entry !== undefined) custom[key] = requireColor(entry, `${field}.custom.${key}`);
    }

    return { mode: value.mode, custom };
}
