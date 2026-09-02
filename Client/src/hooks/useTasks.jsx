// hook imports
import { useMemo } from 'react';
import { api, ApiError } from '../lib/api';
import { useKanban } from '../contexts/KanbanContext';
import { useToast } from '../contexts/ToastContext';

// configuration constants
const CONTENT_FIELDS = ['title', 'description', 'isCompleted', 'deadline', 'checklists', 'assignedUsers'];

// hook functions
export function useTasks(listIDs) {
    const { notifyError } = useToast();

    const { boardData, setBoardData, applyDelta, refresh } = useKanban();

    // state variables
    const listKey = listIDs.join('|');

    const tasks = useMemo(() => {
        const allowed = new Set(listKey ? listKey.split('|') : []);
        return boardData.tasks
            .filter(t => allowed.has(t.listID))
            .sort((a, b) => a.taskOrder - b.taskOrder);
    }, [boardData.tasks, listKey]);

    // mutation functions
    async function addTask(listID) {
        if (!listID) return null;

        try {
            const task = await api('/api/kanban/tasks', {
                method: 'POST',
                body: { listID }
            });

            setBoardData(prev => applyDelta(prev, { upsert: { tasks: [task] } }));
            return task.id;
        } catch (error) {
            notifyError(error, 'Could not create the task');
            refresh();
            return null;
        }
    }

    async function updateTask(taskID, changes) {
        const current = boardData.tasks.find(t => t.id === taskID);
        if (!current) return;

        const body = {};
        for (const field of CONTENT_FIELDS) {
            if (changes[field] !== undefined) body[field] = changes[field];
        }

        if (Object.keys(body).length === 0) return;

        body.updatedAt = current.updatedAt;

        setBoardData(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === taskID ? { ...t, ...changes } : t)
        }));

        try {
            const task = await api(`/api/kanban/tasks/${taskID}`, { method: 'PUT', body });
            setBoardData(prev => applyDelta(prev, { upsert: { tasks: [task] } }));
        } catch (err) {
            if (err instanceof ApiError && err.status === 409 && err.payload?.record) {
                setBoardData(prev => applyDelta(prev, { upsert: { tasks: [err.payload.record] } }));
                return;
            }

            notifyError(err, 'Could not save the task');
            refresh();
        }
    }

    async function duplicateTask(taskID) {
        try {
            const result = await api(`/api/kanban/tasks/${taskID}/duplicate`, { method: 'POST' });
            setBoardData(prev => applyDelta(prev, { upsert: { tasks: result.tasks } }));

            return result.task?.id ?? null;
        } catch (error) {
            notifyError(error, 'Could not duplicate the task');
            refresh();
            return null;
        }
    }

    async function deleteTask(taskID) {
        setBoardData(prev => applyDelta(prev, { remove: { tasks: [taskID] } }));

        try {
            await api(`/api/kanban/tasks/${taskID}`, { method: 'DELETE' });
        } catch (error) {
            notifyError(error, 'Could not delete the task');
            refresh();
        }
    }

    async function reorderTasks(updates) {
        if (!updates || updates.length === 0) return;

        setBoardData(prev => {
            const moved = new Map(updates.map(u => [u.id, u]));

            return {
                ...prev,
                tasks: prev.tasks.map(t => {
                    const update = moved.get(t.id);
                    return update ? { ...t, listID: update.listID, taskOrder: update.taskOrder } : t;
                })
            };
        });

        try {
            const result = await api('/api/kanban/tasks/reorder', {
                method: 'PUT',
                body: { updates }
            });

            setBoardData(prev => applyDelta(prev, { upsert: { tasks: result.tasks } }));
        } catch (error) {
            notifyError(error, 'Could not move the task');
            refresh();
        }
    }

    async function setTaskTags(taskID, tagIDs) {
        setBoardData(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => t.id === taskID ? { ...t, tagIDs } : t)
        }));

        try {
            const task = await api(`/api/kanban/tasks/${taskID}/tags`, { method: 'PUT', body: { tagIDs } });
            setBoardData(prev => applyDelta(prev, { upsert: { tasks: [task] } }));
        } catch (error) {
            notifyError(error, 'Could not update the task tags');
            refresh();
        }
    }

    return { tasks, addTask, updateTask, duplicateTask, deleteTask, reorderTasks, setTaskTags };
}
