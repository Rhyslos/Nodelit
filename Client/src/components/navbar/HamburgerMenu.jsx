// component imports
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import PasswordModal from '../workspace/PasswordModal';

// component functions
export default function HamburgerMenu({ open, onClose }) {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [passwordOpen, setPasswordOpen] = useState(false);

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

                    <button className="hamburger-item" onClick={() => setPasswordOpen(true)}>
                        Change password
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
