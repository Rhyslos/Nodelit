// component imports
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';

// configuration constants
const ACCESS_OPTIONS = [
    { value: 'none', label: 'No access' },
    { value: 'viewer', label: 'Read only' },
    { value: 'member', label: 'Can edit' }
];

// component functions
export default function MembersModal({ workspaceID, onClose }) {
    // state variables
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [pending, setPending] = useState(null);

    // data fetching
    const load = useCallback(async () => {
        try {
            const data = await api(`/api/workspaces/${workspaceID}/users`);
            setUsers(data.users);
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [workspaceID]);

    useEffect(() => { load(); }, [load]);

    // event handlers
    async function handleChange(target, value) {
        setPending(target.id);
        setError('');

        try {
            if (value === 'none') {
                await api(`/api/workspaces/${workspaceID}/members/${target.id}`, { method: 'DELETE' });
            } else {
                await api(`/api/workspaces/${workspaceID}/members/${target.id}`, {
                    method: 'PUT',
                    body: { role: value }
                });
            }

            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setPending(null);
        }
    }

    // filter variables
    const query = search.trim().toLowerCase();
    const filtered = query
        ? users.filter(u => u.displayName.toLowerCase().includes(query))
        : users;

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal members-modal" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">Workspace access</h2>

                {error && <p className="modal-error">{error}</p>}

                <input
                    className="admin-input"
                    placeholder="Search people…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoFocus
                />

                {loading ? (
                    <p className="admin-empty">Loading…</p>
                ) : (
                    <div className="members-list">
                        {filtered.map(row => (
                            <div className="members-row" key={row.id}>
                                <span className="members-dot" style={{ background: row.cursorColor }} />

                                <div className="members-identity">
                                    <span className="members-name">{row.displayName}</span>
                                </div>

                                {row.memberRole === 'owner' ? (
                                    <span className="members-owner">Owner</span>
                                ) : (
                                    <select
                                        className="admin-input members-select"
                                        value={row.memberRole ?? 'none'}
                                        disabled={pending === row.id}
                                        onChange={e => handleChange(row, e.target.value)}
                                    >
                                        {ACCESS_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        ))}

                        {filtered.length === 0 && <p className="admin-empty">Nobody matches that.</p>}
                    </div>
                )}

                <div className="modal-actions">
                    <button className="modal-cancel" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
