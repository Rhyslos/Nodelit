// component imports
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Globe, Users, Lock } from 'lucide-react';
import { api } from '../../lib/api';
import { PALETTE } from '../../lib/color';
import { usePalette } from '../../hooks/usePalette';
import ColorPicker from '../colorpicker/ColorPicker';
import ColorPickerPopover from '../colorpicker/ColorPickerPopover';

// configuration constants
const BOARD_REFRESH_EVENT = 'nodelit:board-refresh';
const PUBLIC_SCOPE = 'public';
const ACTIVE_TAB_STORAGE_PREFIX = 'nodelit:activetab:';

// utility functions
function buildSections(tags, tabs, tabGroups) {
    const sections = [];
    const placed = new Set();

    const publicTags = tags.filter(tag => !tag.tabID && !tag.groupID);

    if (publicTags.length > 0) {
        sections.push({
            key: PUBLIC_SCOPE,
            label: 'Public — every tab',
            icon: <Globe size={12} strokeWidth={2} />,
            tags: publicTags
        });

        for (const tag of publicTags) placed.add(tag.id);
    }

    for (const group of tabGroups) {
        const groupTags = tags.filter(tag => tag.groupID === group.id);
        if (groupTags.length === 0) continue;

        sections.push({
            key: `group:${group.id}`,
            label: group.name,
            icon: <Users size={12} strokeWidth={2} />,
            tags: groupTags
        });

        for (const tag of groupTags) placed.add(tag.id);
    }

    for (const tab of tabs) {
        const tabTags = tags.filter(tag => tag.tabID === tab.id);
        if (tabTags.length === 0) continue;

        sections.push({
            key: `tab:${tab.id}`,
            label: tab.name,
            icon: <Lock size={12} strokeWidth={2} />,
            tags: tabTags
        });

        for (const tag of tabTags) placed.add(tag.id);
    }

    const orphans = tags.filter(tag => !placed.has(tag.id));

    if (orphans.length > 0) {
        sections.push({
            key: 'orphaned',
            label: 'Archived tabs',
            icon: <Lock size={12} strokeWidth={2} />,
            tags: orphans
        });
    }

    return sections;
}

function scopeKey(tag) {
    if (tag.tabID) return `tab:${tag.tabID}`;
    if (tag.groupID) return `group:${tag.groupID}`;
    return PUBLIC_SCOPE;
}

function defaultScope(workspaceID, tabs) {
    try {
        const stored = localStorage.getItem(`${ACTIVE_TAB_STORAGE_PREFIX}${workspaceID}`);
        if (stored && tabs.some(tab => tab.id === stored)) return `tab:${stored}`;
    } catch {
        return PUBLIC_SCOPE;
    }

    return tabs.length > 0 ? `tab:${tabs[0].id}` : PUBLIC_SCOPE;
}

function scopeBody(key) {
    if (key.startsWith('tab:')) return { tabID: key.slice(4), groupID: null };
    if (key.startsWith('group:')) return { tabID: null, groupID: key.slice(6) };
    return { tabID: null, groupID: null };
}

// component functions
export default function TagManager({ workspaceID, onClose }) {
    const { palette, saveColor, forgetColor } = usePalette();

    // state variables
    const [tags, setTags] = useState([]);
    const [tabs, setTabs] = useState([]);
    const [tabGroups, setTabGroups] = useState([]);
    const [scope, setScope] = useState(PUBLIC_SCOPE);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [color, setColor] = useState(PALETTE[0]);
    const [rowPicker, setRowPicker] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    // data fetching
    const load = useCallback(async () => {
        try {
            const data = await api(`/api/kanban/tags/${workspaceID}`);
            setTags(data.tags);
            const openTabs = (data.tabs ?? []).filter(tab => !tab.isArchived);

            setTabs(openTabs);
            setTabGroups(data.tabGroups ?? []);
            setScope(current => current === PUBLIC_SCOPE ? defaultScope(workspaceID, openTabs) : current);
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

    async function handleCreate(e) {
        e.preventDefault();
        setError('');
        setBusy(true);

        try {
            const tag = await api('/api/kanban/tags', {
                method: 'POST',
                body: { workspaceID, name: name.trim(), color, ...scopeBody(scope) }
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
        if (nextColor === tag.color) return;

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

    async function handleRescope(tag, nextScope) {
        if (nextScope === scopeKey(tag)) return;

        try {
            const updated = await api(`/api/kanban/tags/${tag.id}`, {
                method: 'PUT',
                body: { scope: scopeBody(nextScope) }
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

    // render functions
    function renderTagRow(tag) {
        return (
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

                <select
                    className="tag-manager-scope"
                    value={scopeKey(tag)}
                    onChange={e => handleRescope(tag, e.target.value)}
                    title="Where this tag is visible"
                >
                    <option value={PUBLIC_SCOPE}>Everywhere</option>

                    {tabGroups.map(group => (
                        <option key={group.id} value={`group:${group.id}`}>{group.name}</option>
                    ))}

                    {tabs.map(tab => (
                        <option key={tab.id} value={`tab:${tab.id}`}>{tab.name}</option>
                    ))}
                </select>

                <button
                    type="button"
                    className="tag-manager-swatch"
                    style={{ background: tag.color }}
                    title="Change colour"
                    aria-label="Change colour"
                    onClick={e => setRowPicker({ id: tag.id, color: tag.color, rect: e.currentTarget.getBoundingClientRect() })}
                />

                <button
                    className="tag-manager-delete"
                    onClick={() => handleDelete(tag)}
                    aria-label="Delete tag"
                >
                    <Trash2 size={14} strokeWidth={2} />
                </button>
            </div>
        );
    }

    // derived variables
    const sections = buildSections(tags, tabs, tabGroups);

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

                    <div className="tag-scope-row">
                        <label className="tag-color-label" htmlFor="tag-scope">Visible in</label>

                        <select
                            id="tag-scope"
                            className="tag-manager-scope"
                            value={scope}
                            onChange={e => setScope(e.target.value)}
                        >
                            <option value={PUBLIC_SCOPE}>Everywhere (public)</option>

                            {tabGroups.length > 0 && (
                                <optgroup label="Tab groups">
                                    {tabGroups.map(group => (
                                        <option key={group.id} value={`group:${group.id}`}>{group.name}</option>
                                    ))}
                                </optgroup>
                            )}

                            {tabs.length > 0 && (
                                <optgroup label="Tabs">
                                    {tabs.map(tab => (
                                        <option key={tab.id} value={`tab:${tab.id}`}>{tab.name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    <div className="tag-color-block">
                        <span className="tag-color-label">Colour</span>

                        <ColorPicker
                            value={color}
                            presets={PALETTE}
                            saved={palette}
                            onChange={setColor}
                            onSave={saveColor}
                            onForget={forgetColor}
                        />
                    </div>

                    <button className="modal-submit" type="submit" disabled={busy}>
                        {busy ? 'Adding…' : 'Add tag'}
                    </button>
                </form>

                <div className="tag-manager-list">
                    {loading && <p className="admin-empty">Loading…</p>}

                    {sections.map(section => (
                        <div className="tag-manager-section" key={section.key}>
                            <span className="tag-manager-section-title">
                                {section.icon}
                                {section.label}
                                <span className="tag-manager-section-count">{section.tags.length}</span>
                            </span>

                            {section.tags.map(tag => renderTagRow(tag))}
                        </div>
                    ))}

                    {!loading && tags.length === 0 && (
                        <p className="admin-empty">No tags yet.</p>
                    )}
                </div>

                <div className="modal-actions">
                    <button className="modal-cancel" onClick={onClose}>Done</button>
                </div>

                {rowPicker && (
                    <ColorPickerPopover
                        anchorRect={rowPicker.rect}
                        align="right"
                        value={rowPicker.color}
                        presets={PALETTE}
                        saved={palette}
                        onChange={next => setRowPicker(current => ({ ...current, color: next }))}
                        onCommit={next => handleRecolor({ id: rowPicker.id, color: rowPicker.color }, next)}
                        onSave={saveColor}
                        onForget={forgetColor}
                        onClose={() => setRowPicker(null)}
                    />
                )}
            </div>
        </div>,
        document.body
    );
}