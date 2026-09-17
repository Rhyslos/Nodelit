// context imports
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStream } from './StreamContext';

// context initialization
const NotationContext = createContext(null);

const EMPTY_NOTATION = { groups: [], pages: [] };
const EDIT_ROLES = new Set(['owner', 'member']);
const COLLECTIONS = ['groups', 'pages'];

// utility functions
function applyDelta(notation, delta) {
    const next = { ...notation };

    for (const collection of COLLECTIONS) {
        const upserts = delta.upsert?.[collection] ?? [];
        const removals = delta.remove?.[collection] ?? [];

        if (upserts.length === 0 && removals.length === 0) continue;

        const byID = new Map(next[collection].map(record => [record.id, record]));

        for (const record of upserts) byID.set(record.id, record);
        for (const id of removals) byID.delete(id);

        next[collection] = Array.from(byID.values());
    }

    return next;
}

// access functions
function accessLost(err) {
    return err?.status === 403 || err?.status === 404;
}

// context providers
export function NotationProvider({ children }) {
    const { workspaceID } = useParams();
    const { subscribe, attachWorkspace } = useStream();

    // state variables
    const [notationData, setNotationData] = useState(EMPTY_NOTATION);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [memberRole, setMemberRole] = useState(null);
    const [removedImageIDs, setRemovedImageIDs] = useState(() => new Set());

    const workspaceRef = useRef(workspaceID);
    workspaceRef.current = workspaceID;

    const dropNotation = useCallback(err => {
        setNotationData(EMPTY_NOTATION);
        setMemberRole(null);
        setError(err);
    }, []);

    // data fetching
    const refresh = useCallback(async () => {
        if (!workspaceID) return;

        try {
            const data = await api(`/api/notation/${workspaceID}`);
            if (workspaceRef.current !== workspaceID) return;

            const { memberRole: role, ...notation } = data;
            setMemberRole(role ?? null);
            setNotationData({ ...EMPTY_NOTATION, ...notation });
            setError(null);
        } catch (err) {
            if (workspaceRef.current !== workspaceID) return;
            if (accessLost(err)) dropNotation(err);
            else setError(err);
        } finally {
            if (workspaceRef.current === workspaceID) setLoading(false);
        }
    }, [workspaceID, dropNotation]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setNotationData(EMPTY_NOTATION);
        setActionError(null);
        setRemovedImageIDs(new Set());
        refresh();
    }, [refresh]);

    // stream subscription
    useEffect(() => {
        if (!workspaceID) return undefined;
        return attachWorkspace(workspaceID);
    }, [workspaceID, attachWorkspace]);

    useEffect(() => {
        const stopNotation = subscribe('notation', event => {
            setNotationData(current => applyDelta(current, event));
        });

        const stopReconnect = subscribe('reconnected', () => refresh());

        const stopImages = subscribe('notation-images', event => {
            setRemovedImageIDs(current => new Set([...current, ...(event.removed ?? [])]));
        });

        const lose = event => {
            if (event.workspaceID !== workspaceRef.current) return;
            dropNotation(Object.assign(new Error('You no longer have access to this workspace'), { status: 403 }));
        };

        const stopRevoked = subscribe('revoked', lose);
        const stopDenied = subscribe('presence-denied', lose);

        return () => {
            stopNotation();
            stopImages();
            stopReconnect();
            stopRevoked();
            stopDenied();
        };
    }, [subscribe, refresh, dropNotation]);

    return (
        <NotationContext.Provider value={{ notationData, setNotationData, applyDelta, workspaceID, loading, error, actionError, setActionError, refresh, memberRole, canEdit: EDIT_ROLES.has(memberRole), removedImageIDs }}>
            {children}
        </NotationContext.Provider>
    );
}

// hook exports
export function useNotation() {
    const context = useContext(NotationContext);

    if (!context) {
        throw new Error('useNotation must be used inside a NotationProvider');
    }

    return context;
}
