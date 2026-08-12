// page imports
import { useState } from 'react';
import NotationSidebar from '../components/notation/NotationSidebar';
import { useNotation } from '../contexts/NotationContext';

// page functions
export default function Notation() {
    const { pages, loading, error } = useNotation();

    // state variables
    const [activePageID, setActivePageID] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const activePage = pages.find(page => page.id === activePageID) ?? null;

    if (error) return <div className="route-loading">{error.message}</div>;

    // ui rendering
    return (
        <div className="notation-root">
            <div className="notation-body">
                <button
                    className={`notation-sidebar-toggle ${sidebarOpen ? 'open' : ''}`}
                    onClick={() => setSidebarOpen(open => !open)}
                >
                    ‹
                </button>

                {sidebarOpen && (
                    <NotationSidebar
                        activePageID={activePageID}
                        onPageSelect={setActivePageID}
                    />
                )}

                <div className="notation-editor-area">
                    {loading && <p className="notation-loading">Loading…</p>}
                    {!loading && !activePage && <p className="notation-loading">Select a page to get started</p>}
                    {!loading && activePage && <h1 className="notation-page-heading">{activePage.title}</h1>}
                </div>
            </div>
        </div>
    );
}
