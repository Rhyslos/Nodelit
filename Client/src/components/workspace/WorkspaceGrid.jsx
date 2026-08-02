// component imports
import WorkspaceCard from './WorkspaceCard';
import CategoryFilter from './CategoryFilter';

// component functions
export default function WorkspaceGrid({
    workspaces, categories, loading,
    filterCategory, filterText,
    onFilterCategory, onFilterText,
    onOpen, onDelete, onCreateNew
}) {
    return (
        <div className="grid-root">
            <div className="grid-filters">
                <CategoryFilter
                    categories={categories}
                    selected={filterCategory}
                    searchText={filterText}
                    onSelect={onFilterCategory}
                    onSearch={onFilterText}
                />
            </div>

            {loading ? (
                <div className="grid-loading">Loading workspaces…</div>
            ) : (
                <div className="grid">
                    <button className="workspace-ghost" onClick={onCreateNew}>
                        <span className="workspace-ghost-icon">+</span>
                        <span className="workspace-ghost-label">New workspace</span>
                    </button>

                    {workspaces.map(ws => (
                        <WorkspaceCard
                            key={ws.id}
                            workspace={ws}
                            onOpen={() => onOpen(ws.id)}
                            onDelete={() => onDelete(ws.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
