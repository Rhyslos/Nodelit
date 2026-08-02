// component imports
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// component functions
export default function HamburgerMenu({ open, onClose }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // navigation handlers
    function navTo(path) {
        navigate(path);
        onClose();
    }

    function handleLogout() {
        logout();
        navigate('/login');
        onClose();
    }

    return (
        <>
            <div className={`hamburger-overlay ${open ? 'open' : ''}`} onClick={onClose} />
            <div className={`hamburger-panel ${open ? 'open' : ''}`}>
                <button className="hamburger-close" onClick={onClose}>✕</button>
                <div className="hamburger-links">

                    <button className="hamburger-item" onClick={() => navTo('/profile')}>   
                        Profile
                    </button>

                    <button className="hamburger-item" onClick={() => navTo('/settings')}>   
                        Settings
                    </button>

                    <button className="hamburger-item">   
                        Help
                    </button>

                    <button className="hamburger-item">   
                        About
                    </button>

                    <hr className="hamburger-divider" />
                    <button className="hamburger-item hamburger-item--danger" onClick={handleLogout}>
                        Sign out
                    </button>
                </div>
            </div>
        </>
    );
}