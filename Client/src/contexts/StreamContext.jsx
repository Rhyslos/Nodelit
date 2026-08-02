// context imports
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { api, openStream, clientID } from '../lib/api';
import { useAuth } from './AuthContext';

// context initialization
const StreamContext = createContext(null);

// context providers
export function StreamProvider({ children }) {
    const { user } = useAuth();

    // state variables
    const [connected, setConnected] = useState(false);

    // subscription references
    const subscribers = useRef(new Map());
    const workspaceRef = useRef(null);
    const sourceRef = useRef(null);
    const hasConnectedRef = useRef(false);

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
    const setWorkspace = useCallback(async workspaceID => {
        workspaceRef.current = workspaceID ?? null;

        if (!sourceRef.current) return;

        try {
            await api('/api/network/presence', {
                method: 'POST',
                body: { clientId: clientID, workspaceID: workspaceID ?? null }
            });
        } catch {
            setConnected(false);
        }
    }, []);

    // connection lifecycle
    useEffect(() => {
        if (!user) {
            sourceRef.current?.close();
            sourceRef.current = null;
            setConnected(false);
            return;
        }

        const params = workspaceRef.current ? { workspaceID: workspaceRef.current } : {};
        const source = openStream('/api/network/stream', params);
        sourceRef.current = source;

        source.onmessage = message => {
            let event;

            try {
                event = JSON.parse(message.data);
            } catch {
                return;
            }

            if (event.type === 'connected') {
                setConnected(true);
                if (workspaceRef.current) setWorkspace(workspaceRef.current);
                if (hasConnectedRef.current) dispatch({ type: 'reconnected' });
                hasConnectedRef.current = true;
                return;
            }

            dispatch(event);
        };

        source.onerror = () => setConnected(false);

        return () => {
            source.close();
            sourceRef.current = null;
            hasConnectedRef.current = false;
            setConnected(false);
        };
    }, [user, dispatch, setWorkspace]);

    return (
        <StreamContext.Provider value={{ connected, subscribe, setWorkspace }}>
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
