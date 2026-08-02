// component imports
import { useState } from 'react';
import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import HamburgerMenu from './HamburgerMenu';

// component functions
export default function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    // routing variables
    const match = matchPath({ path: "/workspace/:workspaceID/*" }, location.pathname);
    const workspaceID = match?.params?.workspaceID;
    
    // state variables
    const [menuOpen, setMenuOpen] = useState(false);
    const inWorkspace = !!workspaceID;

    // navigation handlers
    function navTo(page) {
        if (workspaceID) navigate(`/workspace/${workspaceID}/${page}`);
    }

    function isActive(page) {
        return location.pathname.includes(`/${page}`);
    }

    return (
        <>
            <nav className="navbar">
                <div className="navbar-brand" onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
                    <span className="navbar-logo">✦</span>
                    <span className="navbar-name">Nodelit</span>
                </div>

                {inWorkspace && (
                    <div className="navbar-pages">
                        <button 
                            className={`navbar-page-btn ${isActive('graph') ? 'active' : ''}`}
                            onClick={() => navTo('graph')}
                        >
                            Graph Editor
                        </button>
                        <button
                            className={`navbar-page-btn ${isActive('kanban') ? 'active' : ''}`}
                            onClick={() => navTo('kanban')}
                        >
                            Kanban
                        </button>
                        <button
                            className={`navbar-page-btn ${isActive('notation') ? 'active' : ''}`}
                            onClick={() => navTo('notation')}
                        >
                            Notation
                        </button>
                        <button
                            className={`navbar-page-btn ${isActive('calendar') ? 'active' : ''}`}
                            onClick={() => navTo('calendar')}
                        >
                            Calendar
                        </button>
                    </div>
                )}

                <div className="navbar-right" style={{ marginLeft: inWorkspace ? '0' : 'auto' }}>
                    <span className="navbar-user">{user?.username}</span>
                    <button className="navbar-hamburger" onClick={() => setMenuOpen(true)}>
                        <span /><span /><span />
                    </button>
                </div>
            </nav>
            
            <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        </>
    );
}