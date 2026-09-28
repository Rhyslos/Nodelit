// component functions
export default function WorkspaceCard({ workspace, onOpen, onMenu }) {
    return (
        <div
            className="workspace-card"
            onClick={onOpen}
            onContextMenu={event => {
                event.preventDefault();
                onMenu({ x: event.clientX, y: event.clientY });
            }}
        >
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
        </div>
    );
}
