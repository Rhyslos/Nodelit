// component imports
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

// configuration constants
const EMPTY_FORM = { username: '', displayName: '', password: '', role: 'member' };
const TABS = ['users', 'deleted', 'audit'];

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
    const [tab, setTab] = useState('users');
    const [workspaces, setWorkspaces] = useState([]);
    const [entries, setEntries] = useState([]);

    // data fetching
    const load = useCallback(async () => {
        try {
            const [userData, workspaceData, auditData] = await Promise.all([
                api('/api/admin/users?includeDeleted=true'),
                api('/api/admin/workspaces?includeDeleted=true'),
                api('/api/admin/audit?limit=100')
            ]);

            setUsers(userData.users);
            setWorkspaces(workspaceData.workspaces);
            setEntries(auditData.entries);
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // derived variables
    const activeUsers = users.filter(u => !u.deletedAt);
    const deletedUsers = users.filter(u => u.deletedAt);
    const deletedWorkspaces = workspaces.filter(w => w.deletedAt);

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

    async function run(label, request) {
        setError('');
        setNotice('');

        try {
            await request();
            setNotice(label);
            await load();
        } catch (err) {
            setError(err.message);
        }
    }

    function handleDelete(target) {
        const message = target.ownedWorkspaces > 0
            ? `Delete ${target.username}? This also hides ${target.ownedWorkspaces} workspace(s) they own. Both can be restored from the Deleted tab.`
            : `Delete ${target.username}? This can be undone from the Deleted tab.`;

        if (!window.confirm(message)) return;

        run(`Deleted ${target.username}`, () =>
            api(`/api/admin/users/${target.id}`, { method: 'DELETE' }));
    }

    function handleResetPassword(target) {
        const password = window.prompt(`New password for ${target.username} (at least 12 characters):`);
        if (!password) return;

        run(`Password reset for ${target.username}`, () =>
            api(`/api/admin/users/${target.id}/password`, { method: 'PUT', body: { password } }));
    }

    function handleRestoreUser(target) {
        run(`Restored ${target.username}`, () =>
            api(`/api/admin/users/${target.id}/restore`, { method: 'POST' }));
    }

    function handlePurgeUser(target) {
        if (!window.confirm(`Permanently erase ${target.username} and all their data? This cannot be undone.`)) return;

        run(`Purged ${target.username}`, () =>
            api(`/api/admin/users/${target.id}/purge`, { method: 'DELETE' }));
    }

    function handleRestoreWorkspace(target) {
        run(`Restored ${target.name}`, () =>
            api(`/api/admin/workspaces/${target.id}/restore`, { method: 'POST' }));
    }

    function handlePurgeWorkspace(target) {
        if (!window.confirm(`Permanently erase ${target.name} and all its boards? This cannot be undone.`)) return;

        run(`Purged ${target.name}`, () =>
            api(`/api/admin/workspaces/${target.id}/purge`, { method: 'DELETE' }));
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

            <div className="admin-tabs">
                {TABS.map(name => (
                    <button
                        key={name}
                        className={`admin-tab ${tab === name ? 'active' : ''}`}
                        onClick={() => setTab(name)}
                    >
                        {name}
                    </button>
                ))}
            </div>

            {loading && <p className="admin-empty">Loading…</p>}

            {!loading && tab === 'users' && (
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
                        {activeUsers.map(row => (
                            <tr key={row.id}>
                                <td>{row.username}</td>
                                <td>{row.displayName}</td>
                                <td>{row.role}</td>
                                <td>{row.ownedWorkspaces}</td>
                                <td>{row.memberships}</td>
                                <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                                <td className="admin-actions">
                                    <button className="admin-btn" onClick={() => handleResetPassword(row)}>
                                        Reset password
                                    </button>
                                    {row.id !== user?.id && (
                                        <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(row)}>
                                            Delete
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {!loading && tab === 'deleted' && (
                <>
                    <h2 className="admin-subtitle">Deleted users ({deletedUsers.length})</h2>

                    {deletedUsers.length === 0 ? (
                        <p className="admin-empty">Nothing deleted.</p>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr><th>Username</th><th>Role</th><th>Deleted</th><th /></tr>
                            </thead>
                            <tbody>
                                {deletedUsers.map(row => (
                                    <tr key={row.id}>
                                        <td>{row.username}</td>
                                        <td>{row.role}</td>
                                        <td>{new Date(row.deletedAt).toLocaleString()}</td>
                                        <td className="admin-actions">
                                            <button className="admin-btn" onClick={() => handleRestoreUser(row)}>Restore</button>
                                            <button className="admin-btn admin-btn--danger" onClick={() => handlePurgeUser(row)}>Purge</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    <h2 className="admin-subtitle admin-spaced">Deleted workspaces ({deletedWorkspaces.length})</h2>

                    {deletedWorkspaces.length === 0 ? (
                        <p className="admin-empty">Nothing deleted.</p>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr><th>Name</th><th>Owner</th><th>Members</th><th>Deleted</th><th /></tr>
                            </thead>
                            <tbody>
                                {deletedWorkspaces.map(row => (
                                    <tr key={row.id}>
                                        <td>{row.name}</td>
                                        <td>{row.ownerName ?? '—'}</td>
                                        <td>{row.memberCount}</td>
                                        <td>{new Date(row.deletedAt).toLocaleString()}</td>
                                        <td className="admin-actions">
                                            <button className="admin-btn" onClick={() => handleRestoreWorkspace(row)}>Restore</button>
                                            <button className="admin-btn admin-btn--danger" onClick={() => handlePurgeWorkspace(row)}>Purge</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}

            {!loading && tab === 'audit' && (
                <table className="admin-table">
                    <thead>
                        <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>IP</th></tr>
                    </thead>
                    <tbody>
                        {entries.map(row => (
                            <tr key={row.id}>
                                <td>{new Date(row.createdAt).toLocaleString()}</td>
                                <td>{row.actorName ?? '—'}</td>
                                <td>{row.action}</td>
                                <td>{row.targetID ?? '—'}</td>
                                <td>{row.ip ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
