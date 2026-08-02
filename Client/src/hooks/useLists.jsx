// hook imports
import { useMemo } from 'react';
import { api } from '../lib/api';
import { useKanban } from '../contexts/KanbanContext';

// hook functions
export function useLists(columnIDs) {
    const { boardData, setBoardData, applyDelta, refresh } = useKanban();

    // state variables
    const columnKey = columnIDs.join('|');

    const lists = useMemo(() => {
        const allowed = new Set(columnKey ? columnKey.split('|') : []);
        return boardData.lists
            .filter(l => allowed.has(l.columnID))
            .sort((a, b) => a.listOrder - b.listOrder);
    }, [boardData.lists, columnKey]);

    // mutation functions
    async function addList(columnID) {
        if (!columnID) return null;

        try {
            const list = await api('/api/kanban/lists', {
                method: 'POST',
                body: { columnID }
            });

            setBoardData(prev => applyDelta(prev, { upsert: { lists: [list] } }));
            return list.id;
        } catch {
            refresh();
            return null;
        }
    }

    async function updateList(listID, changes) {
        setBoardData(prev => ({
            ...prev,
            lists: prev.lists.map(l => l.id === listID ? { ...l, ...changes } : l)
        }));

        try {
            const list = await api(`/api/kanban/lists/${listID}`, { method: 'PUT', body: changes });
            setBoardData(prev => applyDelta(prev, { upsert: { lists: [list] } }));
        } catch {
            refresh();
        }
    }

    async function reorderLists(updates, pruneColumnID) {
        if (!updates || updates.length === 0) return;

        setBoardData(prev => {
            const moved = new Map(updates.map(u => [u.id, u]));

            const nextLists = prev.lists.map(l => {
                const update = moved.get(l.id);
                return update ? { ...l, columnID: update.columnID, listOrder: update.listOrder } : l;
            });

            const nextColumns = pruneColumnID
                ? prev.columns.filter(c => c.id !== pruneColumnID)
                : prev.columns;

            return { ...prev, lists: nextLists, columns: nextColumns };
        });

        try {
            const result = await api('/api/kanban/lists/reorder', {
                method: 'PUT',
                body: { updates, pruneColumnID: pruneColumnID ?? null }
            });

            setBoardData(prev => applyDelta(prev, {
                upsert: { lists: result.lists },
                remove: result.removed
            }));
        } catch {
            refresh();
        }
    }

    async function deleteList(listID, pruneColumnID) {
        setBoardData(prev => {
            const removedTaskIDs = prev.tasks.filter(t => t.listID === listID).map(t => t.id);

            return applyDelta(prev, {
                remove: {
                    lists: [listID],
                    tasks: removedTaskIDs,
                    columns: pruneColumnID ? [pruneColumnID] : []
                }
            });
        });

        try {
            const query = pruneColumnID ? `?pruneColumnID=${encodeURIComponent(pruneColumnID)}` : '';
            const { removed } = await api(`/api/kanban/lists/${listID}${query}`, { method: 'DELETE' });
            setBoardData(prev => applyDelta(prev, { remove: removed }));
        } catch {
            refresh();
        }
    }

    return { lists, addList, updateList, deleteList, reorderLists };
}
