// context imports
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStream } from './StreamContext';

// context initialization
const KanbanContext = createContext(null);

const EMPTY_BOARD = { tabs: [], columns: [], lists: [], tasks: [] };
const EDIT_ROLES = new Set(['owner', 'member']);
const COLLECTIONS = ['tabs', 'columns', 'lists', 'tasks'];

// utility functions
function applyDelta(board, delta) {
    const next = { ...board };

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
export function KanbanProvider({ children }) {
    const { workspaceID } = useParams();
    const { subscribe, setWorkspace } = useStream();

    // state variables
    const [boardData, setBoardData] = useState(EMPTY_BOARD);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [memberRole, setMemberRole] = useState(null);

    const workspaceRef = useRef(workspaceID);
    workspaceRef.current = workspaceID;

    // data fetching
    const refresh = useCallback(async () => {
        if (!workspaceID) return;

        try {
            const data = await api(`/api/kanban/${workspaceID}`);
            if (workspaceRef.current !== workspaceID) return;

            const { memberRole: role, ...board } = data;
            setMemberRole(role ?? null);
            setBoardData({ ...EMPTY_BOARD, ...board });
            setError(null);
        } catch (err) {
            if (workspaceRef.current === workspaceID) setError(err);
        } finally {
            if (workspaceRef.current === workspaceID) setLoading(false);
        }
    }, [workspaceID]);

    useEffect(() => {
        setLoading(true);
        setBoardData(EMPTY_BOARD);
        refresh();
    }, [refresh]);

    // stream subscription
    useEffect(() => {
        setWorkspace(workspaceID ?? null);
        return () => setWorkspace(null);
    }, [workspaceID, setWorkspace]);

    useEffect(() => {
        const stopKanban = subscribe('kanban', event => {
            setBoardData(current => applyDelta(current, event));
        });

        const stopReconnect = subscribe('reconnected', () => refresh());

        return () => {
            stopKanban();
            stopReconnect();
        };
    }, [subscribe, refresh]);

    return (
        <KanbanContext.Provider value={{ boardData, setBoardData, applyDelta, workspaceID, loading, error, refresh, memberRole, canEdit: EDIT_ROLES.has(memberRole) }}>
            {children}
        </KanbanContext.Provider>
    );
}

// hook exports
export function useKanban() {
    const context = useContext(KanbanContext);

    if (!context) {
        throw new Error('useKanban must be used inside a KanbanProvider');
    }

    return context;
}