// component imports
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useDeadlines } from '../hooks/useDeadlines';
import DefaultSubbar from '../components/subbar/DefaultSubbar';
import WorkspaceGrid from '../components/workspace/WorkspaceGrid';
import CreateWorkspaceModal from '../components/workspace/CreateWorkspaceModal';

// component functions
export default function Dashboard() {
    const { user } = useAuth();
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

    const { deadlines, loading: deadlinesLoading } = useDeadlines(user?.id);

    // state variables
    const [modalOpen, setModalOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterText, setFilterText] = useState('');

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

    // entity deletion handlers
    async function handleDeleteWorkspace(workspaceID) {
        await deleteWorkspace(workspaceID);
    }

    return (
        <div className="dashboard-root">
            <DefaultSubbar
                deadlines={deadlines}
                deadlinesLoading={deadlinesLoading}
                onOpenWorkspace={workspaceID => navigate(`/workspace/${workspaceID}/kanban`)}
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
                    onDelete={handleDeleteWorkspace}
                    onCreateNew={() => setModalOpen(true)}
                />
            </main>

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
