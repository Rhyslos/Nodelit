// hook imports
import { useState, useRef, useEffect, useCallback } from 'react';

// configuration constants
const DRAG_THRESHOLD = 4;

// utility functions
export function buildTabSlots(tabs, groups) {
    const groupByID = new Map(groups.map(group => [group.id, group]));
    const slots = [];
    const emitted = new Set();

    for (const tab of tabs) {
        const group = tab.groupID ? groupByID.get(tab.groupID) : null;

        if (!group) {
            slots.push({ type: 'tab', id: tab.id, tab });
            continue;
        }

        if (emitted.has(group.id)) continue;

        emitted.add(group.id);

        slots.push({
            type: 'group',
            id: group.id,
            group,
            tabs: tabs.filter(candidate => candidate.groupID === group.id)
        });
    }

    return slots;
}

function removeEntity(slots, dragging) {
    if (dragging.type === 'group') {
        return slots.filter(slot => !(slot.type === 'group' && slot.id === dragging.id));
    }

    const next = [];

    for (const slot of slots) {
        if (slot.type === 'tab') {
            if (slot.id !== dragging.id) next.push(slot);
            continue;
        }

        const tabs = slot.tabs.filter(tab => tab.id !== dragging.id);
        if (tabs.length > 0) next.push({ ...slot, tabs });
    }

    return next;
}

function insertEntity(slots, target, dragging) {
    if (dragging.type === 'group' || !target.groupID) {
        const entity = dragging.type === 'group'
            ? dragging.slot
            : { type: 'tab', id: dragging.id, tab: dragging.tab };

        const next = [...slots];
        next.splice(Math.min(Math.max(target.index, 0), slots.length), 0, entity);
        return next;
    }

    return slots.map(slot => {
        if (slot.type !== 'group' || slot.id !== target.groupID) return slot;

        const tabs = [...slot.tabs];
        tabs.splice(Math.min(Math.max(target.index, 0), tabs.length), 0, dragging.tab);
        return { ...slot, tabs };
    });
}

function flattenSlots(slots) {
    const order = [];

    for (const slot of slots) {
        if (slot.type === 'tab') {
            order.push({ id: slot.id, groupID: null });
            continue;
        }

        for (const tab of slot.tabs) order.push({ id: tab.id, groupID: slot.id });
    }

    return order;
}

function indexFromPoint(elements, cx) {
    let index = elements.length;

    for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el) continue;

        const rect = el.getBoundingClientRect();

        if (cx < rect.left + rect.width / 2) {
            index = i;
            break;
        }
    }

    return index;
}

// hook functions
export function useTabDrag({ slots, allTabs = [], collapsedGroups, onReorder }) {
    // state variables
    const [dragging, setDragging] = useState(null);
    const [dropTarget, setDropTarget] = useState(null);

    // dom references
    const tabRefs = useRef({});
    const groupRefs = useRef({});
    const cloneRef = useRef(null);
    const draggingRef = useRef(null);
    const pendingRef = useRef(null);
    const offsetRef = useRef({ x: 0, y: 0 });
    const lastPoint = useRef({ x: 0, y: 0 });
    const suppressRef = useRef(false);
    const rafRef = useRef(null);

    // callback references
    const slotsRef = useRef(slots);
    const allTabsRef = useRef(allTabs);
    const collapsedRef = useRef(collapsedGroups);
    const onReorderRef = useRef(onReorder);

    // lifecycle functions
    useEffect(() => { slotsRef.current = slots; }, [slots]);
    useEffect(() => { allTabsRef.current = allTabs; }, [allTabs]);
    useEffect(() => { collapsedRef.current = collapsedGroups; }, [collapsedGroups]);
    useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

    // registration functions
    function registerTab(tabID, el) {
        if (el) tabRefs.current[tabID] = el;
        else delete tabRefs.current[tabID];
    }

    function registerGroup(groupID, el) {
        if (el) groupRefs.current[groupID] = el;
        else delete groupRefs.current[groupID];
    }

    function registerClone(el) {
        cloneRef.current = el;
    }

    // calculation functions
    function getDropTarget(cx, cy) {
        const current = draggingRef.current;
        const working = removeEntity(slotsRef.current, current);

        if (current.type === 'tab') {
            for (const slot of working) {
                if (slot.type !== 'group') continue;

                const el = groupRefs.current[slot.id];
                if (!el) continue;

                const rect = el.getBoundingClientRect();
                if (cx < rect.left || cx > rect.right || cy < rect.top || cy > rect.bottom) continue;

                if (collapsedRef.current?.has(slot.id)) {
                    return { groupID: slot.id, index: slot.tabs.length };
                }

                return {
                    groupID: slot.id,
                    index: indexFromPoint(slot.tabs.map(tab => tabRefs.current[tab.id]), cx)
                };
            }
        }

        const elements = working.map(slot => slot.type === 'group'
            ? groupRefs.current[slot.id]
            : tabRefs.current[slot.id]);

        return { groupID: null, index: indexFromPoint(elements, cx) };
    }

    // data processing functions
    function commit(current, target) {
        const working = removeEntity(slotsRef.current, current);
        const order = flattenSlots(insertEntity(working, target, current));

        const everyTab = allTabsRef.current;
        const tabByID = new Map(everyTab.map(tab => [tab.id, tab]));
        const movedGroup = new Map(order.map(entry => [entry.id, entry.groupID]));

        const sequence = everyTab.map(tab => tab.id);
        const slotIndexes = [];

        sequence.forEach((id, index) => {
            if (movedGroup.has(id)) slotIndexes.push(index);
        });

        const merged = [...sequence];
        order.forEach((entry, index) => {
            if (slotIndexes[index] !== undefined) merged[slotIndexes[index]] = entry.id;
        });

        const updates = merged
            .map((id, index) => ({
                id,
                groupID: movedGroup.has(id) ? movedGroup.get(id) : (tabByID.get(id)?.groupID ?? null),
                tabOrder: index
            }))
            .filter(update => {
                const original = tabByID.get(update.id);
                return !original
                    || (original.groupID ?? null) !== update.groupID
                    || original.tabOrder !== update.tabOrder;
            });

        if (updates.length > 0) onReorderRef.current?.(updates);
    }

    // event functions
    const onMouseMove = useCallback(e => {
        lastPoint.current = { x: e.clientX, y: e.clientY };

        const pending = pendingRef.current;

        if (pending && !draggingRef.current) {
            const moved = Math.abs(e.clientX - pending.startX) + Math.abs(e.clientY - pending.startY);
            if (moved < DRAG_THRESHOLD) return;

            draggingRef.current = pending.entity;
            offsetRef.current = pending.offset;
            setDragging(pending.entity);
        }

        if (!draggingRef.current) return;

        const x = e.clientX - offsetRef.current.x;
        const y = e.clientY - offsetRef.current.y;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (cloneRef.current) cloneRef.current.style.transform = `translate(${x}px, ${y}px)`;
        });

        const target = getDropTarget(e.clientX, e.clientY);

        setDropTarget(prev => {
            if (prev && prev.groupID === target.groupID && prev.index === target.index) return prev;
            return target;
        });
    }, []);

    const onMouseUp = useCallback(e => {
        const current = draggingRef.current;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        pendingRef.current = null;

        if (current) {
            commit(current, getDropTarget(e.clientX, e.clientY));

            suppressRef.current = true;
            setTimeout(() => { suppressRef.current = false; }, 0);
        }

        draggingRef.current = null;
        setDragging(null);
        setDropTarget(null);
    }, [onMouseMove]);

    useEffect(() => {
        if (!dragging || !cloneRef.current) return;

        const x = lastPoint.current.x - offsetRef.current.x;
        const y = lastPoint.current.y - offsetRef.current.y;

        cloneRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }, [dragging]);

    useEffect(() => {
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    // state functions
    function startDrag(e, entity, element) {
        if (e.button !== 0 || !element) return;

        const rect = element.getBoundingClientRect();

        pendingRef.current = {
            entity,
            startX: e.clientX,
            startY: e.clientY,
            offset: { x: e.clientX - rect.left, y: e.clientY - rect.top }
        };

        lastPoint.current = { x: e.clientX, y: e.clientY };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function wasDragging() {
        return suppressRef.current;
    }

    const visibleSlots = dragging ? removeEntity(slots, dragging) : slots;

    return {
        visibleSlots,
        dragging,
        dropTarget,
        registerTab,
        registerGroup,
        registerClone,
        startDrag,
        wasDragging
    };
}
