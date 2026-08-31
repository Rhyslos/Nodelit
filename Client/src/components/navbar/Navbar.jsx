// import functions
import { useState } from 'react';
import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import { Waypoints } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspacePresence } from '../../hooks/useWorkspacePresence';
import HamburgerMenu from './HamburgerMenu';
import MembersModal from '../workspace/MembersModal';
import TagManager from '../kanban/TagManager';
import { appName } from '../../App';

// configuration constants
const WORKSPACE_PAGES = [
    { key: 'overview', label: 'Overview' },
    { key: 'kanban', label: 'Kanban' },
    { key: 'notation', label: 'Notation' },
    { key: 'calendar', label: 'Calendar' }
];

// helper functions
function getAvatarLetter(member) {
    if (member.displayName) return member.displayName.charAt(0).toUpperCase();
    if (member.firstName) return member.firstName.charAt(0).toUpperCase();
    if (member.email) return member.email.charAt(0).toUpperCase();
    return '?';
}

function getAvatarColor(member) {
    if (!member.isOnline) return '#4a4a4a';
    if (member.cursorColor) return member.cursorColor;

    let hash = 0;
    const source = member.displayName || member.id || 'default';

    for (let i = 0; i < source.length; i++) {
        hash = source.charCodeAt(i) + ((hash << 5) - hash);
    }

    const value = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - value.length) + value;
}

// component functions
export default function Navbar() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const match = matchPath({ path: '/workspace/:workspaceID/*' }, location.pathname);
    const workspaceID = match?.params?.workspaceID;
    const inWorkspace = !!workspaceID;

    // state variables
    const [menuOpen, setMenuOpen] = useState(false);
    const [membersOpen, setMembersOpen] = useState(false);
    const [tagsOpen, setTagsOpen] = useState(false);

    const { members } = useWorkspacePresence(workspaceID);
    const isOwner = members.some(m => m.id === user?.id && m.memberRole === 'owner');

    // navigation functions
    function navTo(page) {
        if (workspaceID) navigate(`/workspace/${workspaceID}/${page}`);
    }

    function isActive(page) {
        return location.pathname.endsWith(`/${page}`);
    }

    return (
        <>
            <nav className="navbar">
                <div className="navbar-brand" onClick={() => navigate('/dashboard')} role="button" tabIndex={0}>
                    <span className="navbar-logo"><Waypoints size={18} strokeWidth={2} /></span>
                    <span className="navbar-name">{appName}</span>
                </div>

                {inWorkspace && (
                    <>
                        <div className="navbar-pages">
                            {WORKSPACE_PAGES.map(page => (
                                <button
                                    key={page.key}
                                    className={`navbar-page-btn ${isActive(page.key) ? 'active' : ''}`}
                                    onClick={() => navTo(page.key)}
                                >
                                    {page.label}
                                </button>
                            ))}
                        </div>

                        <div className="navbar-presence">
                            <button
                                className="navbar-members-btn"
                                onClick={() => setTagsOpen(true)}
                                title="Manage tags"
                            >
                                Tags
                            </button>

                            {isOwner && (
                                <button
                                    className="navbar-members-btn"
                                    onClick={() => setMembersOpen(true)}
                                    title="Manage access"
                                >
                                    + Invite
                                </button>
                            )}

                            {members.map(member => (
                                <div
                                    key={member.id}
                                    className={`navbar-avatar ${member.isOnline ? 'online' : 'offline'}`}
                                    style={{ backgroundColor: getAvatarColor(member) }}
                                    title={member.displayName}
                                >
                                    {getAvatarLetter(member)}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div className="navbar-right" style={{ marginLeft: inWorkspace ? 0 : 'auto' }}>
                    <span className="navbar-user">{user?.displayName ?? user?.username}</span>
                    <button className="navbar-hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                        <span /><span /><span />
                    </button>
                </div>
            </nav>

            <HamburgerMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

            {tagsOpen && workspaceID && (
                <TagManager workspaceID={workspaceID} onClose={() => setTagsOpen(false)} />
            )}

            {membersOpen && workspaceID && (
                <MembersModal workspaceID={workspaceID} onClose={() => setMembersOpen(false)} />
            )}
        </>
    );
}
