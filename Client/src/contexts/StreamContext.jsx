// context imports
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api, openStream, clientID } from '../lib/api';
import { useAuth } from './AuthContext';

// context initialization
const StreamContext = createContext(null);

const MAX_RETRY_MS = 30000;

const UNSCOPED_EVENTS = new Set(['revoked', 'presence-denied']);

// utility functions
async function sessionStillValid() {
    try {
        await api('/api/auth/session');
        return true;
    } catch (error) {
        return error?.status !== 401;
    }
}

// context providers
export function StreamProvider({ children }) {
    const { user } = useAuth();
    const userID = user?.id ?? null;

    // state variables
    const [connected, setConnected] = useState(false);
    const [generation, setGeneration] = useState(0);

    // subscription references
    const subscribers = useRef(new Map());
    const holds = useRef([]);
    const legacyRelease = useRef(null);
    const workspaceRef = useRef(null);
    const sourceRef = useRef(null);
    const hasConnectedRef = useRef(false);
    const retryRef = useRef({ attempt: 0, timer: null });

    // subscription functions
    const subscribe = useCallback((type, handler) => {
        if (!subscribers.current.has(type)) subscribers.current.set(type, new Set());
        subscribers.current.get(type).add(handler);

        return () => {
            subscribers.current.get(type)?.delete(handler);
        };
    }, []);

    const dispatch = useCallback(event => {
        const handlers = subscribers.current.get(event.type);
        if (!handlers) return;
        for (const handler of handlers) handler(event);
    }, []);

    // presence functions
    const syncPresence = useCallback(async () => {
        if (!sourceRef.current) return;

        const workspaceID = workspaceRef.current;

        try {
            await api('/api/network/presence', {
                method: 'POST',
                body: { clientId: clientID, workspaceID }
            });
        } catch (error) {
            if (error?.status === 404 && workspaceID && workspaceID === workspaceRef.current) {
                dispatch({ type: 'presence-denied', workspaceID });
            }
        }
    }, [dispatch]);

    const applyHolds = useCallback(() => {
        const next = holds.current.at(-1)?.workspaceID ?? null;
        if (next === workspaceRef.current) return;

        workspaceRef.current = next;
        syncPresence();
    }, [syncPresence]);

    // workspace functions
    const attachWorkspace = useCallback(workspaceID => {
        const token = {};
        holds.current = [...holds.current, { workspaceID: workspaceID ?? null, token }];
        applyHolds();

        return () => {
            holds.current = holds.current.filter(hold => hold.token !== token);
            applyHolds();
        };
    }, [applyHolds]);

    const setWorkspace = useCallback(workspaceID => {
        legacyRelease.current?.();
        legacyRelease.current = workspaceID ? attachWorkspace(workspaceID) : null;
    }, [attachWorkspace]);

    // connection lifecycle
    useEffect(() => {
        const retry = retryRef.current;

        if (!userID) {
            sourceRef.current?.close();
            sourceRef.current = null;
            hasConnectedRef.current = false;
            retry.attempt = 0;
            setConnected(false);
            return;
        }

        const params = workspaceRef.current ? { workspaceID: workspaceRef.current } : {};
        const source = openStream('/api/network/stream', params);
        sourceRef.current = source;

        function reconnectLater() {
            clearTimeout(retry.timer);
            const delay = Math.min(MAX_RETRY_MS, 1000 * 2 ** retry.attempt);
            retry.attempt += 1;
            retry.timer = setTimeout(() => setGeneration(value => value + 1), delay);
        }

        async function recover() {
            source.close();
            setConnected(false);

            const valid = await sessionStillValid();
            if (valid && sourceRef.current === source) reconnectLater();
        }

        source.onmessage = message => {
            let event;

            try {
                event = JSON.parse(message.data);
            } catch {
                return;
            }

            if (event.type === 'connected') {
                retry.attempt = 0;
                setConnected(true);
                if (workspaceRef.current) syncPresence();
                if (hasConnectedRef.current) dispatch({ type: 'reconnected' });
                hasConnectedRef.current = true;
                return;
            }

            if (event.type === 'unauthenticated') {
                recover();
                return;
            }

            if (event.workspaceID
                && !UNSCOPED_EVENTS.has(event.type)
                && event.workspaceID !== workspaceRef.current) {
                return;
            }

            dispatch(event);
        };

        source.onerror = () => {
            setConnected(false);

            if (source.readyState === EventSource.CLOSED) recover();
        };

        return () => {
            clearTimeout(retry.timer);
            source.close();
            if (sourceRef.current === source) sourceRef.current = null;
            setConnected(false);
        };
    }, [userID, generation, dispatch, syncPresence]);

    return (
        <StreamContext.Provider value={{ connected, subscribe, attachWorkspace, setWorkspace }}>
            {children}
        </StreamContext.Provider>
    );
}

// hook exports
export function useStream() {
    const context = useContext(StreamContext);

    if (!context) {
        throw new Error('useStream must be used inside a StreamProvider');
    }

    return context;
}
