// hook imports
import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { useKanban } from '../contexts/KanbanContext';

// hook functions
export function useTabs(workspaceID) {
    const { boardData, setBoardData, applyDelta, refresh } = useKanban();

    // state variables
    const [activeTabId, setActiveTabId] = useState(null);

    const tabs = useMemo(
        () => boardData.tabs.filter(t => !t.isArchived).sort((a, b) => a.tabOrder - b.tabOrder),
        [boardData.tabs]
    );

    // lifecycle functions
    useEffect(() => {
        if (tabs.length === 0) {
            if (activeTabId !== null) setActiveTabId(null);
            return;
        }

        if (!tabs.some(t => t.id === activeTabId)) {
            setActiveTabId(tabs[0].id);
        }
    }, [tabs, activeTabId]);

    // mutation functions
    async function addTab(name = 'New Board', color) {
        try {
            const tab = await api('/api/kanban/tabs', {
                method: 'POST',
                body: { workspaceID, name, color }
            });

            setBoardData(prev => applyDelta(prev, { upsert: { tabs: [tab] } }));
            setActiveTabId(tab.id);
            return tab.id;
        } catch {
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
        } catch {
            refresh();
        }
    }

    async function archiveTab(tabId) {
        await updateTab(tabId, { isArchived: true });
    }

    async function deleteTab(tabId) {
        setBoardData(prev => applyDelta(prev, { remove: { tabs: [tabId] } }));

        try {
            const { removed } = await api(`/api/kanban/tabs/${tabId}`, { method: 'DELETE' });
            setBoardData(prev => applyDelta(prev, { remove: removed }));
        } catch {
            refresh();
        }
    }

    return { tabs, activeTabId, setActiveTabId, addTab, updateTab, archiveTab, deleteTab };
}
