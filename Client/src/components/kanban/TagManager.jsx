// component imports
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';

// configuration constants
const PRESET_COLORS = ['#c8502a', '#4a90d9', '#7ab648', '#e6a817', '#9b59b6', '#e84393', '#16a085'];
const BOARD_REFRESH_EVENT = 'nodelit:board-refresh';
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

// component functions
export default function TagManager({ workspaceID, onClose }) {
    // state variables
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [color, setColor] = useState(PRESET_COLORS[0]);
    const [hexDraft, setHexDraft] = useState(PRESET_COLORS[0]);
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

    // event handlers
    function announceChange() {
        window.dispatchEvent(new Event(BOARD_REFRESH_EVENT));
    }

    function pickColor(value) {
        setColor(value);
        setHexDraft(value);
    }

    function commitHexDraft() {
        if (HEX_PATTERN.test(hexDraft)) setColor(hexDraft.toLowerCase());
        else setHexDraft(color);
    }

    async function handleCreate(e) {
        e.preventDefault();
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
        if (!HEX_PATTERN.test(nextColor) || nextColor === tag.color) return;

        try {
            const updated = await api(`/api/kanban/tags/${tag.id}`, {
                method: 'PUT',
                body: { color: nextColor }
            });

            setTags(prev => prev.map(t => t.id === updated.id ? updated : t));
            announceChange();
        } catch (err) {
            setError(err.message);
            load();
        }
    }

    async function handleRename(tag, nextName) {
        if (nextName.trim() === tag.name) return;

        try {
            const updated = await api(`/api/kanban/tags/${tag.id}`, {
                method: 'PUT',
                body: { name: nextName.trim() }
            });

            setTags(prev => prev.map(t => t.id === updated.id ? updated : t));
            announceChange();
        } catch (err) {
            setError(err.message);
            load();
        }
    }

    async function handleDelete(tag) {
        if (!window.confirm('Delete this tag? It will be removed from every list and task.')) return;

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
                        placeholder="Tag name (optional)"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        autoFocus
                    />

                    <div className="tag-color-row">
                        <span className="tag-color-label">Colour</span>

                        {PRESET_COLORS.map(preset => (
                            <button
                                key={preset}
                                type="button"
                                className={`tag-manager-dot ${color === preset ? 'selected' : ''}`}
                                style={{ background: preset }}
                                onClick={() => pickColor(preset)}
                                aria-label={`Use colour ${preset}`}
                            />
                        ))}

                        <input
                            type="color"
                            className="tag-color-input"
                            value={color}
                            onChange={e => pickColor(e.target.value)}
                            title="Pick any colour"
                        />

                        <input
                            type="text"
                            className="tag-color-hex"
                            value={hexDraft}
                            maxLength={7}
                            spellCheck={false}
                            onChange={e => setHexDraft(e.target.value)}
                            onBlur={commitHexDraft}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitHexDraft(); } }}
                        />
                    </div>

                    <button className="modal-submit" type="submit" disabled={busy}>
                        {busy ? 'Adding…' : 'Add tag'}
                    </button>
                </form>

                <div className="tag-manager-list">
                    {loading && <p className="admin-empty">Loading…</p>}

                    {tags.map(tag => (
                        <div className="tag-manager-row" key={tag.id}>
                            <span
                                className={`tag-chip ${tag.name ? '' : 'tag-chip--blank'}`}
                                style={{ background: tag.color }}
                            >
                                {tag.name}
                            </span>

                            <input
                                className="tag-manager-rename"
                                value={tag.name}
                                placeholder="No name"
                                onChange={e => setTags(prev => prev.map(t => t.id === tag.id ? { ...t, name: e.target.value } : t))}
                                onBlur={e => handleRename(tag, e.target.value)}
                            />

                            <input
                                type="color"
                                className="tag-color-input"
                                value={tag.color}
                                onChange={e => handleRecolor(tag, e.target.value)}
                                title="Change colour"
                            />

                            <button
                                className="tag-manager-delete"
                                onClick={() => handleDelete(tag)}
                                aria-label="Delete tag"
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