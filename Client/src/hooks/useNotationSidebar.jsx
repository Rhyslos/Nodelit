// hook imports
import { useMemo } from 'react';
import { api } from '../lib/api';
import { useNotation } from '../contexts/NotationContext';

// utility functions
function byOrder(field) {
    return (a, b) => a[field] - b[field] || a.id.localeCompare(b.id);
}

function groupOf(page) {
    return page.groupID ?? null;
}

function pagesInGroup(pages, groupID) {
    return pages.filter(page => groupOf(page) === groupID).sort(byOrder('pageOrder'));
}

export function buildReorder(pages, draggedPageID, targetGroupID, targetIndex) {
    const dragged = pages.find(page => page.id === draggedPageID);
    if (!dragged) return null;

    const source = groupOf(dragged);
    const target = targetGroupID ?? null;

    const targetList = pagesInGroup(pages, target).filter(page => page.id !== draggedPageID);
    const index = Math.max(0, Math.min(targetIndex, targetList.length));

    targetList.splice(index, 0, dragged);

    if (source === target && targetList.every((page, position) => page.pageOrder === position)) return [];

    const updates = targetList.map((page, position) => ({
        id: page.id,
        groupID: target,
        pageOrder: position
    }));

    if (source !== target) {
        pagesInGroup(pages, source)
            .filter(page => page.id !== draggedPageID)
            .forEach((page, position) => {
                updates.push({ id: page.id, groupID: source, pageOrder: position });
            });
    }

    return updates;
}

export function buildGroupReorder(groups, draggedGroupID, targetIndex) {
    const dragged = groups.find(group => group.id === draggedGroupID);
    if (!dragged) return null;

    const ordered = groups.filter(group => group.id !== draggedGroupID);
    const index = Math.max(0, Math.min(targetIndex, ordered.length));

    ordered.splice(index, 0, dragged);

    if (ordered.every((group, position) => group.groupOrder === position)) return [];

    return ordered.map((group, position) => ({ id: group.id, groupOrder: position }));
}

// hook functions
export function useNotationSidebar() {
    const {
        notationData,
        setNotationData,
        applyDelta,
        workspaceID,
        loading,
        error,
        actionError,
        setActionError,
        refresh,
        memberRole,
        canEdit
    } = useNotation();

    // state variables
    const groups = useMemo(
        () => [...notationData.groups].sort(byOrder('groupOrder')),
        [notationData.groups]
    );

    const pages = useMemo(
        () => [...notationData.pages].sort(byOrder('pageOrder')),
        [notationData.pages]
    );

    // query functions
    async function searchContent(term, signal) {
        const query = new URLSearchParams({ q: term });
        const result = await api(`/api/notation/${workspaceID}/search?${query}`, { signal });
        return result.pages;
    }

    // mutation functions
    async function createGroup(name = 'New group') {
        try {
            const group = await api('/api/notation/groups', {
                method: 'POST',
                body: { workspaceID, name }
            });

            setNotationData(prev => applyDelta(prev, { upsert: { groups: [group] } }));
            setActionError(null);
            return group;
        } catch (err) {
            setActionError(err.message);
            refresh();
            return null;
        }
    }

    async function updateGroup(groupID, changes) {
        setNotationData(prev => ({
            ...prev,
            groups: prev.groups.map(g => g.id === groupID ? { ...g, ...changes } : g)
        }));

        try {
            const group = await api(`/api/notation/groups/${groupID}`, { method: 'PUT', body: changes });
            setNotationData(prev => applyDelta(prev, { upsert: { groups: [group] } }));
            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    async function renameGroup(groupID, name) {
        await updateGroup(groupID, { name });
    }

    async function colorGroup(groupID, color) {
        await updateGroup(groupID, { color });
    }

    async function deleteGroup(groupID) {
        try {
            const result = await api(`/api/notation/groups/${groupID}`, { method: 'DELETE' });

            setNotationData(prev => applyDelta(prev, {
                upsert: { pages: result.pages },
                remove: result.removed
            }));

            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    async function createPage(title = 'Untitled', groupID = null) {
        try {
            const page = await api('/api/notation/pages', {
                method: 'POST',
                body: { workspaceID, title, groupID }
            });

            setNotationData(prev => applyDelta(prev, { upsert: { pages: [page] } }));
            setActionError(null);
            return page;
        } catch (err) {
            setActionError(err.message);
            refresh();
            return null;
        }
    }

    async function renamePage(pageID, title) {
        setNotationData(prev => ({
            ...prev,
            pages: prev.pages.map(p => p.id === pageID ? { ...p, title } : p)
        }));

        try {
            const page = await api(`/api/notation/pages/${pageID}`, { method: 'PUT', body: { title } });
            setNotationData(prev => applyDelta(prev, { upsert: { pages: [page] } }));
            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    async function setPageLayout(pageID, layout) {
        setNotationData(prev => ({
            ...prev,
            pages: prev.pages.map(p => p.id === pageID ? { ...p, layout } : p)
        }));

        try {
            const page = await api(`/api/notation/pages/${pageID}`, { method: 'PUT', body: { layout } });
            setNotationData(prev => applyDelta(prev, { upsert: { pages: [page] } }));
            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    async function deletePage(pageID) {
        setNotationData(prev => applyDelta(prev, { remove: { pages: [pageID] } }));

        try {
            const { removed } = await api(`/api/notation/pages/${pageID}`, { method: 'DELETE' });
            setNotationData(prev => applyDelta(prev, { remove: removed }));
            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    async function reorderGroups(draggedGroupID, targetIndex) {
        const updates = buildGroupReorder(groups, draggedGroupID, targetIndex);
        if (!updates || updates.length === 0) return;

        setNotationData(prev => {
            const moved = new Map(updates.map(u => [u.id, u]));

            return {
                ...prev,
                groups: prev.groups.map(g => {
                    const update = moved.get(g.id);
                    return update ? { ...g, groupOrder: update.groupOrder } : g;
                })
            };
        });

        try {
            const result = await api('/api/notation/groups/reorder', { method: 'PUT', body: { updates } });
            setNotationData(prev => applyDelta(prev, { upsert: { groups: result.groups } }));
            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    async function reorderPages(draggedPageID, targetGroupID, targetIndex) {
        const updates = buildReorder(pages, draggedPageID, targetGroupID, targetIndex);
        if (!updates || updates.length === 0) return;

        setNotationData(prev => {
            const moved = new Map(updates.map(u => [u.id, u]));

            return {
                ...prev,
                pages: prev.pages.map(p => {
                    const update = moved.get(p.id);
                    return update ? { ...p, groupID: update.groupID, pageOrder: update.pageOrder } : p;
                })
            };
        });

        try {
            const result = await api('/api/notation/pages/reorder', { method: 'PUT', body: { updates } });
            setNotationData(prev => applyDelta(prev, { upsert: { pages: result.pages } }));
            setActionError(null);
        } catch (err) {
            setActionError(err.message);
            refresh();
        }
    }

    return {
        groups,
        pages,
        loading,
        error,
        actionError,
        memberRole,
        canEdit,
        refresh,
        createGroup,
        renameGroup,
        colorGroup,
        deleteGroup,
        createPage,
        renamePage,
        setPageLayout,
        deletePage,
        reorderPages,
        reorderGroups,
        searchContent
    };
}
