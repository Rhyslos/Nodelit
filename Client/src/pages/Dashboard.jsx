// component imports
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useUpcoming } from '../hooks/useUpcoming';
import DefaultSubbar from '../components/subbar/DefaultSubbar';
import WorkspaceGrid from '../components/workspace/WorkspaceGrid';
import CreateWorkspaceModal from '../components/workspace/CreateWorkspaceModal';
import ContextMenu, { ContextMenuItem, ContextMenuDivider, ContextMenuLabel } from '../components/notation/ContextMenu';

// component functions
export default function Dashboard() {
    const { user } = useAuth();
    const { notifyError } = useToast();
    const navigate = useNavigate();

    // data layer
    const {
        workspaces,
        categories,
        loading,
        error,
        createWorkspace,
        deleteWorkspace,
        createCategory
    } = useWorkspaces(user?.id);

    const { items: upcoming, loading: upcomingLoading } = useUpcoming(user?.id);

    // state variables
    const [modalOpen, setModalOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterText, setFilterText] = useState('');
    const [menu, setMenu] = useState(null);
    const [confirmingDelete, setConfirmingDelete] = useState(false);

    // filter variables
    const filtered = workspaces.filter(w => {
        const matchesCategory = !filterCategory || w.categoryID === filterCategory;
        const matchesText = !filterText || w.name.toLowerCase().includes(filterText.toLowerCase());
        return matchesCategory && matchesText;
    });

    // entity creation handlers
    async function handleCreateWorkspace(name, categoryID) {
        await createWorkspace(name, categoryID);
        setModalOpen(false);
    }

    // menu handlers
    const closeMenu = useCallback(() => {
        setMenu(null);
        setConfirmingDelete(false);
    }, []);

    const canDelete = menu
        ? menu.workspace.memberRole === 'owner' || menu.workspace.ownerID === user?.id
        : false;

    function openMenu(workspace, position) {
        setMenu({ workspace, position });
        setConfirmingDelete(false);
    }

    // entity deletion handlers
    async function handleDeleteWorkspace() {
        const target = menu?.workspace;
        closeMenu();
        if (!target) return;

        try {
            await deleteWorkspace(target.id);
        } catch (error) {
            notifyError(error, 'The workspace could not be deleted');
        }
    }

    return (
        <div className="dashboard-root">
            <DefaultSubbar
                items={upcoming}
                itemsLoading={upcomingLoading}
                onOpenItem={item => navigate(item.kind === 'meeting'
                    ? `/workspace/${item.workspaceID}/calendar`
                    : `/workspace/${item.workspaceID}/kanban?tab=${item.tabID}`)}
            />
            <main className="dashboard-main">
                {error && <div className="grid-error">Your workspaces could not be loaded. Refresh to try again.</div>}

                <WorkspaceGrid
                    workspaces={filtered}
                    categories={categories}
                    loading={loading}
                    filterCategory={filterCategory}
                    filterText={filterText}
                    onFilterCategory={setFilterCategory}
                    onFilterText={setFilterText}
                    onOpen={workspaceID => navigate(`/workspace/${workspaceID}/kanban`)}
                    onMenu={openMenu}
                    onCreateNew={() => setModalOpen(true)}
                />
            </main>

            {menu && (
                <ContextMenu position={menu.position} onClose={closeMenu}>
                    <ContextMenuItem
                        onSelect={() => {
                            closeMenu();
                            navigate(`/workspace/${menu.workspace.id}/kanban`);
                        }}
                    >
                        Open workspace
                    </ContextMenuItem>

                    <ContextMenuDivider />

                    {!canDelete && (
                        <ContextMenuLabel>Only the owner can delete this workspace</ContextMenuLabel>
                    )}

                    {canDelete && !confirmingDelete && (
                        <ContextMenuItem onSelect={() => setConfirmingDelete(true)} danger>
                            Delete workspace
                        </ContextMenuItem>
                    )}

                    {canDelete && confirmingDelete && (
                        <>
                            <ContextMenuLabel>
                                This removes {menu.workspace.name} for every member. An admin can restore it.
                            </ContextMenuLabel>

                            <ContextMenuItem onSelect={handleDeleteWorkspace} danger>
                                Confirm delete
                            </ContextMenuItem>

                            <ContextMenuItem onSelect={() => setConfirmingDelete(false)}>
                                Cancel
                            </ContextMenuItem>
                        </>
                    )}
                </ContextMenu>
            )}

            {modalOpen && (
                <CreateWorkspaceModal
                    categories={categories}
                    onConfirm={handleCreateWorkspace}
                    onClose={() => setModalOpen(false)}
                    onCreateCategory={createCategory}
                />
            )}
        </div>
    );
}
