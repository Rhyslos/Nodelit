// component imports
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import DefaultSubbar from '../components/subbar/DefaultSubbar';
import WorkspaceCard from '../components/workspace/WorkspaceCard';
import CreateWorkspaceModal from '../components/workspace/CreateWorkspaceModal';
import CategoryFilter from '../components/workspace/CategoryFilter';

// component functions
export default function Dashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();

    // state variables
    const [modalOpen, setModalOpen] = useState(false);
    const [filterCategory, setFilterCategory] = useState(null);
    const [filterText, setFilterText] = useState('');
    
    // database mock variables
    const [categories, setCategories] = useState([
        { id: 'cat-1', name: 'Planning', color: '#4a90d9' }
    ]);
    const [workspaces, setWorkspaces] = useState([
        { id: 'ws-1', name: 'Example Project', categoryID: 'cat-1', categoryName: 'Planning', categoryColor: '#4a90d9', createdAt: Date.now() }
    ]);

    // filter variables
    const filtered = workspaces.filter(w => {
        const matchesCategory = !filterCategory || w.categoryID === filterCategory;
        const matchesText = !filterText || w.name.toLowerCase().includes(filterText.toLowerCase());
        return matchesCategory && matchesText;
    });

    // entity creation handlers
    async function createCategory(name, color) {
        const newCat = { id: `cat-${Date.now()}`, name, color };
        setCategories(prev => [...prev, newCat]);
        return newCat;
    }

    async function handleCreateWorkspace(name, categoryID) {
        const cat = categories.find(c => c.id === categoryID);
        const newWorkspace = {
            id: `ws-${Date.now()}`,
            name,
            categoryID,
            categoryName: cat?.name,
            categoryColor: cat?.color,
            createdAt: Date.now()
        };
        setWorkspaces(prev => [newWorkspace, ...prev]);
        setModalOpen(false);
    }

    // entity deletion handlers
    function handleDeleteWorkspace(id) {
        setWorkspaces(prev => prev.filter(w => w.id !== id));
    }

    return (
        <div className="dashboard-root">
            <DefaultSubbar />
            <main className="dashboard-main">
                <div className="grid-root">
                    <div className="grid-filters">
                        <CategoryFilter
                            categories={categories}
                            selected={filterCategory}
                            searchText={filterText}
                            onSelect={setFilterCategory}
                            onSearch={setFilterText}
                        />
                    </div>

                    <div className="grid">
                        <button className="workspace-ghost" onClick={() => setModalOpen(true)}>
                            <span className="workspace-ghost-icon">+</span>
                            <span className="workspace-ghost-label">New workspace</span>
                        </button>

                        {filtered.map(ws => (
                            <WorkspaceCard 
                                key={ws.id} 
                                workspace={ws} 
                                onOpen={() => navigate(`/workspace/${ws.id}/kanban`)} 
                                onDelete={() => handleDeleteWorkspace(ws.id)} 
                            />
                        ))}
                    </div>
                </div>
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