// component imports
import Subbar from './Subbar';
import KanbanTabs from '../kanban/KanbanTabs';

// ui components
export default function KanbanSubbar({ tabs, activeTabId, onTabSelect, onTabAdd, onTabUpdate, onTabArchive, onTabDelete }) {
    return (
        <Subbar className="subbar--kanban">
            <KanbanTabs
                tabs={tabs ?? []}
                activeTabId={activeTabId}
                onSelect={onTabSelect}
                onAdd={onTabAdd}
                onUpdate={onTabUpdate}
                onArchive={onTabArchive}
                onDelete={onTabDelete}
            />
        </Subbar>
    );
}