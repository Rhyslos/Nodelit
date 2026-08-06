// component imports
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// configuration constants
const EMPTY_FORM = { username: '', displayName: '', password: '', role: 'member' };

// component functions
export default function Admin() {
    const { user } = useAuth();

    // state variables
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState(EMPTY_FORM);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);

    // data fetching
    const load = useCallback(async () => {
        try {
            const data = await api('/api/admin/users');
            setUsers(data.users);
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // event handlers
    function updateField(field, value) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    async function handleCreate(e) {
        e.preventDefault();
        setError('');
        setNotice('');
        setBusy(true);

        try {
            const created = await api('/api/admin/users', { method: 'POST', body: form });
            setForm(EMPTY_FORM);
            setNotice(`Created ${created.username}`);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleDelete(target) {
        const message = target.ownedWorkspaces > 0
            ? `Delete ${target.username}? This also permanently deletes ${target.ownedWorkspaces} workspace(s) they own, including all boards and tasks.`
            : `Delete ${target.username}?`;

        if (!window.confirm(message)) return;

        setError('');
        setNotice('');

        try {
            await api(`/api/admin/users/${target.id}`, { method: 'DELETE' });
            setNotice(`Deleted ${target.username}`);
            await load();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleExport() {
        setError('');
        setNotice('');

        try {
            const data = await api('/api/admin/export');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `nodelit-export-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();

            URL.revokeObjectURL(url);
            setNotice('Export downloaded');
        } catch (err) {
            setError(err.message);
        }
    }

    return (
        <div className="admin-root">
            <div className="admin-head">
                <h1 className="admin-title">Administration</h1>
                <button className="admin-btn" onClick={handleExport}>Export all data</button>
            </div>

            {error && <div className="admin-error">{error}</div>}
            {notice && <div className="admin-notice">{notice}</div>}

            <section className="admin-section">
                <h2 className="admin-subtitle">Create user</h2>

                <form className="admin-form" onSubmit={handleCreate}>
                    <input
                        className="admin-input"
                        placeholder="Username"
                        value={form.username}
                        onChange={e => updateField('username', e.target.value)}
                        autoComplete="off"
                    />
                    <input
                        className="admin-input"
                        placeholder="Display name"
                        value={form.displayName}
                        onChange={e => updateField('displayName', e.target.value)}
                        autoComplete="off"
                    />
                    <input
                        className="admin-input"
                        type="password"
                        placeholder="Password (min 12 characters)"
                        value={form.password}
                        onChange={e => updateField('password', e.target.value)}
                        autoComplete="new-password"
                    />
                    <select
                        className="admin-input"
                        value={form.role}
                        onChange={e => updateField('role', e.target.value)}
                    >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                    </select>
                    <button className="admin-btn" type="submit" disabled={busy}>
                        {busy ? 'Creating…' : 'Create'}
                    </button>
                </form>
            </section>

            <section className="admin-section">
                <h2 className="admin-subtitle">Users ({users.length})</h2>

                {loading ? (
                    <p className="admin-empty">Loading…</p>
                ) : (
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Display name</th>
                                <th>Role</th>
                                <th>Owns</th>
                                <th>Member of</th>
                                <th>Created</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(row => (
                                <tr key={row.id}>
                                    <td>{row.username}</td>
                                    <td>{row.displayName}</td>
                                    <td>{row.role}</td>
                                    <td>{row.ownedWorkspaces}</td>
                                    <td>{row.memberships}</td>
                                    <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        {row.id !== user?.id && (
                                            <button
                                                className="admin-btn admin-btn--danger"
                                                onClick={() => handleDelete(row)}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>
        </div>
    );
}
