// hook imports
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useKanban } from '../contexts/KanbanContext';
import { useToast } from '../contexts/ToastContext';

// configuration constants
const ACTIVE_TAB_STORAGE_PREFIX = 'nodelit:activetab:';

// hook functions
export function useTabs(workspaceID) {
    const { notifyError } = useToast();

    const { boardData, setBoardData, applyDelta, refresh } = useKanban();

    // state variables
    const [activeTabId, setActiveTabId] = useState(null);
    const [searchParams, setSearchParams] = useSearchParams();

    const tabs = useMemo(
        () => boardData.tabs.filter(t => !t.isArchived).sort((a, b) => a.tabOrder - b.tabOrder),
        [boardData.tabs]
    );

    const tabGroups = useMemo(() => boardData.tabGroups ?? [], [boardData.tabGroups]);

    // selection functions
    const selectTab = useCallback(tabID => {
        setActiveTabId(tabID);

        const next = new URLSearchParams(searchParams);

        if (tabID) next.set('tab', tabID);
        else next.delete('tab');

        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    // lifecycle functions
    useEffect(() => {
        if (tabs.length === 0) {
            if (activeTabId !== null) setActiveTabId(null);
            return;
        }

        const requested = searchParams.get('tab');

        if (requested && requested !== activeTabId && tabs.some(t => t.id === requested)) {
            setActiveTabId(requested);
            return;
        }

        if (!tabs.some(t => t.id === activeTabId)) {
            setActiveTabId(tabs[0].id);
        }
    }, [tabs, activeTabId, searchParams]);

    useEffect(() => {
        if (!workspaceID || !activeTabId) return;

        try {
            localStorage.setItem(`${ACTIVE_TAB_STORAGE_PREFIX}${workspaceID}`, activeTabId);
        } catch {
            return;
        }
    }, [workspaceID, activeTabId]);

    // mutation functions
    async function addTab(name = 'New Board', color) {
        try {
            const tab = await api('/api/kanban/tabs', {
                method: 'POST',
                body: { workspaceID, name, color }
            });

            setBoardData(prev => applyDelta(prev, { upsert: { tabs: [tab] } }));
            selectTab(tab.id);
            return tab.id;
        } catch (error) {
            notifyError(error, 'Could not create the tab');
            refresh();
            return null;
        }
    }

    async function updateTab(tabId, changes) {
        setBoardData(prev => ({
            ...prev,
            tabs: prev.tabs.map(t => t.id === tabId ? { ...t, ...changes } : t)
        }));

        try {
            const tab = await api(`/api/kanban/tabs/${tabId}`, { method: 'PUT', body: changes });
            setBoardData(prev => applyDelta(prev, { upsert: { tabs: [tab] } }));
        } catch (error) {
            notifyError(error, 'Could not update the tab');
            refresh();
        }
    }

    async function archiveTab(tabId) {
        await updateTab(tabId, { isArchived: true });
    }

    async function deleteTab(tabId) {
        setBoardData(prev => applyDelta(prev, { remove: { tabs: [tabId] } }));

        try {
            const { removed, tabs: updated } = await api(`/api/kanban/tabs/${tabId}`, { method: 'DELETE' });
            setBoardData(prev => applyDelta(prev, { upsert: { tabs: updated }, remove: removed }));
        } catch (error) {
            notifyError(error, 'Could not delete the tab');
            refresh();
        }
    }

    async function reorderTabs(updates, combineTags = false) {
        if (!updates || updates.length === 0) return;

        setBoardData(prev => {
            const moved = new Map(updates.map(u => [u.id, u]));

            return {
                ...prev,
                tabs: prev.tabs.map(t => {
                    const update = moved.get(t.id);
                    return update ? { ...t, groupID: update.groupID, tabOrder: update.tabOrder } : t;
                })
            };
        });

        try {
            const result = await api('/api/kanban/tabs/reorder', {
                method: 'PUT',
                body: { updates, combineTags }
            });

            setBoardData(prev => applyDelta(prev, {
                upsert: {
                    tabs: result.tabs,
                    tags: result.tags,
                    lists: result.lists,
                    tasks: result.tasks
                },
                remove: result.removed
            }));
        } catch (error) {
            notifyError(error, 'Could not reorder the tabs');
            refresh();
        }
    }

    async function addTabGroup(tabIDs, name, color, combineTags = false) {
        if (!tabIDs || tabIDs.length === 0) return null;

        try {
            const result = await api('/api/kanban/tab-groups', {
                method: 'POST',
                body: { workspaceID, tabIDs, name, color, combineTags }
            });

            setBoardData(prev => applyDelta(prev, {
                upsert: {
                    tabGroups: [result.group],
                    tabs: result.tabs,
                    tags: result.tags,
                    lists: result.lists,
                    tasks: result.tasks
                },
                remove: result.removed
            }));

            return result.group.id;
        } catch (error) {
            notifyError(error, 'Could not create the group');
            refresh();
            return null;
        }
    }

    async function updateTabGroup(groupID, changes) {
        setBoardData(prev => ({
            ...prev,
            tabGroups: prev.tabGroups.map(g => g.id === groupID ? { ...g, ...changes } : g)
        }));

        try {
            const group = await api(`/api/kanban/tab-groups/${groupID}`, { method: 'PUT', body: changes });
            setBoardData(prev => applyDelta(prev, { upsert: { tabGroups: [group] } }));
        } catch (error) {
            notifyError(error, 'Could not update the group');
            refresh();
        }
    }

    async function deleteTabGroup(groupID) {
        setBoardData(prev => applyDelta(prev, {
            upsert: { tabs: prev.tabs.filter(t => t.groupID === groupID).map(t => ({ ...t, groupID: null })) },
            remove: { tabGroups: [groupID] }
        }));

        try {
            const result = await api(`/api/kanban/tab-groups/${groupID}`, { method: 'DELETE' });

            setBoardData(prev => applyDelta(prev, {
                upsert: {
                    tabs: result.tabs,
                    tags: result.tags,
                    lists: result.lists,
                    tasks: result.tasks
                },
                remove: result.removed
            }));
        } catch (error) {
            notifyError(error, 'Could not ungroup the tabs');
            refresh();
        }
    }

    return {
        tabs,
        tabGroups,
        activeTabId,
        setActiveTabId: selectTab,
        addTab,
        updateTab,
        archiveTab,
        deleteTab,
        reorderTabs,
        addTabGroup,
        updateTabGroup,
        deleteTabGroup
    };
}
