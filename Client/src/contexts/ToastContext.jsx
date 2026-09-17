// context imports
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// context initialization
const ToastContext = createContext(null);

const DISMISSABLE_MS = 6000;
const DEDUPE_MS = 3000;
const MAX_TOASTS = 4;

// utility functions
function describe(error, fallback) {
    const status = error?.status ?? null;
    const detail = typeof error?.message === 'string' ? error.message : '';

    if (status === 413) {
        return {
            tone: 'warning',
            title: fallback ?? 'That is too large to upload',
            detail: detail || 'Try a smaller file.',
            duration: DISMISSABLE_MS
        };
    }

    if (status === 429) {
        return {
            tone: 'warning',
            title: fallback ?? 'Slow down a little',
            detail: detail || 'Too many requests. Your change was not saved; try again shortly.',
            duration: DISMISSABLE_MS
        };
    }

    if (status === 400 || status === 403 || status === 404 || status === 409) {
        return {
            tone: 'warning',
            title: fallback ?? 'That did not work',
            detail,
            duration: DISMISSABLE_MS
        };
    }

    if (status && status >= 500) {
        return {
            tone: 'danger',
            title: fallback ?? 'The server could not complete that',
            detail: 'Your change was not saved.',
            duration: null
        };
    }

    return {
        tone: 'danger',
        title: fallback ?? 'Could not reach the server',
        detail: 'Your change was not saved.',
        duration: null
    };
}

// context providers
export function ToastProvider({ children }) {
    // state variables
    const [toasts, setToasts] = useState([]);

    // dedupe references
    const recent = useRef(new Map());
    const timers = useRef(new Map());

    // mutation functions
    const dismiss = useCallback(id => {
        const timer = timers.current.get(id);

        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }

        setToasts(current => current.filter(toast => toast.id !== id));
    }, []);

    const push = useCallback(toast => {
        const signature = `${toast.tone}:${toast.title}:${toast.detail}`;
        const now = Date.now();
        const seen = recent.current.get(signature);

        if (seen && now - seen < DEDUPE_MS) return null;

        for (const [key, at] of recent.current) {
            if (now - at >= DEDUPE_MS) recent.current.delete(key);
        }

        recent.current.set(signature, now);

        const id = `toast-${now}-${Math.random().toString(16).slice(2, 8)}`;

        setToasts(current => {
            const next = [...current, { ...toast, id }];

            for (const evicted of next.slice(0, -MAX_TOASTS)) {
                clearTimeout(timers.current.get(evicted.id));
                timers.current.delete(evicted.id);
            }

            return next.slice(-MAX_TOASTS);
        });

        if (toast.duration) {
            timers.current.set(id, setTimeout(() => dismiss(id), toast.duration));
        }

        return id;
    }, [dismiss]);

    useEffect(() => {
        const pending = timers.current;
        return () => {
            for (const timer of pending.values()) clearTimeout(timer);
            pending.clear();
        };
    }, []);

    const notifyError = useCallback((error, fallback) => {
        if (error?.status === 401) return null;
        return push(describe(error, fallback));
    }, [push]);

    const notify = useCallback((title, detail = '') => {
        return push({ tone: 'info', title, detail, duration: DISMISSABLE_MS });
    }, [push]);

    return (
        <ToastContext.Provider value={{ toasts, notify, notifyError, dismiss }}>
            {children}
        </ToastContext.Provider>
    );
}

// hook exports
export function useToast() {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error('useToast must be used inside a ToastProvider');
    }

    return context;
}
