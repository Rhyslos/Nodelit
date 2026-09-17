// context imports
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useStream } from './StreamContext';
import { useAuth } from './AuthContext';

// context initialization
const KanbanContext = createContext(null);

const EMPTY_BOARD = { tabs: [], tabGroups: [], columns: [], lists: [], tasks: [], tags: [] };
const EDIT_ROLES = new Set(['owner', 'member']);
const COLLECTIONS = ['tabs', 'tabGroups', 'columns', 'lists', 'tasks', 'tags'];
const CHECKLIST_STORAGE_PREFIX = 'nodelit:checklists:';
const BOARD_REFRESH_EVENT = 'nodelit:board-refresh';

// utility functions
function checklistKey(userID, workspaceID) {
    return `${CHECKLIST_STORAGE_PREFIX}${userID}:${workspaceID}`;
}

function accessLost(err) {
    return err?.status === 403 || err?.status === 404;
}

function persistChecklists(key, taskIDs) {
    if (!key) return;

    try {
        localStorage.setItem(key, JSON.stringify([...taskIDs]));
    } catch {
        return;
    }
}

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
    const { subscribe, attachWorkspace } = useStream();
    const { user } = useAuth();
    const userID = user?.id ?? null;

    // state variables
    const [boardData, setBoardData] = useState(EMPTY_BOARD);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [memberRole, setMemberRole] = useState(null);
    const [expandedChecklists, setExpandedChecklists] = useState(() => new Set());

    const workspaceRef = useRef(workspaceID);
    workspaceRef.current = workspaceID;

    const storageKey = userID && workspaceID ? checklistKey(userID, workspaceID) : null;
    const storageKeyRef = useRef(storageKey);
    storageKeyRef.current = storageKey;

    // access functions
    const dropBoard = useCallback(err => {
        setBoardData(EMPTY_BOARD);
        setMemberRole(null);
        setError(err);
    }, []);

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
            if (workspaceRef.current !== workspaceID) return;
            if (accessLost(err)) dropBoard(err);
            else setError(err);
        } finally {
            if (workspaceRef.current === workspaceID) setLoading(false);
        }
    }, [workspaceID, dropBoard]);

    useEffect(() => {
        setLoading(true);
        setError(null);
        setBoardData(EMPTY_BOARD);
        refresh();
    }, [refresh]);

    // checklist preferences
    useEffect(() => {
        if (!storageKey) {
            setExpandedChecklists(new Set());
            return;
        }

        try {
            const stored = localStorage.getItem(storageKey);
            setExpandedChecklists(new Set(stored ? JSON.parse(stored) : []));
        } catch {
            setExpandedChecklists(new Set());
        }
    }, [storageKey]);

    const toggleChecklist = useCallback(taskID => {
        setExpandedChecklists(previous => {
            const next = new Set(previous);

            if (next.has(taskID)) next.delete(taskID);
            else next.add(taskID);

            persistChecklists(storageKeyRef.current, next);

            return next;
        });
    }, []);

    useEffect(() => {
        function handleRefresh() { refresh(); }

        window.addEventListener(BOARD_REFRESH_EVENT, handleRefresh);
        return () => window.removeEventListener(BOARD_REFRESH_EVENT, handleRefresh);
    }, [refresh]);

    // stream subscription
    useEffect(() => {
        if (!workspaceID) return undefined;
        return attachWorkspace(workspaceID);
    }, [workspaceID, attachWorkspace]);

    useEffect(() => {
        const stopKanban = subscribe('kanban', event => {
            setBoardData(current => applyDelta(current, event));
        });

        const stopReconnect = subscribe('reconnected', () => refresh());

        const lose = event => {
            if (event.workspaceID !== workspaceRef.current) return;
            dropBoard(Object.assign(new Error('You no longer have access to this workspace'), { status: 403 }));
        };

        const stopRevoked = subscribe('revoked', lose);
        const stopDenied = subscribe('presence-denied', lose);

        return () => {
            stopKanban();
            stopReconnect();
            stopRevoked();
            stopDenied();
        };
    }, [subscribe, refresh, dropBoard]);

    return (
        <KanbanContext.Provider value={{ boardData, setBoardData, applyDelta, workspaceID, loading, error, refresh, memberRole, canEdit: EDIT_ROLES.has(memberRole), expandedChecklists, toggleChecklist }}>
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
