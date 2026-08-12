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

// context providers
export function NotationProvider({ children }) {
    const { workspaceID } = useParams();
    const { subscribe } = useStream();

    // state variables
    const [notationData, setNotationData] = useState(EMPTY_NOTATION);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [memberRole, setMemberRole] = useState(null);

    const workspaceRef = useRef(workspaceID);
    workspaceRef.current = workspaceID;

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
            if (workspaceRef.current === workspaceID) setError(err);
        } finally {
            if (workspaceRef.current === workspaceID) setLoading(false);
        }
    }, [workspaceID]);

    useEffect(() => {
        setLoading(true);
        setNotationData(EMPTY_NOTATION);
        setActionError(null);
        refresh();
    }, [refresh]);

    // stream subscription
    useEffect(() => {
        const stopNotation = subscribe('notation', event => {
            setNotationData(current => applyDelta(current, event));
        });

        const stopReconnect = subscribe('reconnected', () => refresh());

        const stopRevoked = subscribe('revoked', event => {
            if (event.workspaceID !== workspaceRef.current) return;
            setNotationData(EMPTY_NOTATION);
            setError(new Error('You no longer have access to this workspace'));
        });

        return () => {
            stopNotation();
            stopReconnect();
            stopRevoked();
        };
    }, [subscribe, refresh]);

    return (
        <NotationContext.Provider value={{ notationData, setNotationData, applyDelta, workspaceID, loading, error, actionError, setActionError, refresh, memberRole, canEdit: EDIT_ROLES.has(memberRole) }}>
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
