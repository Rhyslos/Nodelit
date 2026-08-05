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

    async function reorderLists(updates) {
        if (!updates || updates.length === 0) return;

        setBoardData(prev => {
            const moved = new Map(updates.map(u => [u.id, u]));

            const nextLists = prev.lists.map(l => {
                const update = moved.get(l.id);
                return update ? { ...l, columnID: update.columnID, listOrder: update.listOrder } : l;
            });

            return { ...prev, lists: nextLists };
        });

        try {
            const result = await api('/api/kanban/lists/reorder', {
                method: 'PUT',
                body: { updates }
            });

            setBoardData(prev => applyDelta(prev, {
                upsert: { lists: result.lists, columns: result.columns },
                remove: result.removed
            }));
        } catch (error) {
            console.error('reorderLists failed:', error);
            refresh();
        }
    }

    async function deleteList(listID) {
        setBoardData(prev => {
            const removedTaskIDs = prev.tasks.filter(t => t.listID === listID).map(t => t.id);

            return applyDelta(prev, {
                remove: { lists: [listID], tasks: removedTaskIDs }
            });
        });

        try {
            const result = await api(`/api/kanban/lists/${listID}`, { method: 'DELETE' });

            setBoardData(prev => applyDelta(prev, {
                upsert: { columns: result.columns },
                remove: result.removed
            }));
        } catch (error) {
            console.error('deleteList failed:', error);
            refresh();
        }
    }

    return { lists, addList, updateList, deleteList, reorderLists };
}