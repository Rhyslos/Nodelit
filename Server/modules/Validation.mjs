// configuration constants
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BATCH_SIZE = 200;
const MAX_SUBTASKS = 50;
const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
const USER_ROLES = ['admin', 'member'];
const MEMBER_ROLES = ['member', 'viewer'];

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

    if (typeof value !== 'string' || !HEX_COLOR_PATTERN.test(value)) {
        throw new ValidationError(`${field} must be a hex colour such as #c8502a`);
    }

    return value;
}

export function optionalDate(value, field) {
    if (value === undefined || value === null) return undefined;
    if (value === '') return '';

    if (typeof value !== 'string' || !DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
        throw new ValidationError(`${field} must be a date such as 2026-09-01`);
    }

    return value;
}

export function optionalSubtasks(value, field) {
    if (value === undefined || value === null) return undefined;

    if (!Array.isArray(value)) {
        throw new ValidationError(`${field} must be a list`);
    }

    if (value.length > MAX_SUBTASKS) {
        throw new ValidationError(`${field} cannot contain more than ${MAX_SUBTASKS} entries`);
    }

    return value.map(item => ({
        id: requireID(item?.id, `${field}.id`),
        text: optionalText(item?.text, `${field}.text`, 200) ?? '',
        done: item?.done === true
    }));
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

export function requireListReorder(updates) {
    return requireArray(updates, 'updates').map(update => ({
        id: requireID(update?.id, 'updates.id'),
        columnID: requireID(update?.columnID, 'updates.columnID'),
        listOrder: requireInteger(update?.listOrder, 'updates.listOrder')
    }));
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
