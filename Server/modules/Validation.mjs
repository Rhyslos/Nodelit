// configuration constants
const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const MAX_BATCH_SIZE = 200;

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
