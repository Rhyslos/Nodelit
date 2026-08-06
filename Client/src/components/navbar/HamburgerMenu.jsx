// component imports
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

// component functions
export default function HamburgerMenu({ open, onClose }) {
    const { logout } = useAuth();
    const navigate = useNavigate();

    // navigation handlers
    async function handleLogout() {
        await logout();
        onClose();
        navigate('/login', { replace: true });
    }

    return (
        <>
            <div className={`hamburger-overlay ${open ? 'open' : ''}`} onClick={onClose} />
            <div className={`hamburger-panel ${open ? 'open' : ''}`}>
                <button className="hamburger-close" onClick={onClose} aria-label="Close menu">✕</button>
                <div className="hamburger-links">
                    <button className="hamburger-item" onClick={() => { navigate('/dashboard'); onClose(); }}>
                        Dashboard
                    </button>

                    <button className="hamburger-item" onClick={() => { navigate('/profile'); onClose(); }}>
                        Profile
                    </button>
                    <button className="hamburger-item">Settings</button>
                    <button className="hamburger-item">Help</button>

                    <hr className="hamburger-divider" />

                    <button className="hamburger-item hamburger-item--danger" onClick={handleLogout}>
                        Sign out
                    </button>
                </div>
            </div>
        </>
    );
}
