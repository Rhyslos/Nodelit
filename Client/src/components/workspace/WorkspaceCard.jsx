// component functions
export default function WorkspaceCard({ workspace, onOpen, onDelete }) {
    return (
        <div className="workspace-card" onClick={onOpen}>
            {workspace.categoryName && (
                <span
                    className="workspace-card-tag"
                    style={{ background: workspace.categoryColor + '22', color: workspace.categoryColor }}
                >
                    {workspace.categoryName}
                </span>
            )}
            <p className="workspace-card-name">{workspace.name}</p>
            <p className="workspace-card-date">
                {new Date(workspace.createdAt).toLocaleDateString()}
            </p>
            <button
                className="workspace-card-delete"
                onClick={e => { e.stopPropagation(); onDelete(); }}
                aria-label={`Delete ${workspace.name}`}
            >
                ✕
            </button>
        </div>
    );
}
