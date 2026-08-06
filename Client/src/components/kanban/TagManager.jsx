// component imports
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';

// configuration constants
const PRESET_COLORS = ['#c8502a', '#4a90d9', '#7ab648', '#e6a817', '#9b59b6', '#e84393', '#16a085'];
const BOARD_REFRESH_EVENT = 'nodelit:board-refresh';

// component functions
export default function TagManager({ workspaceID, onClose }) {
    // state variables
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // data fetching
    const load = useCallback(async () => {
        try {
            const data = await api(`/api/kanban/tags/${workspaceID}`);
            setTags(data.tags);
            setError('');
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [workspaceID]);

    useEffect(() => { load(); }, [load]);

    function announceChange() {
        window.dispatchEvent(new Event(BOARD_REFRESH_EVENT));
    }

    // event handlers
    async function handleCreate(e) {
        e.preventDefault();

        if (!name.trim()) {
            setError('Give the tag a name');
            return;
        }

        setError('');
        setBusy(true);

        try {
            const tag = await api('/api/kanban/tags', {
                method: 'POST',
                body: { workspaceID, name: name.trim(), color }
            });

            setTags(prev => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
            setName('');
            announceChange();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    async function handleRecolor(tag, nextColor) {
        try {
            const updated = await api(`/api/kanban/tags/${tag.id}`, {
                method: 'PUT',
                body: { color: nextColor }
            });

            setTags(prev => prev.map(t => t.id === updated.id ? updated : t));
            announceChange();
        } catch (err) {
            setError(err.message);
        }
    }

    async function handleDelete(tag) {
        if (!window.confirm(`Delete the tag "${tag.name}"? It will be removed from every list and task.`)) return;

        try {
            await api(`/api/kanban/tags/${tag.id}`, { method: 'DELETE' });

            setTags(prev => prev.filter(t => t.id !== tag.id));
            announceChange();
        } catch (err) {
            setError(err.message);
        }
    }

    return createPortal(
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal tag-manager" onClick={e => e.stopPropagation()}>
                <h2 className="modal-title">Tags</h2>

                {error && <p className="modal-error">{error}</p>}

                <form className="tag-manager-form" onSubmit={handleCreate}>
                    <input
                        className="admin-input"
                        placeholder="Tag name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        autoFocus
                    />

                    <div className="modal-colors">
                        {PRESET_COLORS.map(preset => (
                            <button
                                key={preset}
                                type="button"
                                className={`modal-color-dot ${color === preset ? 'selected' : ''}`}
                                style={{ background: preset }}
                                onClick={() => setColor(preset)}
                                aria-label={`Use colour ${preset}`}
                            />
                        ))}
                    </div>

                    <button className="modal-submit" type="submit" disabled={busy}>
                        {busy ? 'Adding…' : 'Add tag'}
                    </button>
                </form>

                <div className="tag-manager-list">
                    {loading && <p className="admin-empty">Loading…</p>}

                    {tags.map(tag => (
                        <div className="tag-manager-row" key={tag.id}>
                            <span className="tag-chip" style={{ background: tag.color }}>{tag.name}</span>

                            <div className="tag-manager-colors">
                                {PRESET_COLORS.map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        className={`tag-manager-dot ${tag.color === preset ? 'selected' : ''}`}
                                        style={{ background: preset }}
                                        onClick={() => handleRecolor(tag, preset)}
                                        aria-label={`Recolour ${tag.name}`}
                                    />
                                ))}
                            </div>

                            <button
                                className="tag-manager-delete"
                                onClick={() => handleDelete(tag)}
                                aria-label={`Delete ${tag.name}`}
                            >
                                <Trash2 size={14} strokeWidth={2} />
                            </button>
                        </div>
                    ))}

                    {!loading && tags.length === 0 && (
                        <p className="admin-empty">No tags yet.</p>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="modal-cancel" onClick={onClose}>Done</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
