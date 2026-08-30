// hook imports
import { useMemo } from 'react';
import { api } from '../lib/api';
import { useKanban } from '../contexts/KanbanContext';
import { useToast } from '../contexts/ToastContext';

// hook functions
export function useColumns(workspaceID, tabID) {
    const { notifyError } = useToast();

    const { boardData, setBoardData, applyDelta, refresh } = useKanban();

    // state variables
    const columns = useMemo(
        () => boardData.columns
            .filter(c => c.tabID === tabID)
            .sort((a, b) => a.columnIndex - b.columnIndex),
        [boardData.columns, tabID]
    );

    // mutation functions
    async function addColumn(columnIndex) {
        if (!tabID) return null;

        try {
            const column = await api('/api/kanban/columns', {
                method: 'POST',
                body: { tabID, columnIndex }
            });

            setBoardData(prev => applyDelta(prev, { upsert: { columns: [column] } }));
            return column.id;
        } catch (error) {
            notifyError(error, 'Could not create the column');
            refresh();
            return null;
        }
    }

    async function deleteColumn(columnID) {
        setBoardData(prev => applyDelta(prev, { remove: { columns: [columnID] } }));

        try {
            const result = await api(`/api/kanban/columns/${columnID}`, { method: 'DELETE' });

            setBoardData(prev => applyDelta(prev, {
                upsert: { columns: result.columns },
                remove: result.removed
            }));
        } catch (error) {
            notifyError(error, 'Could not delete the column');
            refresh();
        }
    }

    async function reorderColumns() {
        refresh();
    }

    return { columns, addColumn, deleteColumn, reorderColumns };
}