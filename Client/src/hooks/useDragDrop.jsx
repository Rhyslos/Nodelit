// initialization functions
import { useState, useRef, useEffect, useCallback } from 'react';

// hook functions
export function useDragDrop({
    tasks,
    lists,
    columns,
    onReorderTasks,
    onReorderLists,
    onGhostDrop,
    onDeleteDrop,
}) {
    // state variables
    const [dragging, setDragging] = useState(null);
    const [dragType, setDragType] = useState(null);
    const [cloneMeta, setCloneMeta] = useState(null);
    const [insertionPoint, setInsertionPoint] = useState(null);
    const [isOverDeleteZone, setIsOverDeleteZone] = useState(false);

    // dom references
    const listRefs = useRef({});
    const taskRefs = useRef({});
    const ghostRefs = useRef({});
    const deleteZoneRef = useRef(null);
    const dragOffset = useRef({ x: 0, y: 0 });
    const draggingRef = useRef(null);
    const tasksRef = useRef(tasks);
    const listsRef = useRef(lists || []);
    const columnsRef = useRef(columns || []);
    const lastPos = useRef({ x: 0, y: 0 });
    const cloneOuterRef = useRef(null);
    const cloneInnerRef = useRef(null);
    const tiltRef = useRef(0);
    const targetTiltRef = useRef(0);
    const rafRef = useRef(null);

    // callback references
    const onGhostDropRef = useRef(onGhostDrop);
    const onReorderTasksRef = useRef(onReorderTasks);
    const onReorderListsRef = useRef(onReorderLists);
    const onDeleteDropRef = useRef(onDeleteDrop);

    // lifecycle functions
    useEffect(() => { onGhostDropRef.current = onGhostDrop; }, [onGhostDrop]);
    useEffect(() => { onReorderTasksRef.current = onReorderTasks; }, [onReorderTasks]);
    useEffect(() => { onReorderListsRef.current = onReorderLists; }, [onReorderLists]);
    useEffect(() => { onDeleteDropRef.current = onDeleteDrop; }, [onDeleteDrop]);
    useEffect(() => { tasksRef.current = tasks; }, [tasks]);
    useEffect(() => { if (lists) listsRef.current = lists; }, [lists]);
    useEffect(() => { if (columns) columnsRef.current = columns; }, [columns]);

    // registration functions
    function registerList(listId, el) {
        if (el) listRefs.current[listId] = el;
        else delete listRefs.current[listId];
    }

    function registerTask(taskId, el) {
        if (el) taskRefs.current[taskId] = el;
        else delete taskRefs.current[taskId];
    }

    function registerGhost(key, el) {
        if (el) ghostRefs.current[key] = el;
        else delete ghostRefs.current[key];
    }

    function registerDeleteZone(el) { deleteZoneRef.current = el; }
    function registerCloneOuter(el) { cloneOuterRef.current = el; }
    function registerCloneInner(el) { cloneInnerRef.current = el; }

    // collision functions
    function isPointOverDeleteZone(cx, cy) {
        const el = deleteZoneRef.current;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    }

    // event functions
    const onMouseMove = useCallback((e) => {
        if (!draggingRef.current) return;

        const dx = e.clientX - lastPos.current.x;
        lastPos.current = { x: e.clientX, y: e.clientY };

        targetTiltRef.current = Math.max(-15, Math.min(15, dx * 0.8));

        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            tiltRef.current = tiltRef.current + (targetTiltRef.current - tiltRef.current) * 0.15;

            if (cloneOuterRef.current) {
                cloneOuterRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
            if (cloneInnerRef.current) {
                cloneInnerRef.current.style.transform = `scale(1.08) rotate(${tiltRef.current}deg)`;
            }
        });

        const overDelete = isPointOverDeleteZone(e.clientX, e.clientY);
        setIsOverDeleteZone(prev => prev === overDelete ? prev : overDelete);

        if (overDelete) {
            setInsertionPoint(prev => prev ? null : prev);
            return;
        }

        const point = draggingRef.current.type === 'list'
            ? getListInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id)
            : getTaskInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id);

        setInsertionPoint(prev => {
            if (!prev && !point) return prev;
            if (prev && point && prev.type === point.type) {
                if (prev.type === 'task' && prev.listId === point.listId && prev.insertIndex === point.insertIndex) return prev;
                if (prev.type === 'list' && prev.colIndex === point.colIndex && prev.insertIndex === point.insertIndex) return prev;
            }
            return point;
        });
    }, []);

    const onMouseUp = useCallback((e) => {
        if (!draggingRef.current) return;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        if (isPointOverDeleteZone(e.clientX, e.clientY)) {
            onDeleteDropRef.current?.(
                draggingRef.current.item,
                draggingRef.current.type
            );
        } else {
            const isListDrag = draggingRef.current.type === 'list';
            const point = isListDrag
                ? getListInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id)
                : getTaskInsertionPoint(e.clientX, e.clientY, draggingRef.current.item.id);

            if (point) {
                if (isListDrag) commitListReorder(draggingRef.current.item, point);
                else commitTaskReorder(draggingRef.current.item, point);
            } else {
                for (const [key, el] of Object.entries(ghostRefs.current)) {
                    const rect = el.getBoundingClientRect();
                    if (
                        e.clientX >= rect.left && e.clientX <= rect.right &&
                        e.clientY >= rect.top && e.clientY <= rect.bottom
                    ) {
                        onGhostDropRef.current?.(key, draggingRef.current.item);
                        break;
                    }
                }
            }
        }

        draggingRef.current = null;
        setDragging(null);
        setDragType(null);
        setCloneMeta(null);
        setInsertionPoint(null);
        setIsOverDeleteZone(false);
        tiltRef.current = 0;
        targetTiltRef.current = 0;

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    function startDrag(e, item, element, type = 'task') {
        if (e.button !== 0) return;
        e.preventDefault();

        const rect = element.getBoundingClientRect();
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };

        lastPos.current = { x: e.clientX, y: e.clientY };
        tiltRef.current = 0;
        targetTiltRef.current = 0;

        const x = e.clientX - dragOffset.current.x;
        const y = e.clientY - dragOffset.current.y;

        setCloneMeta({ width: rect.width, height: rect.height, type });
        draggingRef.current = { item, type };
        setDragging(item.id);
        setDragType(type);

        requestAnimationFrame(() => {
            if (cloneOuterRef.current) {
                cloneOuterRef.current.style.transform = `translate(${x}px, ${y}px)`;
            }
            if (cloneInnerRef.current) {
                cloneInnerRef.current.style.transform = `scale(1.08) rotate(0deg)`;
            }
        });

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    // calculation functions
    function getTaskInsertionPoint(cx, cy, draggedId) {
        let targetListId = null;

        for (const [listId, el] of Object.entries(listRefs.current)) {
            const rect = el.getBoundingClientRect();
            if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
                targetListId = listId;
                break;
            }
        }

        if (!targetListId) return null;

        const listTasks = tasksRef.current
            .filter(t => t.listID === targetListId && t.id !== draggedId)
            .sort((a, b) => a.taskOrder - b.taskOrder);

        let insertIndex = listTasks.length;

        for (let i = 0; i < listTasks.length; i++) {
            const el = taskRefs.current[listTasks[i].id];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (cy < midY) {
                insertIndex = i;
                break;
            }
        }

        return { type: 'task', listId: targetListId, insertIndex };
    }

    function getListInsertionPoint(cx, cy, draggedId) {
        let targetColumnId = null;

        for (const [listId, el] of Object.entries(listRefs.current)) {
            const rect = el.getBoundingClientRect();
            if (cx >= rect.left - 30 && cx <= rect.right + 30) {
                const matchedList = listsRef.current.find(l => l.id === listId);
                if (matchedList) {
                    targetColumnId = matchedList.columnID;
                    break;
                }
            }
        }

        if (!targetColumnId) return null;

        const candidateLists = listsRef.current
            .filter(l => l.columnID === targetColumnId && l.id !== draggedId)
            .sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

        let insertIndex = candidateLists.length;

        for (let i = 0; i < candidateLists.length; i++) {
            const el = listRefs.current[candidateLists[i].id];
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (cy < midY) {
                insertIndex = i;
                break;
            }
        }

        const targetColumn = columnsRef.current.find(c => c.id === targetColumnId);
        const colIndex = targetColumn?.columnIndex ?? 0;

        return { type: 'list', columnId: targetColumnId, colIndex, insertIndex };
    }

    // data processing functions
    function commitTaskReorder(task, point) {
        const { listId, insertIndex } = point;

        const listTasks = tasksRef.current
            .filter(t => t.listID === listId && t.id !== task.id)
            .sort((a, b) => a.taskOrder - b.taskOrder);

        const clampedIndex = Math.min(Math.max(insertIndex, 0), listTasks.length);
        const newOrder = [...listTasks];
        newOrder.splice(clampedIndex, 0, task);

        const updates = newOrder
            .map((t, i) => ({ id: t.id, listID: listId, taskOrder: i }))
            .filter(u => {
                const original = tasksRef.current.find(t => t.id === u.id);
                return !original || original.listID !== u.listID || original.taskOrder !== u.taskOrder;
            });

        if (updates.length > 0) onReorderTasksRef.current?.(updates);
    }

    function commitListReorder(list, point) {
        const { columnId, insertIndex } = point;

        const candidateLists = listsRef.current
            .filter(l => l.columnID === columnId && l.id !== list.id)
            .sort((a, b) => (a.listOrder ?? 0) - (b.listOrder ?? 0));

        const clampedIndex = Math.min(Math.max(insertIndex, 0), candidateLists.length);
        const newOrder = [...candidateLists];
        newOrder.splice(clampedIndex, 0, list);

        const updates = newOrder
            .map((l, i) => ({ id: l.id, columnID: columnId, listOrder: i }))
            .filter(u => {
                const original = listsRef.current.find(l => l.id === u.id);
                return !original || original.columnID !== u.columnID || original.listOrder !== u.listOrder;
            });

        if (updates.length > 0) onReorderListsRef.current?.(updates);
    }

    return {
        dragging,
        dragType,
        cloneMeta,
        insertionPoint,
        isOverDeleteZone,
        registerList,
        registerTask,
        registerGhost,
        registerDeleteZone,
        registerCloneOuter,
        registerCloneInner,
        startDrag,
    };
}