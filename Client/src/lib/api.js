// configuration constants
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';
export const clientID = crypto.randomUUID();

// state variables
const unauthorizedHandlers = new Set();

// error classes
export class ApiError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload;
    }
}

// subscription functions
export function onUnauthorized(handler) {
    unauthorizedHandlers.add(handler);
    return () => unauthorizedHandlers.delete(handler);
}

function notifyUnauthorized() {
    for (const handler of unauthorizedHandlers) handler();
}

// request functions
export async function api(path, { method = 'GET', body, signal } = {}) {
    const headers = {
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Id': clientID
    };

    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        credentials: 'include',
        signal,
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const isJSON = response.headers.get('content-type')?.includes('application/json');
    const payload = isJSON ? await response.json().catch(() => null) : null;

    if (response.status === 401) {
        notifyUnauthorized();
        throw new ApiError(payload?.error ?? 'Your session has ended', 401, payload);
    }

    if (!response.ok) {
        throw new ApiError(payload?.error ?? 'Something went wrong', response.status, payload);
    }

    return payload;
}

// stream functions
export function openStream(path, params = {}) {
    const query = new URLSearchParams({ clientId: clientID, ...params });
    return new EventSource(`${API_BASE}${path}?${query}`, { withCredentials: true });
}
